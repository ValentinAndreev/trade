# frozen_string_literal: true

module Api
  module Research
    class BaseController < Api::ApplicationController
      private

      def missing_yaml_response
        { ok: false, diagnostics: [ ::Research::Systems::Validation::Diagnostic.yaml_missing.to_h ], system: nil }
      end

      def render_systems_validation_error(error, **payload)
        render json: payload.merge(ok: false, diagnostics: error.diagnostics.map(&:to_h)), status: :unprocessable_entity
      end
    end
  end
end
