# frozen_string_literal: true

module Research
  class ModuleRegistry
    REGISTRY = {
      ema: Research::Modules::Ema,
      rsi: Research::Modules::Rsi
    }.freeze

    def self.fetch(module_key)
      REGISTRY.fetch(module_key.to_sym) do
        raise ArgumentError, "Unsupported research module: #{module_key}"
      end
    end
  end
end
