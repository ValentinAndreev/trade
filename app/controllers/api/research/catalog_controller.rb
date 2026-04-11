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
    end
  end
end
