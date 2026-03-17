# frozen_string_literal: true

module Research
  module Dsl
    CompiledSystem = Struct.new(
      :id,
      :name,
      :module_type,
      :module_params,
      :runtime_params,
      :conditions,
      :optimization_targets,
      keyword_init: true
    ) do
      def metadata
        {
          id: id,
          name: name,
          module: {
            type: module_type,
            params: module_params
          },
          params: runtime_params.except(:module_period),
          conditions: conditions.keys,
          optimization_targets: optimization_targets
        }
      end

      def system
        @system ||= Research::Systems::Dsl.new(spec: self)
      end
    end
  end
end
