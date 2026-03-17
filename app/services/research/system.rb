# frozen_string_literal: true

module Research
  class System
    attr_reader :id, :name, :module_type, :module_params, :runtime_params, :conditions, :optimization_targets

    def initialize(id:, name:, module_type:, module_params:, runtime_params:, conditions:, optimization_targets:)
      @id = id
      @name = name
      @module_type = module_type
      @module_params = module_params
      @runtime_params = runtime_params
      @conditions = conditions
      @optimization_targets = optimization_targets
    end

    def strategy_key = id
    def system_type  = id
    def module_key   = module_type.to_sym

    def metadata
      {
        id: id,
        name: name,
        module: { type: module_type, params: module_params },
        params: runtime_params.except(:module_period),
        conditions: conditions.keys,
        optimization_targets: optimization_targets
      }
    end

    def default_optimization_target
      optimization_targets.first&.fetch(:value, nil) || 'module.period'
    end

    def run_params(runtime_params)
      params = {
        system_id: id,
        system_name: name,
        module_type: module_type,
        module_period: runtime_params.fetch(:module_period).to_i,
        position_mode: runtime_params[:position_mode].presence || 'long_short'
      }

      runtime_params.each do |key, value|
        next if %i[module_period position_mode].include?(key.to_sym)

        params[key.to_sym] = numeric?(value) ? value.to_f : value
      end

      params
    end

    def optimization_param_key(target)
      normalized = target.presence || default_optimization_target
      return :module_period if normalized == 'module.period'
      return normalized.delete_prefix('params.').to_sym if normalized.start_with?('params.')

      raise ArgumentError, "Unsupported optimization target for #{system_type}: #{target}"
    end

    def signals_for(prev_row:, row:, params:)
      conditions.each_with_object({}) do |(key, condition), signals|
        signals[key] = evaluate_condition(condition, prev_row:, row:, params:)
      end
    end

    private

    def evaluate_condition(condition, prev_row:, row:, params:)
      operator = condition.fetch(:operator)
      left  = resolve_operand(condition.fetch(:left), row:, params:)
      right = resolve_operand(condition.fetch(:right), row:, params:)
      return false if left.nil? || right.nil?

      case operator
      when 'gt'  then left > right
      when 'gte' then left >= right
      when 'lt'  then left < right
      when 'lte' then left <= right
      when 'cross_above'
        return false unless prev_row

        prev_left  = resolve_operand(condition.fetch(:left), row: prev_row, params:)
        prev_right = resolve_operand(condition.fetch(:right), row: prev_row, params:)
        prev_left && prev_right && prev_left <= prev_right && left > right
      when 'cross_below'
        return false unless prev_row

        prev_left  = resolve_operand(condition.fetch(:left), row: prev_row, params:)
        prev_right = resolve_operand(condition.fetch(:right), row: prev_row, params:)
        prev_left && prev_right && prev_left >= prev_right && left < right
      else
        false
      end
    end

    def resolve_operand(operand, row:, params:)
      case operand.fetch(:kind)
      when :literal then operand.fetch(:value).to_f
      when :bar     then float_or_nil(row.dig(:bar, operand.fetch(:key)))
      when :module  then float_or_nil(row.dig(:result, module_key, operand.fetch(:key)))
      when :param   then float_or_nil(params[operand.fetch(:key)])
      end
    end

    def float_or_nil(value)
      numeric = Float(value)
      numeric if numeric.finite?
    rescue ArgumentError, TypeError
      nil
    end

    def numeric?(value)
      Float(value)
      true
    rescue ArgumentError, TypeError
      false
    end
  end
end
