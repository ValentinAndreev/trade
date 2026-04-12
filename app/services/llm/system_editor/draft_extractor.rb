# frozen_string_literal: true

module Llm
  module SystemEditor
    class DraftExtractor
      class << self
        def call(chat, source_yaml_hash: nil, after_message_id: nil)
          scope = scoped_messages(chat, after_message_id)
          tool_message = latest_apply_system_draft_message(scope)

          draft = draft_from_tool_message(tool_message)
          return normalize_tool_draft(draft) if draft

          assistant_message = scope.where(role: 'assistant').order(created_at: :desc, id: :desc).first
          return unless assistant_message

          fallback_from_assistant_message(assistant_message, source_yaml_hash:)
        end

        private

        def scoped_messages(chat, after_message_id)
          scope = chat.ai_messages
          return scope unless after_message_id.present?

          scope.where('ai_messages.id > ?', after_message_id)
        end

        def latest_apply_system_draft_message(scope)
          scope
            .joins(:parent_tool_call)
            .where(role: 'tool', ai_tool_calls: { name: 'apply_system_draft' })
            .reorder(created_at: :desc, id: :desc)
            .first
        end

        def draft_from_tool_message(tool_message)
          return unless tool_message

          payload = tool_message.content_raw || parse_json(tool_message.content)
          return unless payload.is_a?(Hash)
          return unless payload['draft_yaml'].present?

          payload
        end

        def normalize_tool_draft(payload)
          {
            'yaml' => payload['draft_yaml'],
            'source_yaml_hash' => payload['source_yaml_hash'],
            'validation' => {
              'ok' => payload['ok'],
              'diagnostics' => Array(payload['diagnostics']),
              'system' => payload['system']
            }
          }
        end

        def fallback_from_assistant_message(message, source_yaml_hash:)
          extract_yaml_candidates(message.content.to_s).filter_map do |candidate|
            validation = Research::Systems::Validation::Validator.new(candidate).call
            next unless validation.valid?

            {
              'yaml' => candidate,
              'source_yaml_hash' => source_yaml_hash,
              'validation' => {
                'ok' => true,
                'diagnostics' => validation.diagnostics.map(&:to_h),
                'system' => validation.metadata
              }
            }
          end.first
        end

        def extract_yaml_candidates(content)
          fenced = content.to_s.scan(/```(?:yaml|yml)?\s*\n([\s\S]*?)```/i).flatten.map(&:strip).reject(&:blank?)
          return fenced if fenced.any?

          stripped = content.to_s.strip
          stripped.start_with?('id:') ? [ stripped ] : []
        end

        def parse_json(value)
          return if value.blank?

          JSON.parse(value)
        rescue JSON::ParserError
          parse_yaml_like_hash(value)
        end

        def parse_yaml_like_hash(value)
          parsed = YAML.safe_load(value)
          parsed.is_a?(Hash) ? parsed.deep_stringify_keys : nil
        rescue Psych::SyntaxError
        end
      end
    end
  end
end
