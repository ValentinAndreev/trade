# frozen_string_literal: true

module Research
  module Systems
    class Dsl < Base
      def initialize(spec:)
        @spec = spec
      end

      def strategy_key = @spec.id

      def system_type = @spec.id

      def module_type = @spec.module_type

      def default_optimization_target
        @spec.optimization_targets.first&.fetch(:value, nil) || 'module.period'
      end

      def runtime_params(system_params:, module_params:)
        raise NotImplementedError, 'DSL systems compile runtime params directly'
      end

      def run_params(runtime_params)
        params = {
          system_id: @spec.id,
          system_name: @spec.name,
          module_type: module_type,
          module_period: runtime_params.fetch(:module_period).to_i,
          position_mode: runtime_params[:position_mode].presence || 'long_short'
        }

        runtime_params.each do |key, value|
          next if %i[module_period position_mode].include?(key.to_sym)

          params[key.to_sym] = numeric_param?(value) ? value.to_f : value
        end

        params
      end

      def optimization_param_key(target)
        normalized_target = target.presence || default_optimization_target
        return :module_period if normalized_target == 'module.period'
        return normalized_target.delete_prefix('params.').to_sym if normalized_target.start_with?('params.')

        raise ArgumentError, "Unsupported optimization target for #{system_type}: #{target}"
      end

      def signals_for(prev_row:, row:, params:)
        @spec.conditions.each_with_object({}) do |(key, condition), signals|
          signals[key] = evaluate_condition(condition, prev_row:, row:, params:)
        end
      end

      private

      def evaluate_condition(condition, prev_row:, row:, params:)
        operator = condition.fetch(:operator)
        left = resolve_operand(condition.fetch(:left), row:, params:)
        right = resolve_operand(condition.fetch(:right), row:, params:)
        return false if left.nil? || right.nil?

        case operator
        when 'gt' then left > right
        when 'gte' then left >= right
        when 'lt' then left < right
        when 'lte' then left <= right
        when 'cross_above'
          return false unless prev_row

          prev_left = resolve_operand(condition.fetch(:left), row: prev_row, params:)
          prev_right = resolve_operand(condition.fetch(:right), row: prev_row, params:)
          prev_left && prev_right && prev_left <= prev_right && left > right
        when 'cross_below'
          return false unless prev_row

          prev_left = resolve_operand(condition.fetch(:left), row: prev_row, params:)
          prev_right = resolve_operand(condition.fetch(:right), row: prev_row, params:)
          prev_left && prev_right && prev_left >= prev_right && left < right
        else
          false
        end
      end

      def resolve_operand(operand, row:, params:)
        case operand.fetch(:kind)
        when :literal
          operand.fetch(:value).to_f
        when :bar
          numeric_value(row.dig(:bar, operand.fetch(:key)))
        when :module
          numeric_value(row.dig(:result, module_key, operand.fetch(:key)))
        when :param
          numeric_value(params[operand.fetch(:key)])
        end
      end

      def numeric_value(value)
        numeric = Float(value)
        numeric if numeric.finite?
      rescue ArgumentError, TypeError
        nil
      end

      def numeric_param?(value)
        Float(value)
        true
      rescue ArgumentError, TypeError
        false
      end
    end
  end
end
