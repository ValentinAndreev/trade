# frozen_string_literal: true

module Research
  module Systems
    class PriceModuleCross < Base
      def strategy_key = 'ema_cross'

      def system_type = 'price_module_cross'

      def module_type = 'ema'

      def runtime_params(system_params:, module_params:)
        {
          module_period: module_period(module_params),
          position_mode: position_mode(system_params)
        }
      end

      def run_params(runtime_params)
        {
          system_type: system_type,
          module_type: module_type,
          module_period: runtime_params.fetch(:module_period).to_i,
          position_mode: position_mode(runtime_params)
        }
      end

      def optimization_param_key(target)
        normalized_target = target.presence || default_optimization_target
        return :module_period if normalized_target == 'module.period'

        raise ArgumentError, "Unsupported optimization target for #{system_type}: #{target}"
      end

      def signal_for(prev_row:, row:, params:)
        prev_close = prev_row.dig(:bar, :close)
        prev_module = module_value(prev_row)
        close = row.dig(:bar, :close)
        current_module = module_value(row)
        return nil if [ prev_close, prev_module, close, current_module ].any?(&:nil?)

        return :cross_up if prev_close <= prev_module && close > current_module
        return :cross_down if prev_close >= prev_module && close < current_module

        nil
      end
    end
  end
end
