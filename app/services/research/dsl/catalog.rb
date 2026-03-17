# frozen_string_literal: true

require 'fileutils'

module Research
  module Dsl
    class Catalog
      Entry = Struct.new(:id, :name, :file_name, :relative_path, :yaml, :metadata, keyword_init: true) do
        def to_h
          {
            id: id,
            name: name,
            file_name: file_name,
            relative_path: relative_path,
            yaml: yaml,
            metadata: metadata
          }
        end
      end

      class << self
        def dictionary
          @dictionary ||= YAML.safe_load(
            File.read(Rails.root.join('config/research/dictionary.yml')),
            aliases: false
          )
        end

        def entries
          template_paths.sort.map do |path|
            yaml = File.read(path)
            validation = validate(yaml)
            validation.raise_if_invalid!

            Entry.new(
              id: validation.compiled.id,
              name: validation.compiled.name,
              file_name: File.basename(path),
              relative_path: relative_path_for(path),
              yaml: yaml,
              metadata: validation.metadata
            )
          end
        end

        def directory_paths
          Dir[systems_dir.join('**/')].filter_map do |path|
            pathname = Pathname.new(path).cleanpath
            next if pathname == systems_dir

            relative_path_for(pathname)
          end.sort
        end

        def find(id)
          entries.find { |entry| entry.id == id.to_s }
        end

        def find_by_relative_path(relative_path)
          return nil if relative_path.blank?

          entries.find { |entry| entry.relative_path == relative_path.to_s }
        end

        def load_yaml(id = nil, relative_path: nil)
          find_by_relative_path(relative_path)&.yaml || find(id)&.yaml
        end

        def validate(yaml)
          Research::Dsl::Validator.new(yaml).call
        end

        def save_yaml(yaml, source_relative_path: nil, directory_relative_path: nil)
          validation = validate(yaml)
          validation.raise_if_invalid!

          system_id = validation.compiled.id.to_s
          ensure_safe_system_id!(system_id)

          if source_relative_path.present?
            path = resolve_relative_path(source_relative_path)
            raise_missing_system!(source_relative_path) unless path
          elsif directory_relative_path.present?
            directory = resolve_directory_path(directory_relative_path)
            raise_missing_directory!(directory_relative_path) unless directory
            path = directory.join("#{system_id}.yml")
            if path.exist?
              raise_diagnostic!(
                message: "System #{system_id} already exists",
                path: 'id',
                code: 'system_exists',
                length: system_id.length
              )
            end
          else
            path = file_path_for(system_id)
          end
          FileUtils.mkdir_p(path.dirname)
          File.write(path, yaml)

          build_entry(path:, yaml:, validation:)
        end

        def rename_yaml(source_relative_path:, target_id:, yaml:)
          source_path = source_relative_path.present? ? resolve_relative_path(source_relative_path) : nil
          raise_missing_system!(source_relative_path) unless source_path

          ensure_safe_system_id!(target_id)

          target_path = source_path.dirname.join("#{target_id}.yml")
          if target_path.exist? && target_path != source_path
            raise_diagnostic!(
              message: "System #{target_id} already exists",
              path: 'id',
              code: 'system_exists',
              length: target_id.length
            )
          end

          renamed_yaml = replace_root_id(yaml, target_id)
          validation = validate(renamed_yaml)
          validation.raise_if_invalid!

          FileUtils.mkdir_p(target_path.dirname)
          File.write(target_path, renamed_yaml)
          File.delete(source_path) if source_path.exist? && source_path != target_path

          build_entry(path: target_path, yaml: renamed_yaml, validation:)
        end

        def delete_yaml(source_relative_path:)
          path = source_relative_path.present? ? resolve_relative_path(source_relative_path) : nil
          raise_missing_system!(source_relative_path) unless path

          File.delete(path) if path.exist?
        end

        def create_directory(parent_relative_path:, directory_name:)
          ensure_safe_path_name!(directory_name, path: 'directory_name')
          parent_path = resolve_parent_directory_path(parent_relative_path)
          raise_missing_directory!(parent_relative_path) unless parent_path

          target_path = parent_path.join(directory_name)
          if target_path.exist?
            raise_diagnostic!(
              message: "Directory #{directory_name} already exists",
              path: 'directory_name',
              code: 'directory_exists',
              length: directory_name.length
            )
          end

          FileUtils.mkdir_p(target_path)
          relative_path_for(target_path)
        end

        def rename_directory(source_relative_path:, target_name:)
          ensure_safe_path_name!(target_name, path: 'target_name')
          source_path = source_relative_path.present? ? resolve_relative_path(source_relative_path) : nil
          raise_missing_directory!(source_relative_path) unless source_path&.directory?

          if source_path == systems_dir
            raise_diagnostic!(
              message: 'Root directory cannot be renamed',
              path: 'source_path',
              code: 'invalid_directory',
              length: source_relative_path.to_s.length
            )
          end

          target_path = source_path.dirname.join(target_name)
          if target_path.exist? && target_path != source_path
            raise_diagnostic!(
              message: "Directory #{target_name} already exists",
              path: 'target_name',
              code: 'directory_exists',
              length: target_name.length
            )
          end

          FileUtils.mv(source_path, target_path)
          relative_path_for(target_path)
        end

        def delete_directory(source_relative_path:)
          source_path = source_relative_path.present? ? resolve_relative_path(source_relative_path) : nil
          raise_missing_directory!(source_relative_path) unless source_path&.directory?

          if source_path == systems_dir
            raise_diagnostic!(
              message: 'Root directory cannot be deleted',
              path: 'source_path',
              code: 'invalid_directory',
              length: source_relative_path.to_s.length
            )
          end

          FileUtils.rm_r(source_path) if source_path.exist?
        end

        def systems_dir
          Rails.root.join('config/research/systems')
        end

        private

        def template_paths
          Dir[systems_dir.join('**/*.yml')]
        end

        def file_path_for(system_id)
          systems_dir.join("#{system_id}.yml")
        end

        def build_entry(path:, yaml:, validation:)
          Entry.new(
            id: validation.compiled.id,
            name: validation.compiled.name,
            file_name: path.basename.to_s,
            relative_path: relative_path_for(path),
            yaml: yaml,
            metadata: validation.metadata
          )
        end

        def relative_path_for(path)
          Pathname.new(path).relative_path_from(systems_dir).to_s
        end

        def resolve_relative_path(relative_path)
          path = systems_dir.join(relative_path.to_s).cleanpath
          systems_root = systems_dir.cleanpath.to_s
          path_str = path.to_s
          return nil unless path_str == systems_root || path_str.start_with?("#{systems_root}/")
          return nil unless path.exist?

          path
        end

        def resolve_directory_path(relative_path)
          path = resolve_relative_path(relative_path)
          path if path&.directory?
        end

        def resolve_parent_directory_path(relative_path)
          return systems_dir if relative_path.blank?

          resolve_directory_path(relative_path)
        end

        def replace_root_id(yaml, target_id)
          updated = yaml.sub(/^id:\s*.*$/, "id: #{target_id}")
          return updated if updated != yaml

          "id: #{target_id}\n#{yaml}"
        end

        def raise_missing_system!(system_identifier)
          raise_diagnostic!(
            message: "System #{system_identifier} was not found",
            path: 'source_path',
            code: 'system_missing',
            length: system_identifier.to_s.length
          )
        end

        def raise_missing_directory!(directory_identifier)
          raise_diagnostic!(
            message: "Directory #{directory_identifier.presence || '.'} was not found",
            path: 'source_path',
            code: 'directory_missing',
            length: directory_identifier.to_s.length
          )
        end

        def raise_diagnostic!(message:, path:, code:, length:)
          raise Research::Dsl::ValidationError.new([
            Research::Dsl::Diagnostic.new(
              message:,
              line: 1,
              column: 1,
              length: [ length, 1 ].max,
              path:,
              code:
            )
          ])
        end

        def ensure_safe_system_id!(system_id)
          return if system_id.match?(/\A[a-z0-9][a-z0-9_-]*\z/)

          raise_diagnostic!(
            message: 'System id must use lowercase letters, numbers, "_" or "-"',
            path: 'id',
            code: 'invalid_system_id',
            length: system_id.length
          )
        end

        def ensure_safe_path_name!(name, path:)
          return if name.to_s.match?(/\A[a-z0-9][a-z0-9_-]*\z/)

          raise_diagnostic!(
            message: 'Name must use lowercase letters, numbers, "_" or "-"',
            path: path,
            code: 'invalid_path_name',
            length: name.to_s.length
          )
        end
      end
    end
  end
end
