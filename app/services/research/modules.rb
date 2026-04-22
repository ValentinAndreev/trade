# frozen_string_literal: true

module Research
  module Modules
    def self.for(type)
      const_name = type.to_s.classify

      return const_get(const_name, false) if const_defined?(const_name, false)
      raise ArgumentError, "Unsupported module: #{type}" unless TechnicalAnalysis.const_defined?(const_name, false)

      const_set(const_name, Class.new(const_get(:Base)))
    end
  end
end
