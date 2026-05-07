# frozen_string_literal: true

module Ml
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
        resolved = []
        raw_feature_spec.each_with_index { |entry, index| resolved << resolve_entry(entry, index, resolved) }
        ensure_unique_feature_names!(resolved)
        resolved
      end
    end

    def effective_window
      self.class.effective_window_for(resolved_feature_spec)
    end

    def self.effective_window_for(resolved_feature_spec)
      windows_by_name = {}
      resolved_feature_spec.map do |entry|
        warmup = entry.fetch('warmup', 0).to_i
        stored_lookback = entry.fetch('lookback', 0).to_i
        dependency_lookback = dependency_window_for(entry.fetch('params', {}), windows_by_name)
        effective_lookback = [ stored_lookback, warmup + dependency_lookback ].max
        windows_by_name[entry.fetch('name')] = effective_lookback
        effective_lookback
      end.max || 0
    end

    def feature_names
      resolved_feature_spec.flat_map { |entry| entry.fetch('feature_names').values }
    end

    private

    attr_reader :raw_feature_spec

    def resolve_entry(entry, index, resolved_entries)
      payload = entry.to_h.deep_stringify_keys
      type = payload['type'].to_s
      raise Error.new('feature type is required', code: :missing_type, details: { index: }) if type.blank?

      definition = indicator_definition(type)
      metadata = indicator_metadata(type)
      validate_metadata!(type, metadata)
      params_definition = definition.fetch(:params)
      concrete_params = resolve_params(type, params_definition, raw_params_for(payload, params_definition))
      outputs = resolve_outputs(type, payload, metadata)
      lookahead = metadata.fetch('lookahead').to_i
      raise Error.new("feature module #{type} has positive lookahead", code: :positive_lookahead, details: { type: }) if lookahead.positive?

      warmup = IndicatorsConfig.warmup_for(type, concrete_params)
      params = concrete_params.deep_stringify_keys
      lookback = warmup + self.class.dependency_window_for(params, resolved_entries.to_h { |resolved| [ resolved.fetch('name'), resolved.fetch('lookback') ] })
      {
        'name' => payload['name'].presence || type,
        'type' => type,
        'params' => params,
        'outputs' => outputs,
        'feature_names' => feature_names_for(payload, type, outputs),
        'module_version' => metadata.fetch('module_version'),
        'definition_checksum' => metadata.fetch('definition_checksum'),
        'warmup' => warmup,
        'lookback' => lookback,
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

    def raw_params_for(payload, params_definition)
      return payload.fetch('params') if payload.key?('params')

      payload.slice(*params_definition.keys.map(&:to_s))
    end

    def resolve_params(type, params_definition, raw_params)
      raw = raw_params
      params_definition.each_with_object({}) do |(key, param), result|
        raw_key = key.to_s
        raw_value = raw.key?(raw_key) ? raw.fetch(raw_key) : param.default
        if raw_value.nil?
          raise Error.new("#{type}.#{key} is required", code: :missing_param, details: { type:, param: key }) if param.required

          next
        end

        value = param.coerce!(raw_value, key:)
        validate_param!(type, key, value, param)
        result[key] = value
      end
    end

    def validate_param!(type, key, value, param)
      raise Error.new("#{type}.#{key} must be >= #{param.min}", code: :param_min, details: { type:, param: key }) if param.min && value.to_f < param.min.to_f
      raise Error.new("#{type}.#{key} must be <= #{param.max}", code: :param_max, details: { type:, param: key }) if param.max && value.to_f > param.max.to_f

      allowed = param.values
      return if allowed.nil?
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
      if requested.empty?
        raise Error.new(
          "#{type} must request at least one output field",
          code: :empty_outputs,
          details: { type: }
        )
      end

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
      base_name = payload['name'].presence || type
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

    class << self
      def dependency_window_for(params, windows_by_name)
        [ params['input'], params['left'], params['right'] ].compact.map do |reference|
          reference.fetch('kind') == 'module' ? windows_by_name.fetch(reference.fetch('module_ref')) : 0
        end.max || 0
      end
    end
  end
end
