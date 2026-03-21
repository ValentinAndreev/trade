# frozen_string_literal: true

require 'fileutils'

module Research
  module Systems
    class Repository
      class << self
        include PathHelpers

        # Delegate to Catalog so a stub on Catalog.systems_dir is shared by repository writes.
        def systems_dir
          Catalog.systems_dir
        end

        def save_system(yaml, source_relative_path: nil, directory_relative_path: nil)
          validation = Research::Systems::Validation::Validator.new(yaml).call
          validation.raise_if_invalid!
          system_id = validation.compiled.id.to_s
          validate_name!(system_id, code: 'invalid_system_id')

          path = system_path_for(
            system_id,
            source_relative_path: source_relative_path,
            directory_relative_path: directory_relative_path
          )

          FileUtils.mkdir_p(path.dirname)
          File.write(path, yaml)
          build_validated_entry(path, yaml, validation)
        end

        def rename_entry(source_relative_path:, target_id:, yaml:)
          source_path = resolve_or_raise!(source_relative_path, 'system_missing')
          validate_name!(target_id, code: 'invalid_system_id')

          target_path = ensure_available_path!(
            source_path.dirname.join("#{target_id}.yml"),
            label: target_id,
            kind: 'System',
            path: 'id',
            code: 'system_exists',
            ignore_path: source_path
          )

          renamed_yaml = replace_root_id(yaml, target_id)
          validation = Research::Systems::Validation::Validator.new(renamed_yaml).call
          validation.raise_if_invalid!

          FileUtils.mkdir_p(target_path.dirname)
          File.write(target_path, renamed_yaml)
          File.delete(source_path) if source_path.exist? && source_path != target_path
          build_validated_entry(target_path, renamed_yaml, validation)
        end

        def delete_entry(source_relative_path:)
          path = resolve_or_raise!(source_relative_path, 'system_missing')
          File.delete(path) if path.exist?
        end

        def create_directory(parent_relative_path:, directory_name:)
          validate_name!(directory_name, code: 'invalid_path_name', path: 'directory_name')
          parent_path = parent_relative_path.present? ? resolve_directory!(parent_relative_path) : systems_dir
          target_path = ensure_available_path!(
            parent_path.join(directory_name),
            label: directory_name,
            kind: 'Directory',
            path: 'directory_name',
            code: 'directory_exists'
          )

          FileUtils.mkdir_p(target_path)
          relative_path_for(target_path)
        end

        def rename_directory(source_relative_path:, target_name:)
          validate_name!(target_name, code: 'invalid_path_name', path: 'target_name')
          source_path = resolve_non_root_directory!(
            source_relative_path,
            root_message: 'Root directory cannot be renamed'
          )
          target_path = ensure_available_path!(
            source_path.dirname.join(target_name),
            label: target_name,
            kind: 'Directory',
            path: 'target_name',
            code: 'directory_exists',
            ignore_path: source_path
          )

          FileUtils.mv(source_path, target_path)
          relative_path_for(target_path)
        end

        def delete_directory(source_relative_path:)
          source_path = resolve_non_root_directory!(
            source_relative_path,
            root_message: 'Root directory cannot be deleted'
          )

          FileUtils.rm_r(source_path) if source_path.exist?
        end

        private

        def system_path_for(system_id, source_relative_path:, directory_relative_path:)
          return resolve_or_raise!(source_relative_path, 'system_missing') if source_relative_path.present?

          base_dir = directory_relative_path.present? ? resolve_directory!(directory_relative_path) : systems_dir
          ensure_available_path!(
            base_dir.join("#{system_id}.yml"),
            label: system_id,
            kind: 'System',
            path: 'id',
            code: 'system_exists'
          )
        end

        def replace_root_id(yaml, target_id)
          updated = yaml.sub(/^id:\s*.*$/, "id: #{target_id}")
          return updated if updated != yaml

          "id: #{target_id}\n#{yaml}"
        end

        def build_validated_entry(path, yaml, validation)
          Catalog::Entry.new(
            id: validation.compiled.id,
            name: validation.compiled.name,
            file_name: Pathname.new(path).basename.to_s,
            relative_path: relative_path_for(path),
            yaml: yaml,
            metadata: validation.metadata
          )
        end
      end
    end
  end
end
