# frozen_string_literal: true

module Llm
  module Assistant
    class ChatRunner
      Result = Struct.new(:chat, :assistant_message, keyword_init: true)

      class << self
        def suggest_title(content)
          normalized = content.to_s.squish.truncate(60, separator: ' ', omission: '...')
          normalized.presence || 'New chat'
        end
      end

      def initialize(chat:, setting:)
        @chat = chat
        @setting = setting
      end

      def call(content:, assistant_context: nil)
        raise Llm::Error, 'LLM settings are not configured' unless setting_configured?

        content_text = content.to_s
        previous_message_id = chat.ai_messages.maximum(:id)
        no_prior_messages = previous_message_id.nil?
        previous_message_id ||= 0
        normalized_context = Llm::ContextNormalizer.call(assistant_context || {})

        assistant_message = if tool_calling_enabled?
          run_tool_agent(content_text, normalized_context, previous_message_id)
        else
          run_plain_chat(content_text, normalized_context)
        end

        # Update after a successful LLM call so a failed attempt doesn't bump updated_at
        # and push the chat to the top of the recent list with stale provider/model data.
        chat.update!(
          last_used_provider: setting.provider,
          last_used_model: setting.model
        )
        maybe_assign_chat_title(content_text) if no_prior_messages

        chat.reload
        draft_target = draft_target_from_context(normalized_context)
        draft = Llm::SystemEditor::DraftExtractor.call(
          chat,
          source_yaml_hash: normalized_context.dig(:editor_context, :yaml_hash),
          after_message_id: previous_message_id,
          suggested_target: draft_target
        )
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
        return unless chat.title == 'New chat'

        chat.update!(title: self.class.suggest_title(content))
      end

      def run_tool_agent(content_text, normalized_context, previous_message_id)
        chat.context = Llm::RuntimeContext.build(setting)
        chat.with_model(setting.model, provider: Llm::ProviderCatalog.runtime_provider(setting.provider).to_sym, assume_exists: true)
        chat.with_temperature(setting.temperature.to_f)

        agent = Llm::Assistant::Agent.new(chat:, assistant_context: normalized_context, persist_instructions: false)
        agent.ask(content_text)

        chat.ai_messages.where(role: 'assistant').where('id > ?', previous_message_id).order(:created_at, :id).last
      rescue StandardError => e
        Rails.logger.error("[ChatRunner] tool agent failed: #{e.class}: #{e.message}")
        orphan_ids = chat.ai_messages.where('id > ?', previous_message_id).pluck(:id)
        if orphan_ids.any?
          # ai_messages.ai_tool_call_id ↔ ai_tool_calls.ai_message_id is a circular FK.
          # Break the cycle first, then delete both sides, then broadcast once.
          ApplicationRecord.transaction do
            AiMessage.where(id: orphan_ids).update_all(ai_tool_call_id: nil)
            AiToolCall.where(ai_message_id: orphan_ids).delete_all
            AiMessage.where(id: orphan_ids).delete_all
          end
          Llm::Assistant::ChatBroadcaster.broadcast(chat)
        end
        raise
      end

      def run_plain_chat(content_text, normalized_context)
        user_message = chat.ai_messages.create!(role: 'user', content: content_text)

        llm_chat = RubyLLM.chat(
          model: setting.model,
          provider: Llm::ProviderCatalog.runtime_provider(setting.provider).to_sym,
          assume_model_exists: true,
          context: Llm::RuntimeContext.build(setting)
        )
        llm_chat.with_temperature(setting.temperature.to_f)

        # Replay history without the current user message, then append it last with
        # instructions attached. Instructions (including the workspace snapshot) go on
        # the current turn only — the model always has the up-to-date context, and
        # replaying stale snapshots from prior turns would be wrong, not helpful.
        # This asymmetry with the tool-agent path (system-prompt) is intentional.
        chat.visible_messages
          .where('content IS NOT NULL OR content_raw IS NOT NULL OR thinking_text IS NOT NULL')
          .where.not(id: user_message.id)
          .order(:created_at, :id)
          .each do |message|
          content = message.display_content.to_s
          next if content.blank?

          llm_chat.add_message(role: message.role.to_sym, content:)
        end

        llm_chat.add_message(
          role: :user,
          content: "#{plain_chat_instructions(normalized_context)}\n\nUser request:\n#{content_text}"
        )

        response = llm_chat.complete
        chat.ai_messages.create!(
          role: 'assistant',
          content: response.content.to_s,
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
          Llm::SystemEditor::ContextBuilder.plain_chat_instructions_prompt,
          assistant_context: normalized_context,
          assistant_context_json: Llm::SystemEditor::ContextBuilder.prompt_json_normalized(normalized_context)
        )
      end

      def draft_target_from_context(normalized_context)
        linked_target = normalized_context[:linked_target].to_h
        editor_context = normalized_context[:editor_context].to_h
        system_id = linked_target[:system_id].presence || editor_context[:system_id].presence
        source_path = linked_target[:source_path].presence || editor_context[:source_path].presence
        return unless system_id || source_path

        {
          type: 'system_editor',
          system_id:,
          source_path:
        }
      end

      def persist_draft_metadata(message, draft)
        # update_columns skips after_commit so the broadcast below is the only one fired
        # for this update — avoiding a double-render on the initiating client while still
        # pushing the draft to any other open tabs subscribed to this chat.
        message.update_columns(metadata: message.metadata.merge('draft' => draft.merge(
          'origin_chat_id' => chat.id,
          'origin_message_id' => message.id
        )))
        Llm::Assistant::ChatBroadcaster.broadcast(chat)
      end
    end
  end
end
