# frozen_string_literal: true

module Research
  class SystemRegistry
    REGISTRY = {
      [ 'price_module_cross', 'ema' ] => Research::Systems::PriceModuleCross,
      [ 'oscillator_threshold', 'rsi' ] => Research::Systems::OscillatorThreshold
    }.freeze

    def self.fetch(system_type:, module_type:)
      REGISTRY.fetch([ system_type.to_s, module_type.to_s ]) do
        raise ArgumentError, "Unsupported research setup: system=#{system_type.inspect}, module=#{module_type.inspect}"
      end.new
    end
  end
end
