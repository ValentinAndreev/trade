# frozen_string_literal: true

module Research
  module Systems
    class OscillatorThreshold < Base
      def strategy_key = 'rsi_threshold'

      def system_type = 'oscillator_threshold'

      def module_type = 'rsi'

      def runtime_params(system_params:, module_params:)
        lower_threshold = system_params.fetch(:lower_threshold).to_f
        upper_threshold = system_params.fetch(:upper_threshold).to_f
        raise ArgumentError, 'lower_threshold must be less than upper_threshold' if lower_threshold >= upper_threshold

        {
          module_period: module_period(module_params),
          position_mode: position_mode(system_params),
          lower_threshold: lower_threshold,
          upper_threshold: upper_threshold
        }
      end

      def run_params(runtime_params)
        {
          system_type: system_type,
          module_type: module_type,
          module_period: runtime_params.fetch(:module_period).to_i,
          position_mode: position_mode(runtime_params),
          lower_threshold: runtime_params.fetch(:lower_threshold).to_f,
          upper_threshold: runtime_params.fetch(:upper_threshold).to_f
        }
      end

      def optimization_param_key(target)
        normalized_target = target.presence || default_optimization_target

        case normalized_target
        when 'module.period' then :module_period
        when 'system.lower_threshold' then :lower_threshold
        when 'system.upper_threshold' then :upper_threshold
        else
          raise ArgumentError, "Unsupported optimization target for #{system_type}: #{target}"
        end
      end

      def signal_for(prev_row:, row:, params:)
        prev_value = module_value(prev_row)
        value = module_value(row)
        return nil if [ prev_value, value ].any?(&:nil?)

        lower_threshold = params.fetch(:lower_threshold).to_f
        upper_threshold = params.fetch(:upper_threshold).to_f

        return :cross_up if prev_value > lower_threshold && value <= lower_threshold
        return :cross_down if prev_value < upper_threshold && value >= upper_threshold

        nil
      end
    end
  end
end
