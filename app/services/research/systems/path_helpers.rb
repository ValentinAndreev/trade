# frozen_string_literal: true

module Research
  module Systems
    module PathHelpers
      def systems_dir
        Rails.root.join('config/research/systems')
      end

      def relative_path_for(path)
        Pathname.new(path).relative_path_from(systems_dir).to_s
      end

      def resolve_relative_path(relative_path)
        return if relative_path.blank?

        path = systems_dir.join(relative_path.to_s).cleanpath
        systems_root = systems_dir.cleanpath.to_s
        path_str = path.to_s

        return unless path_str == systems_root || path_str.start_with?("#{systems_root}/")
        return unless path.exist?

        path
      end

      private

      def validate_name!(name, code:, path: 'id')
        return if name.to_s.match?(/\A[a-z0-9][a-z0-9_-]*\z/)

        raise_error!('Name must use lowercase letters, numbers, "_" or "-"', path: path, code: code, length: name.to_s.length)
      end

      def ensure_available_path!(target_path, label:, kind:, path:, code:, ignore_path: nil)
        return target_path unless target_path.exist? && target_path != ignore_path

        raise_error!("#{kind} #{label} already exists", path: path, code: code, length: label.length)
      end

      def resolve_or_raise!(relative_path, code)
        path = resolve_relative_path(relative_path)
        raise_error!("System #{relative_path} was not found", path: 'source_path', code: code, length: relative_path.to_s.length) unless path

        path
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

      def raise_error!(message, path:, code:, length:)
        raise Research::Systems::Validation::Error.new([
          Research::Systems::Validation::Diagnostic.new(message: message, line: 1, column: 1, length: [ length, 1 ].max, path: path, code: code)
        ])
      end
    end
  end
end
