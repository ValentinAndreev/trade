# frozen_string_literal: true

module Ml
  class Cancelled < StandardError; end unless const_defined?(:Cancelled, false)

  class FeatureWindow
    class Error < StandardError
      attr_reader :code, :details

      def initialize(message, code:, details: {})
        @code = code
        @details = details
        super(message)
      end
    end

    DEFAULT_FEATURE_SPEC = [
      { 'type' => 'log_return', 'params' => { 'period' => 1 } },
      { 'type' => 'rolling_volatility', 'params' => { 'period' => 20 } },
      { 'type' => 'range_position', 'params' => { 'period' => 20 } },
      { 'type' => 'rolling_zscore', 'params' => { 'period' => 20 } },
      { 'type' => 'percentile_rank', 'params' => { 'period' => 20 } },
      { 'type' => 'trend_regime_score', 'params' => { 'period' => 20 } },
      { 'type' => 'vol_regime_score', 'params' => { 'short_period' => 20, 'long_period' => 100 } },
      { 'type' => 'vol_adjust', 'params' => { 'period' => 20, 'field' => 'close', 'epsilon' => 0.00000001 } }
    ].freeze

    def self.default_feature_spec = DEFAULT_FEATURE_SPEC.map(&:deep_dup)

    def initialize(feature_spec: nil)
      @raw_feature_spec = Array(feature_spec.presence || self.class.default_feature_spec)
    end

    def resolved_feature_spec
      @resolved_feature_spec ||= begin
        resolved = raw_feature_spec.each_with_index.map { |entry, index| resolve_entry(entry, index) }
        ensure_unique_feature_names!(resolved)
        resolved
      end
    end

    def effective_window
      resolved_feature_spec.map { |entry| [ entry.fetch('warmup'), entry.fetch('lookback') ].max }.max || 0
    end

    def feature_names
      resolved_feature_spec.flat_map { |entry| entry.fetch('feature_names').values }
    end

    private

    attr_reader :raw_feature_spec

    def resolve_entry(entry, index)
      payload = entry.to_h.deep_stringify_keys
      type = (payload['type'] || payload['key']).to_s
      raise Error.new('feature type is required', code: :missing_type, details: { index: }) if type.blank?

      definition = indicator_definition(type)
      metadata = indicator_metadata(type)
      validate_metadata!(type, metadata)
      concrete_params = resolve_params(type, definition.fetch(:params), payload.fetch('params', payload.except('type', 'name', 'alias', 'output', 'outputs')))
      outputs = resolve_outputs(type, payload, metadata)
      lookahead = metadata.fetch('lookahead').to_i
      raise Error.new("feature module #{type} has positive lookahead", code: :positive_lookahead, details: { type: }) if lookahead.positive?

      warmup = IndicatorsConfig.warmup_for(type, concrete_params)
      {
        'name' => payload['name'] || payload['alias'] || type,
        'type' => type,
        'params' => concrete_params.deep_stringify_keys,
        'outputs' => outputs,
        'feature_names' => feature_names_for(payload, type, outputs),
        'module_version' => metadata.fetch('module_version'),
        'definition_checksum' => metadata.fetch('definition_checksum'),
        'warmup' => warmup,
        'lookback' => warmup,
        'lookahead' => lookahead,
        'output_fields' => metadata.fetch('output_fields'),
        'label' => definition.fetch(:label),
        'description' => metadata['description'],
        'formula' => metadata['formula'],
        'heuristic' => metadata['heuristic']
      }.compact
    end

    def indicator_definition(type)
      IndicatorsConfig.all.fetch(type.to_sym)
    rescue KeyError
      raise Error.new("unknown feature module: #{type}", code: :unknown_module, details: { type: })
    end

    def indicator_metadata(type)
      IndicatorsConfig.schema_metadata_for(type)
    end

    def validate_metadata!(type, metadata)
      missing = %w[module_version definition_checksum output_fields warmup lookahead].reject { |key| metadata.key?(key) }
      return if missing.empty?

      raise Error.new(
        "feature module #{type} is missing ML metadata: #{missing.join(', ')}",
        code: :missing_metadata,
        details: { type:, missing: }
      )
    end

    def resolve_params(type, params_definition, raw_params)
      raw = raw_params.to_h.deep_symbolize_keys
      params_definition.each_with_object({}) do |(key, param), result|
        raw_value = raw.key?(key) ? raw[key] : param.default
        if raw_value.nil?
          raise Error.new("#{type}.#{key} is required", code: :missing_param, details: { type:, param: key }) if param.required

          next
        end

        value = coerce_param(raw_value, param)
        validate_param!(type, key, value, param)
        result[key] = value
      end
    end

    def coerce_param(value, param)
      case param.type
      when :integer then value.to_i
      when :number then value.to_f
      when :enum then value.to_s
      else value
      end
    end

    def validate_param!(type, key, value, param)
      raise Error.new("#{type}.#{key} must be >= #{param.min}", code: :param_min, details: { type:, param: key }) if param.min && value.to_f < param.min.to_f
      raise Error.new("#{type}.#{key} must be <= #{param.max}", code: :param_max, details: { type:, param: key }) if param.max && value.to_f > param.max.to_f

      allowed = param.values
      return unless allowed.is_a?(Array)
      return if allowed.map(&:to_s).include?(value.to_s)

      raise Error.new("#{type}.#{key} must be one of: #{allowed.join(', ')}", code: :param_enum, details: { type:, param: key })
    end

    def resolve_outputs(type, payload, metadata)
      requested = if payload.key?('outputs')
        Array(payload.fetch('outputs'))
      elsif payload.key?('output')
        [ payload.fetch('output') ]
      else
        Array(metadata.fetch('output_fields'))
      end.map(&:to_s)
      allowed = Array(metadata.fetch('output_fields')).map(&:to_s)
      unsupported = requested - allowed
      if unsupported.any?
        raise Error.new(
          "#{type} does not expose output fields: #{unsupported.join(', ')}",
          code: :unsupported_output,
          details: { type:, unsupported:, allowed: }
        )
      end
      requested
    end

    def feature_names_for(payload, type, outputs)
      base_name = payload['name'] || payload['alias'] || type
      outputs.index_with do |output|
        if outputs.one? && output == 'value'
          base_name
        else
          "#{base_name}.#{output}"
        end
      end
    end

    def ensure_unique_feature_names!(resolved)
      names = resolved.flat_map { |entry| entry.fetch('feature_names').values }
      duplicates = names.tally.select { |_, count| count > 1 }.keys
      return if duplicates.empty?

      raise Error.new("duplicate feature names: #{duplicates.join(', ')}", code: :duplicate_feature_names, details: { duplicates: })
    end
  end
end
