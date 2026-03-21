# frozen_string_literal: true

module Research
  module Systems
    module EditorMetadata
      module_function

      def response
        {
          highlight: highlight_config,
          condition_expression: Research::Systems::ConditionExpression::Definition.frontend_metadata(
            reference_fields: Schema.data.dig('references', 'fields')
          )
        }
      end

      def highlight_config
        keywords = []
        values = []

        collect_highlight_tokens(Schema.data, keywords, values)
        collect_highlight_tokens(Research::Systems::ConditionExpression::Definition.highlight_fragment, keywords, values)

        { keywords: keywords.uniq, values: values.uniq }
      end

      def collect_highlight_tokens(node, keywords, values, parent_key = nil)
        case node
        when Array
          case parent_key
          when 'root_keys', 'keys', 'rule_keys', 'module_keys' then keywords.concat(node.grep(String))
          when 'fields', 'module', 'values' then values.concat(node.grep(String))
          end
        when Hash
          keywords.concat(node.keys) if parent_key == 'params'
          values.concat(node.keys) if %w[types operators functions].include?(parent_key)
          node.each { |key, child| collect_highlight_tokens(child, keywords, values, key) }
        end
      end

      private_class_method :collect_highlight_tokens
    end
  end
end
