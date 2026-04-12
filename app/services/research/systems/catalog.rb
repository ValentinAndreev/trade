# frozen_string_literal: true

require 'psych'

module Research
  module Systems
    class Catalog
      Entry = Struct.new(:id, :name, :file_name, :relative_path, :yaml, :metadata, keyword_init: true)

      class << self
        include PathHelpers

        def entries = template_paths.sort.map { |path| build_catalog_entry(Pathname.new(path)) }

        def directory_paths
          Dir[systems_dir.join('**/')].filter_map do |path|
            pathname = Pathname.new(path).cleanpath
            next if pathname == systems_dir

            relative_path_for(pathname)
          end.sort
        end

        def find(id)
          return if id.blank?

          entries.find { |e| e.id == id.to_s }
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

        private

        def template_paths = Dir[systems_dir.join('**/*.yml')]

        def build_catalog_entry(path)
          yaml = File.read(path)
          metadata = extract_entry_metadata(yaml, path)

          Entry.new(
            id: metadata.fetch(:id),
            name: metadata.fetch(:name),
            file_name: path.basename.to_s,
            relative_path: relative_path_for(path),
            yaml:,
            metadata: nil
          )
        end

        def extract_entry_metadata(yaml, path)
          fallback_id = file_id_for(path)
          payload = YAML.safe_load(yaml, aliases: false)
          system_id = payload.fetch('id', nil).to_s.presence
          system_name = payload.fetch('name', nil).to_s.presence
          resolved_id = system_id || fallback_id

          {
            id: resolved_id,
            name: system_name || humanized_name_for(resolved_id)
          }
        rescue Psych::Exception, NoMethodError
          fallback_entry_metadata(fallback_id)
        end

        def fallback_entry_metadata(fallback_id)
          {
            id: fallback_id,
            name: humanized_name_for(fallback_id)
          }
        end

        def file_id_for(path) = Pathname.new(path).basename('.yml').to_s

        def humanized_name_for(system_id) = system_id.to_s.tr('_-', ' ').split.map(&:capitalize).join(' ')
      end
    end
  end
end
