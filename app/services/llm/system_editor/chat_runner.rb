# frozen_string_literal: true

module Llm
  module SystemEditor
    class ChatRunner
      Result = Struct.new(:chat, :assistant_message, keyword_init: true)

      class << self
        def suggest_title(content)
          normalized = content.to_s.squish.truncate(60, separator: ' ', omission: '...')
          normalized.presence || 'New chat'
        end
      end

      def initialize(user:, chat:, setting:)
        @user = user
        @chat = chat
        @setting = setting
      end

      def call(content:, editor_context:)
        raise ArgumentError, 'LLM settings are not configured' unless setting&.api_key.present?

        content_text = content.to_s
        previous_message_id = chat.ai_messages.maximum(:id) || 0
        normalized_context = ContextBuilder.normalize_editor_context(editor_context)
        chat.update!(
          source_path: normalized_context[:source_path] || chat.source_path,
          system_id: normalized_context[:system_id] || chat.system_id,
          last_used_provider: setting.provider,
          last_used_model: setting.model
        )
        maybe_assign_chat_title(content_text)

        chat.context = RuntimeContext.build(setting)
        chat.with_model(setting.model, provider: setting.provider.to_sym, assume_exists: true)

        agent = Llm::SystemEditorAgent.new(chat:, editor_context: normalized_context, persist_instructions: false)
        agent.chat.with_temperature(setting.temperature.to_f)
        agent.ask(content_text)

        chat.reload
        assistant_message = chat.ai_messages.where(role: 'assistant').order(:created_at, :id).last
        draft = DraftExtractor.call(chat, source_yaml_hash: normalized_context[:yaml_hash], after_message_id: previous_message_id)
        persist_draft_metadata(assistant_message, draft) if assistant_message && draft

        Result.new(chat:, assistant_message:)
      end

      private

      attr_reader :chat, :setting

      def maybe_assign_chat_title(content)
        return unless chat.title.blank? || chat.title == 'New chat'

        chat.update!(title: self.class.suggest_title(content))
      end

      def persist_draft_metadata(message, draft) = message.update!(metadata: message.metadata.merge('draft' => draft))
    end
  end
end
