# frozen_string_literal: true

module Api
  module Research
    class CatalogController < BaseController
      def index
        render json: {
          systems: ::Research::Systems::Catalog.entries.map(&:to_h),
          directories: ::Research::Systems::Catalog.directory_paths
        }
      end

      def editor_metadata
        render json: ::Research::Systems::EditorMetadata.response
      end

      def validate
        yaml = params[:system_yaml].presence || ::Research::Systems::Catalog.load_yaml(
          params[:system_id],
          relative_path: params[:system_path]
        )
        return render json: missing_yaml_response, status: :unprocessable_entity if yaml.blank?

        validation = ::Research::Systems::Validation::Validator.new(yaml).call
        render json: {
          ok: validation.valid?,
          diagnostics: validation.diagnostics.map(&:to_h),
          system: validation.metadata
        }
      end
    end
  end
end
