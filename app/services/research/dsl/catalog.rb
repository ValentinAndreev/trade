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

        def highlight_config
          keywords, values = [], []
          collect_highlight_tokens(dictionary, keywords, values)
          { keywords: keywords.uniq, values: values.uniq }
        end

        def entries
          template_paths.sort.map { |path| build_catalog_entry(Pathname.new(path)) }
        end

        def directory_paths
          Dir[systems_dir.join('**/')].filter_map do |path|
            pathname = Pathname.new(path).cleanpath
            next if pathname == systems_dir

            relative_path_for(pathname)
          end.sort
        end

        def find(id)
          return if id.blank?

          path = template_paths.find { |candidate| file_id_for(candidate) == id.to_s }
          path ? build_catalog_entry(Pathname.new(path)) : nil
        end

        def find_by_relative_path(relative_path)
          return if relative_path.blank?

          path = resolve_relative_path(relative_path)
          return unless path&.file?

          build_catalog_entry(path)
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

          path = system_path_for(
            system_id,
            source_relative_path:,
            directory_relative_path:
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
          validation   = validate(renamed_yaml)
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

        # --- Path helpers ---

        def systems_dir
          Rails.root.join('config/research/systems')
        end

        def relative_path_for(path)
          Pathname.new(path).relative_path_from(systems_dir).to_s
        end

        def resolve_relative_path(relative_path)
          return if relative_path.blank?

          path         = systems_dir.join(relative_path.to_s).cleanpath
          systems_root = systems_dir.cleanpath.to_s
          path_str     = path.to_s
          return unless path_str == systems_root || path_str.start_with?("#{systems_root}/")
          return unless path.exist?

          path
        end

        private

        # Recursively traverses the dictionary and collects tokens for the editor
        # highlighter without hardcoding any structure paths.
        #
        # Rules (driven entirely by key names in the dictionary):
        #   keywords ← items in arrays named: root_keys, keys, rule_keys
        #              keys of hashes named:  params
        #   values   ← items in arrays named: fields, module, values
        #              keys of hashes named:  types, operators
        def collect_highlight_tokens(node, keywords, values, parent_key = nil)
          case node
          when Array
            case parent_key
            when 'root_keys', 'keys', 'rule_keys' then keywords.concat(node.grep(String))
            when 'fields', 'module', 'values'     then values.concat(node.grep(String))
            end
          when Hash
            keywords.concat(node.keys) if parent_key == 'params'
            values.concat(node.keys)   if %w[types operators].include?(parent_key)
            node.each { |key, child| collect_highlight_tokens(child, keywords, values, key) }
          end
        end

        def template_paths
          Dir[systems_dir.join('**/*.yml')]
        end

        def build_catalog_entry(path)
          yaml = File.read(path)
          system_id = file_id_for(path)

          build_entry(
            path,
            id: system_id,
            name: humanized_name_for(system_id),
            yaml:,
            metadata: nil
          )
        end

        def build_validated_entry(path, yaml, validation)
          build_entry(
            path,
            id: validation.compiled.id,
            name: validation.compiled.name,
            yaml:,
            metadata: validation.metadata
          )
        end

        def build_entry(path, id:, name:, yaml:, metadata:)
          path = Pathname.new(path)

          Entry.new(
            id:,
            name:,
            file_name: path.basename.to_s,
            relative_path: relative_path_for(path),
            yaml:,
            metadata:
          )
        end

        def resolve_or_raise!(relative_path, code)
          path = resolve_relative_path(relative_path)
          raise_error!("System #{relative_path} was not found", path: 'source_path', code: code, length: relative_path.to_s.length) unless path
          path
        end

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

        def file_id_for(path)
          Pathname.new(path).basename('.yml').to_s
        end

        def humanized_name_for(system_id)
          system_id.to_s.tr('_-', ' ').split.map(&:capitalize).join(' ')
        end

        def resolve_directory!(relative_path)
          path = resolve_relative_path(relative_path)
          directory = path if path&.directory?
          raise_error!("Directory #{relative_path} was not found", path: 'source_path', code: 'directory_missing', length: relative_path.to_s.length) unless directory

          directory
        end

        def resolve_non_root_directory!(relative_path, root_message:)
          directory = resolve_directory!(relative_path)
          raise_error!(root_message, path: 'source_path', code: 'invalid_directory', length: relative_path.to_s.length) if directory == systems_dir

          directory
        end

        def validate_name!(name, code:, path: 'id')
          return if name.to_s.match?(/\A[a-z0-9][a-z0-9_-]*\z/)

          raise_error!('Name must use lowercase letters, numbers, "_" or "-"', path: path, code: code, length: name.to_s.length)
        end

        def ensure_available_path!(target_path, label:, kind:, path:, code:, ignore_path: nil)
          return target_path unless target_path.exist? && target_path != ignore_path

          raise_error!("#{kind} #{label} already exists", path:, code:, length: label.length)
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
