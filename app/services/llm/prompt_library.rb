# frozen_string_literal: true

require 'erb'

module Llm
  class PromptLibrary
    class << self
      def render(path, **locals)
        resolved_path = prompt_path(path, default_extension: '.txt.erb')
        template = read_cached(resolved_path)
        ERB.new(template).result_with_hash(locals.transform_keys(&:to_sym))
      end

      def load_yaml(path)
        resolved_path = prompt_path(path, default_extension: '.yml')
        YAML.safe_load(read_cached(resolved_path), aliases: false) || {}
      end

      private

      def prompt_path(path, default_extension:)
        relative = path.to_s
        relative += default_extension unless File.extname(relative).present?
        Rails.root.join('app/prompts', relative)
      end

      def read_cached(resolved_path)
        cache_key = "prompt_library:#{resolved_path.to_s.delete_prefix(Rails.root.to_s)}"
        Rails.cache.fetch(cache_key, expires_in: 5.minutes) { File.read(resolved_path) }
      end
    end
  end
end
