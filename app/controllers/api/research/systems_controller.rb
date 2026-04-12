# frozen_string_literal: true

module Api
  module Research
    class SystemsController < BaseController
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

      def save
        yaml = params[:system_yaml].to_s
        return render json: missing_yaml_response, status: :unprocessable_entity if yaml.blank?

        entry = ::Research::Systems::Repository.save_system(
          yaml,
          source_relative_path: params[:source_path],
          directory_relative_path: params[:directory_path]
        )

        render json: { ok: true, diagnostics: [], system: entry.to_h }
      rescue ::Research::Systems::Validation::Error => e
        render_systems_validation_error(e, system: nil)
      end

      def rename
        yaml = params[:system_yaml].to_s
        return render json: missing_yaml_response, status: :unprocessable_entity if yaml.blank?

        entry = ::Research::Systems::Repository.rename_entry(
          source_relative_path: params[:source_path],
          target_id: params[:target_system_id].to_s,
          yaml:
        )

        render json: { ok: true, diagnostics: [], system: entry.to_h }
      rescue ::Research::Systems::Validation::Error => e
        render_systems_validation_error(e, system: nil)
      end

      def destroy
        ::Research::Systems::Repository.delete_entry(source_relative_path: params[:source_path])
        render json: { ok: true, diagnostics: [], deleted_system_path: params[:source_path] }
      rescue ::Research::Systems::Validation::Error => e
        render_systems_validation_error(e, deleted_system_path: nil)
      end

      def create_directory
        path = ::Research::Systems::Repository.create_directory(
          parent_relative_path: params[:parent_path],
          directory_name: params[:directory_name]
        )

        render json: { ok: true, diagnostics: [], path: }
      rescue ::Research::Systems::Validation::Error => e
        render_systems_validation_error(e, path: nil)
      end

      def rename_directory
        path = ::Research::Systems::Repository.rename_directory(
          source_relative_path: params[:source_path],
          target_name: params[:target_name]
        )

        render json: { ok: true, diagnostics: [], path: }
      rescue ::Research::Systems::Validation::Error => e
        render_systems_validation_error(e, path: nil)
      end

      def destroy_directory
        ::Research::Systems::Repository.delete_directory(source_relative_path: params[:source_path])
        render json: { ok: true, diagnostics: [], deleted_path: params[:source_path] }
      rescue ::Research::Systems::Validation::Error => e
        render_systems_validation_error(e, deleted_path: nil)
      end
    end
  end
end
