# frozen_string_literal: true

module Research
  class System
    BAR_FIELDS = Set.new(%w[open high low close volume]).freeze

    private attr_reader :payload, :dictionary

    def initialize(payload, dictionary:)
      @payload    = payload
      @dictionary = dictionary
    end

    def id           = payload['id'].to_s
    def name         = payload['name'].to_s
    def strategy_key = id

    def modules
      @modules ||= normalize_modules(payload.fetch('modules'))
    end

    def runtime_params
      @runtime_params ||= begin
        result = {}
        modules.each do |module_name, module_params|
          module_params.each do |param_key, value|
            result[module_param_key(module_name, param_key)] = to_numeric(value)
          end
        end
        (payload['params'] || {}).each { |key, val| result[key.to_sym] = to_numeric(val) }
        result[:position_mode] = result[:position_mode].presence || 'long_short'
        if (primary_period = primary_module_params['period'])
          result[:module_period] = to_numeric(primary_period)
        end
        result[:module_type] = primary_module_name if primary_module_name.present?
        result
      end
    end

    def optimization_targets
      @optimization_targets ||= begin
        targets = Array(payload.dig('optimization', 'targets'))
        targets = [ default_module_target ].compact if targets.empty?
        targets.map { |t| { value: t, label: target_label(t) } }
      end
    end

    def default_optimization_target
      optimization_targets.first&.fetch(:value, nil) || default_module_target
    end

    def metadata
      {
        id: id,
        name: name,
        module: { name: primary_module_name, params: primary_module_params },
        modules: modules.transform_values(&:dup),
        params: system_params,
        conditions: payload['conditions'].keys,
        optimization_targets: optimization_targets
      }
    end

    def run_params(params)
      p = params.to_h.symbolize_keys
      result = {
        system_id: id,
        system_name: name,
        module_type: primary_module_name,
        position_mode: p[:position_mode].presence || 'long_short'
      }
      result[:module_period] = to_numeric(p[module_param_key(primary_module_name, 'period')]) if primary_module_name && p.key?(module_param_key(primary_module_name, 'period'))
      modules.each do |module_name, module_params|
        module_params.each_key do |param_key|
          flat_key = module_param_key(module_name, param_key)
          result[flat_key] = to_numeric(p.fetch(flat_key))
        end
      end
      p.each do |key, val|
        next if module_param_keys.include?(key) || key == :position_mode
        result[key] = to_numeric(val)
      end
      result
    end

    def system_params
      runtime_params.except(:module_period, :module_type, *module_param_keys)
    end

    def primary_module
      { name: primary_module_name, params: primary_module_params }
    end

    def optimization_param_key(target)
      t = target.presence || default_optimization_target
      return t.delete_prefix('params.').to_sym if t.start_with?('params.')
      return module_param_key(*t.split('.', 2)) if t.include?('.')

      raise ArgumentError, "Unsupported optimization target: #{target}"
    end

    def signals_for(prev_row:, row:, params:)
      signal_evaluator.call(prev_row: prev_row, row: row, params: params)
    end

    def module_runtime_configs(params)
      p = params.to_h.symbolize_keys
      modules.each_with_object({}) do |(module_name, module_params), result|
        result[module_name] = {
          type: module_name,
          params: module_params.each_with_object({}) do |(param_key, default_value), acc|
            acc[param_key.to_sym] = to_numeric(p.fetch(module_param_key(module_name, param_key), default_value))
          end
        }
      end
    end

    private

    def signal_evaluator
      @signal_evaluator ||= Research::SignalEvaluator.new(
        parsed_conditions,
        resolver: method(:resolve_reference)
      )
    end

    def parsed_conditions
      @parsed_conditions ||= payload.fetch('conditions').to_h.transform_values do |expression|
        Research::Dsl::ConditionExpression::Parser.new(expression.to_s).parse
      end
    end

    def resolve_reference(ref, row:, params:)
      reference = ref.to_s
      return to_f_or_nil(row.dig(:bar, reference.to_sym)) if BAR_FIELDS.include?(reference)
      return to_f_or_nil(params[reference.delete_prefix('params.').to_sym]) if reference.start_with?('params.')

      module_name, attribute = reference.split('.', 2)
      return nil unless attribute == 'value'

      to_f_or_nil(row.dig(:result, module_name.to_sym, :value))
    end

    def target_label(target)
      return dictionary.dig('params', target.delete_prefix('params.'), 'label') if target.start_with?('params.')

      module_name, param_key = target.split('.', 2)
      param_label = dictionary.dig('modules', 'types', module_name, 'params', param_key, 'label')
      param_label || param_key
    end

    def primary_module_name
      modules.keys.first
    end

    def primary_module_params
      modules[primary_module_name] || {}
    end

    def default_module_target
      module_name = primary_module_name
      param_key = primary_module_params.keys.first
      module_name && param_key ? "#{module_name}.#{param_key}" : nil
    end

    def module_param_key(module_name, param_key)
      :"#{module_name}_#{param_key}"
    end

    def module_param_keys
      @module_param_keys ||= modules.flat_map do |module_name, module_params|
        module_params.keys.map { |param_key| module_param_key(module_name, param_key) }
      end
    end

    def normalize_modules(raw_modules)
      raw_modules.each_with_object({}) do |(module_name, module_payload), result|
        result[module_name.to_s] = module_payload.to_h.transform_keys(&:to_s)
      end
    end

    def to_f_or_nil(value)
      f = Float(value)
      f.finite? ? f : nil
    rescue ArgumentError, TypeError
      nil
    end

    def to_numeric(value)
      Float(value)
    rescue ArgumentError, TypeError
      value
    end
  end
end
