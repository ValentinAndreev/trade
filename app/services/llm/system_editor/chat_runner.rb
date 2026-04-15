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
        raise Llm::Error, 'LLM settings are not configured' unless setting_configured?

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

        assistant_message = if tool_calling_enabled?
          run_tool_agent(content_text, normalized_context)
        else
          run_plain_chat(content_text, normalized_context)
        end

        chat.reload
        draft = DraftExtractor.call(chat, source_yaml_hash: normalized_context[:yaml_hash], after_message_id: previous_message_id)
        persist_draft_metadata(assistant_message, draft) if assistant_message && draft

        Result.new(chat:, assistant_message:)
      end

      private

      attr_reader :chat, :setting

      def setting_configured? = Llm::ProviderCatalog.setting_configured?(setting)

      def tool_calling_enabled?
        Llm::ProviderCatalog.tool_calling_enabled?(provider: setting.provider, model: setting.model, api_base: setting.api_base)
      end

      def maybe_assign_chat_title(content)
        return unless chat.title.blank? || chat.title == 'New chat'

        chat.update!(title: self.class.suggest_title(content))
      end

      def run_tool_agent(content_text, normalized_context)
        chat.context = RuntimeContext.build(setting)
        chat.with_model(setting.model, provider: Llm::ProviderCatalog.runtime_provider(setting.provider).to_sym, assume_exists: true)

        agent = Llm::SystemEditorAgent.new(chat:, editor_context: normalized_context, persist_instructions: false)
        agent.chat.with_temperature(setting.temperature.to_f)
        agent.ask(content_text)

        chat.ai_messages.where(role: 'assistant').order(:created_at, :id).last
      end

      def run_plain_chat(content_text, normalized_context)
        user_message = chat.ai_messages.create!(role: 'user', content: content_text)

        llm_chat = RubyLLM.chat(
          model: setting.model,
          provider: Llm::ProviderCatalog.runtime_provider(setting.provider).to_sym,
          assume_model_exists: true,
          context: RuntimeContext.build(setting)
        )
        llm_chat.with_temperature(setting.temperature.to_f)

        # Instructions are prepended to the first user message in history so they act
        # as a system-prompt substitute when replaying the full conversation each turn.
        instructions_prepended = false
        chat.visible_messages.order(:created_at, :id).select(&:displayable?).each do |message|
          content = message.display_content.to_s
          next if content.blank?

          if !instructions_prepended && message.role == 'user'
            content = "#{plain_chat_instructions(normalized_context)}\n\nUser request:\n#{content}"
            instructions_prepended = true
          end

          llm_chat.add_message(role: message.role.to_sym, content:)
        end

        response = llm_chat.complete
        chat.ai_messages.create!(
          role: 'assistant',
          content: serialize_response_content(response.content),
          thinking_text: response.thinking&.text,
          input_tokens: response.input_tokens,
          output_tokens: response.output_tokens
        )
      rescue StandardError
        user_message&.destroy
        raise
      end

      def plain_chat_instructions(normalized_context)
        Llm::PromptLibrary.render(
          "#{Llm::SystemEditor::KnowledgeBase::PROMPT_NAMESPACE}/plain_chat_instructions",
          editor_context: normalized_context,
          editor_context_json: ContextBuilder.prompt_json(editor_context: normalized_context)
        )
      end

      def serialize_response_content(content)
        return content if content.is_a?(String)
        return content.text if content.respond_to?(:text)
        return JSON.generate(content) if content.is_a?(Array) || content.is_a?(Hash)

        content.to_s
      rescue StandardError => e
        Rails.logger.warn("ChatRunner#serialize_response_content failed (#{content.class}): #{e.message}")
        content.to_s
      end

      def persist_draft_metadata(message, draft) = message.update!(metadata: message.metadata.merge('draft' => draft))
    end
  end
end
