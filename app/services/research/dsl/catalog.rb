# frozen_string_literal: true

require 'fileutils'

module Research
  module Dsl
    class Catalog
      Entry = Struct.new(:id, :name, :file_name, :relative_path, :yaml, :metadata, keyword_init: true) do
        def to_h
          { id: id, name: name, file_name: file_name, relative_path: relative_path, yaml: yaml, metadata: metadata }
        end
      end

      class << self
        # --- Reading ---

        def dictionary
          @dictionary ||= YAML.safe_load(
            File.read(Rails.root.join('config/research/dictionary.yml')),
            aliases: false
          )
        end

        def entries
          template_paths.sort.map do |path|
            yaml       = File.read(path)
            validation = validate(yaml)
            validation.raise_if_invalid!
            build_entry(Pathname.new(path), yaml, validation)
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
          entries.find { |e| e.id == id.to_s }
        end

        def find_by_relative_path(relative_path)
          return nil if relative_path.blank?

          entries.find { |e| e.relative_path == relative_path.to_s }
        end

        def load_yaml(id = nil, relative_path: nil)
          find_by_relative_path(relative_path)&.yaml || find(id)&.yaml
        end

        def validate(yaml)
          Research::Dsl::Validator.new(yaml).call
        end

        # --- File operations ---

        def save_system(yaml, source_relative_path: nil, directory_relative_path: nil)
          validation = validate(yaml)
          validation.raise_if_invalid!
          system_id = validation.compiled.id.to_s
          validate_name!(system_id, code: 'invalid_system_id')

          path = if source_relative_path.present?
            resolve_or_raise!(source_relative_path, 'system_missing')
          elsif directory_relative_path.present?
            dir      = resolve_directory!(directory_relative_path)
            new_path = dir.join("#{system_id}.yml")
            raise_error!("System #{system_id} already exists", path: 'id', code: 'system_exists', length: system_id.length) if new_path.exist?
            new_path
          else
            systems_dir.join("#{system_id}.yml")
          end

          FileUtils.mkdir_p(path.dirname)
          File.write(path, yaml)
          build_entry(path, yaml, validation)
        end

        def rename_entry(source_relative_path:, target_id:, yaml:)
          source_path = resolve_or_raise!(source_relative_path, 'system_missing')
          validate_name!(target_id, code: 'invalid_system_id')

          target_path = source_path.dirname.join("#{target_id}.yml")
          raise_error!("System #{target_id} already exists", path: 'id', code: 'system_exists', length: target_id.length) if target_path.exist? && target_path != source_path

          renamed_yaml = replace_root_id(yaml, target_id)
          validation   = validate(renamed_yaml)
          validation.raise_if_invalid!

          FileUtils.mkdir_p(target_path.dirname)
          File.write(target_path, renamed_yaml)
          File.delete(source_path) if source_path.exist? && source_path != target_path
          build_entry(target_path, renamed_yaml, validation)
        end

        def delete_entry(source_relative_path:)
          path = resolve_or_raise!(source_relative_path, 'system_missing')
          File.delete(path) if path.exist?
        end

        def create_directory(parent_relative_path:, directory_name:)
          validate_name!(directory_name, code: 'invalid_path_name', path: 'directory_name')
          parent_path = resolve_parent_directory(parent_relative_path)
          raise_error!("Directory #{parent_relative_path.presence || '.'} was not found", path: 'source_path', code: 'directory_missing', length: parent_relative_path.to_s.length) unless parent_path

          target_path = parent_path.join(directory_name)
          raise_error!("Directory #{directory_name} already exists", path: 'directory_name', code: 'directory_exists', length: directory_name.length) if target_path.exist?

          FileUtils.mkdir_p(target_path)
          relative_path_for(target_path)
        end

        def rename_directory(source_relative_path:, target_name:)
          validate_name!(target_name, code: 'invalid_path_name', path: 'target_name')
          source_path = resolve_relative_path(source_relative_path)
          raise_error!("Directory #{source_relative_path.presence || '.'} was not found", path: 'source_path', code: 'directory_missing', length: source_relative_path.to_s.length) unless source_path&.directory?
          raise_error!('Root directory cannot be renamed', path: 'source_path', code: 'invalid_directory', length: source_relative_path.to_s.length) if source_path == systems_dir

          target_path = source_path.dirname.join(target_name)
          raise_error!("Directory #{target_name} already exists", path: 'target_name', code: 'directory_exists', length: target_name.length) if target_path.exist? && target_path != source_path

          FileUtils.mv(source_path, target_path)
          relative_path_for(target_path)
        end

        def delete_directory(source_relative_path:)
          source_path = resolve_relative_path(source_relative_path)
          raise_error!("Directory #{source_relative_path.presence || '.'} was not found", path: 'source_path', code: 'directory_missing', length: source_relative_path.to_s.length) unless source_path&.directory?
          raise_error!('Root directory cannot be deleted', path: 'source_path', code: 'invalid_directory', length: source_relative_path.to_s.length) if source_path == systems_dir

          FileUtils.rm_r(source_path) if source_path.exist?
        end

        # --- Path helpers ---

        def systems_dir
          Rails.root.join('config/research/systems')
        end

        def relative_path_for(path)
          Pathname.new(path).relative_path_from(systems_dir).to_s
        end

        def resolve_relative_path(relative_path)
          return nil if relative_path.blank?

          path         = systems_dir.join(relative_path.to_s).cleanpath
          systems_root = systems_dir.cleanpath.to_s
          path_str     = path.to_s
          return nil unless path_str == systems_root || path_str.start_with?("#{systems_root}/")
          return nil unless path.exist?

          path
        end

        private

        def template_paths
          Dir[systems_dir.join('**/*.yml')]
        end

        def build_entry(path, yaml, validation)
          Entry.new(
            id:            validation.compiled.id,
            name:          validation.compiled.name,
            file_name:     Pathname.new(path).basename.to_s,
            relative_path: relative_path_for(path),
            yaml:          yaml,
            metadata:      validation.metadata
          )
        end

        def resolve_or_raise!(relative_path, code)
          path = resolve_relative_path(relative_path)
          raise_error!("System #{relative_path} was not found", path: 'source_path', code: code, length: relative_path.to_s.length) unless path
          path
        end

        def resolve_directory!(relative_path)
          path = resolve_relative_path(relative_path)
          dir  = path&.directory? ? path : nil
          raise_error!("Directory #{relative_path} was not found", path: 'source_path', code: 'directory_missing', length: relative_path.to_s.length) unless dir
          dir
        end

        def resolve_parent_directory(relative_path)
          return systems_dir if relative_path.blank?

          path = resolve_relative_path(relative_path)
          path if path&.directory?
        end

        def validate_name!(name, code:, path: 'id')
          return if name.to_s.match?(/\A[a-z0-9][a-z0-9_-]*\z/)

          raise_error!('Name must use lowercase letters, numbers, "_" or "-"', path: path, code: code, length: name.to_s.length)
        end

        def replace_root_id(yaml, target_id)
          updated = yaml.sub(/^id:\s*.*$/, "id: #{target_id}")
          return updated if updated != yaml

          "id: #{target_id}\n#{yaml}"
        end

        def raise_error!(message, path:, code:, length:)
          raise ValidationError.new([
            Diagnostic.new(message: message, line: 1, column: 1, length: [ length, 1 ].max, path: path, code: code)
          ])
        end
      end
    end
  end
end
