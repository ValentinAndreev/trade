# frozen_string_literal: true

module Research
  module Systems
    class Base
      def strategy_key
        raise NotImplementedError
      end

      def system_type
        raise NotImplementedError
      end

      def module_type
        raise NotImplementedError
      end

      def module_key
        module_type.to_sym
      end

      def default_optimization_target
        'module.period'
      end

      def runtime_params(system_params:, module_params:)
        raise NotImplementedError
      end

      def run_params(runtime_params)
        raise NotImplementedError
      end

      def optimization_param_key(_target)
        raise NotImplementedError
      end

      def signals_for(prev_row:, row:, params:)
        signal = signal_for(prev_row:, row:, params:)

        case signal
        when :cross_up
          { long_entry: true, short_exit: true }
        when :cross_down
          { long_exit: true, short_entry: true }
        else
          {}
        end
      end

      def signal_for(prev_row:, row:, params:)
        raise NotImplementedError
      end

      private

      def module_value(row)
        row.dig(:result, module_key, :value)
      end

      def module_period(module_params)
        period = module_params.fetch(:period).to_i
        raise ArgumentError, 'Module period must be greater than 0' if period <= 0

        period
      end

      def position_mode(params)
        params[:position_mode].presence || 'long_short'
      end
    end
  end
end
