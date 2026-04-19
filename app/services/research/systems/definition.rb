# frozen_string_literal: true

module Research
  module Systems
    class Definition
      BAR_FIELDS = Set.new(%w[open high low close volume]).freeze
      MACRO_FIELDS = Set.new(MacroConfig.indicator_keys).freeze

      private attr_reader :payload, :schema

      def initialize(payload, schema:)
        @payload = payload
        @schema = schema
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
          modules.each do |module_name, module_config|
            module_params(module_config).each do |param_key, value|
              result[module_param_key(module_name, param_key)] = to_numeric(value)
            end
          end
          (payload['params'] || {}).each { |key, val| result[key.to_sym] = to_numeric(val) }
          result[:position_mode] = result[:position_mode].presence || 'long_short'
          result
        end
      end

      def optimization_targets
        @optimization_targets ||= begin
          targets = Array(payload.dig('optimization', 'targets'))
          targets = [ default_module_target ].compact if targets.empty?
          targets.map { |target| { value: target, label: target_label(target) } }
        end
      end

      def default_optimization_target = optimization_targets.first&.fetch(:value, nil) || default_module_target

      def metadata
        {
          id:,
          name:,
          modules: modules.transform_values(&:dup),
          params: system_params,
          conditions: payload['conditions'].keys,
          optimization_targets: optimization_targets
        }
      end

      def run_params(params)
        runtime_params = params.to_h.symbolize_keys
        result = {
          system_id: id,
          system_name: name,
          position_mode: runtime_params[:position_mode].presence || 'long_short'
        }

        modules.each do |module_name, module_config|
          module_params(module_config).each_key do |param_key|
            flat_key = module_param_key(module_name, param_key)
            result[flat_key] = to_numeric(runtime_params.fetch(flat_key))
          end
        end

        runtime_params.each do |key, value|
          next if module_param_keys.include?(key) || key == :position_mode

          result[key] = to_numeric(value)
        end

        result
      end

      def system_params = runtime_params.except(*module_param_keys)

      def optimization_param_key(target)
        resolved_target = target.presence || default_optimization_target
        return resolved_target.delete_prefix('params.').to_sym if resolved_target.start_with?('params.')
        return module_param_key(*resolved_target.split('.', 2)) if resolved_target.include?('.')

        raise ArgumentError, "Unsupported optimization target: #{target}"
      end

      def signal_for(name, prev_row:, row:, params:) = signal_evaluator.call(name:, prev_row:, row:, params:)

      def referenced_macro_keys
        @referenced_macro_keys ||= parsed_conditions.flat_map do |_, ast|
          Research::Systems::ConditionExpression::Ast.references(ast)
        end.select { |ref| MACRO_FIELDS.include?(ref) }.uniq
      end

      def module_runtime_configs(params)
        runtime_params = params.to_h.symbolize_keys

        modules.each_with_object({}) do |(module_name, module_config), result|
          result[module_name] = {
            type: module_type(module_config),
            params: module_params(module_config).each_with_object({}) do |(param_key, default_value), acc|
              acc[param_key.to_sym] = to_numeric(runtime_params.fetch(module_param_key(module_name, param_key), default_value))
            end
          }
        end
      end

      private

      def signal_evaluator
        @signal_evaluator ||= Research::Runtime::SignalEvaluator.new(
          parsed_conditions,
          resolver: method(:resolve_reference)
        )
      end

      def parsed_conditions
        @parsed_conditions ||= payload.fetch('conditions').to_h.transform_values do |expression|
          Research::Systems::ConditionExpression::Parser.new(expression.to_s).parse
        end
      end

      def resolve_reference(ref, row:, params:, row_offset: 0)
        reference = ref.to_s
        return to_f_or_nil(resolve_row_value(row, row_offset, :bar, reference.to_sym)) if BAR_FIELDS.include?(reference)
        return to_f_or_nil(params[reference.delete_prefix('params.').to_sym]) if reference.start_with?('params.')
        return to_f_or_nil(row.macro_value(reference, row_offset)) if MACRO_FIELDS.include?(reference)

        module_name, attribute = reference.split('.', 2)
        return nil unless attribute == 'value'

        to_f_or_nil(resolve_row_value(row, row_offset, :result, module_name.to_sym, :value))
      end

      def target_label(target)
        return schema.dig('params', target.delete_prefix('params.'), 'label') if target.start_with?('params.')

        module_name, param_key = target.split('.', 2)
        return humanize_token(param_key) unless modules.key?(module_name)

        "#{humanize_token(module_name)} #{humanize_token(param_key)}"
      end

      def module_param_key(module_name, param_key) = :"#{module_name}_#{param_key}"

      def module_param_keys
        @module_param_keys ||= modules.flat_map do |module_name, module_config|
          module_params(module_config).keys.map { |param_key| module_param_key(module_name, param_key) }
        end
      end

      def normalize_modules(raw_modules)
        raw_modules.each_with_object({}) do |(module_name, module_payload), result|
          result[module_name.to_s] = module_payload.to_h.transform_keys(&:to_s)
        end
      end

      def module_type(module_config) = module_config.to_h['type'].to_s
      def module_params(module_config) = module_config.to_h.except('type')

      def default_module_target
        modules.filter_map do |module_name, module_config|
          param_key = module_params(module_config).keys.first
          "#{module_name}.#{param_key}" if param_key
        end.first
      end

      def humanize_token(value) = value.to_s.tr('_', ' ').split.map(&:capitalize).join(' ')

      def to_f_or_nil(value)
        numeric = Float(value)
        numeric.finite? ? numeric : nil
      rescue ArgumentError, TypeError
      end

      def resolve_row_value(row, row_offset, *path)
        offset = row_offset.to_i
        return row.dig(*path) if offset.zero?
        row.dig_at(offset, *path) if row.respond_to?(:dig_at)
      end

      def to_numeric(value)
        Float(value)
      rescue ArgumentError, TypeError
        value
      end
    end
  end
end
