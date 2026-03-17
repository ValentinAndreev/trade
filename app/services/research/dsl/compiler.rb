# frozen_string_literal: true

module Research
  module Dsl
    class Compiler
      def initialize(dictionary:)
        @dictionary = dictionary
      end

      def compile(payload)
        module_payload = payload.fetch('module')
        params_payload = (payload['params'] || {}).transform_keys(&:to_s)

        Research::Dsl::CompiledSystem.new(
          id: payload.fetch('id').to_s,
          name: payload.fetch('name').to_s,
          module_type: module_payload.fetch('type').to_s,
          module_params: stringify_keys(module_payload.fetch('params')),
          runtime_params: build_runtime_params(module_payload.fetch('params'), params_payload),
          conditions: compile_conditions(payload.fetch('conditions')),
          optimization_targets: compile_optimization_targets(module_payload.fetch('type'), payload['optimization'])
        )
      end

      private

      attr_reader :dictionary

      def build_runtime_params(module_params, params_payload)
        runtime_params = { module_period: module_params.fetch('period').to_i }

        params_payload.each do |key, value|
          runtime_params[key.to_sym] = numeric_like?(value) ? value.to_f : value
        end

        runtime_params[:position_mode] = runtime_params[:position_mode].presence || 'long_short'
        runtime_params
      end

      def compile_conditions(conditions_payload)
        conditions_payload.to_h.transform_keys(&:to_sym).transform_values do |rule_payload|
          {
            operator: rule_payload.fetch('operator').to_s,
            left: compile_operand(rule_payload.fetch('left')),
            right: compile_operand(rule_payload.fetch('right'))
          }
        end
      end

      def compile_operand(value)
        return { kind: :literal, value: value.to_f } if numeric_like?(value)

        case value.to_s
        when *dictionary.dig('references', 'fields')
          { kind: :bar, key: value.to_s.to_sym }
        when 'module.value'
          { kind: :module, key: :value }
        else
          { kind: :param, key: value.to_s.delete_prefix('params.').to_sym }
        end
      end

      def compile_optimization_targets(module_type, optimization_payload)
        targets = Array(optimization_payload&.fetch('targets', nil))
        targets = [ 'module.period' ] if targets.empty?

        targets.map do |target|
          {
            value: target,
            label: optimization_target_label(module_type, target)
          }
        end
      end

      def optimization_target_label(module_type, target)
        return dictionary.dig('module', 'types', module_type.to_s, 'params', 'period', 'label') if target == 'module.period'

        param_key = target.delete_prefix('params.')
        dictionary.dig('params', param_key, 'label') || target
      end

      def numeric_like?(value)
        Float(value)
        true
      rescue ArgumentError, TypeError
        false
      end

      def stringify_keys(hash)
        hash.to_h.transform_keys(&:to_s)
      end
    end
  end
end
