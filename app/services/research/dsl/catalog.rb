# frozen_string_literal: true

module Research
  module Dsl
    # Read-only catalog: lists systems, loads YAML, validates, and provides the
    # editor highlight config.  File mutations live in SystemRepository.
    class Catalog
      Entry = Struct.new(:id, :name, :file_name, :relative_path, :yaml, :metadata, keyword_init: true) do
        def to_h
          { id: id, name: name, file_name: file_name, relative_path: relative_path, yaml: yaml, metadata: metadata }
        end
      end

      class << self
        include PathHelpers

        # --- Dictionary ---

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

        # --- Catalog reading ---

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
          yaml      = File.read(path)
          system_id = file_id_for(path)

          Entry.new(
            id:            system_id,
            name:          humanized_name_for(system_id),
            file_name:     path.basename.to_s,
            relative_path: relative_path_for(path),
            yaml:          yaml,
            metadata:      nil
          )
        end

        def file_id_for(path)
          Pathname.new(path).basename('.yml').to_s
        end

        def humanized_name_for(system_id)
          system_id.to_s.tr('_-', ' ').split.map(&:capitalize).join(' ')
        end
      end
    end
  end
end
