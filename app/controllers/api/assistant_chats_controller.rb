# frozen_string_literal: true

class Api::AssistantChatsController < Api::ApplicationController
  before_action :require_auth
  before_action :set_chat, only: %i[show update destroy create_message]

  def index
    chats = current_user.ai_chats.recent.limit(30).preload(:last_preview_message)

    render json: { chats: chats.map { |chat| Llm::Assistant::ChatPayloadBuilder.chat_summary(chat) } }
  end

  def create
    chat = current_user.ai_chats.create!(
      title: params[:title].presence || 'New chat'
    )

    render json: chat_payload(chat), status: :created
  end

  def show = render json: chat_payload(@chat)

  def update
    @chat.update!(title: params[:title].to_s.strip.presence || @chat.title)
    render json: chat_payload(@chat)
  end

  def destroy
    @chat.destroy!
    render json: { ok: true }
  end

  def create_message
    provider = params[:provider].presence
    setting = provider ? current_user.llm_setting_for(provider) : current_user.active_llm_setting
    return render json: { error: 'LLM settings are not configured' }, status: :unprocessable_content unless llm_setting_configured?(setting)

    result = Llm::Assistant::ChatRunner.new(
      chat: @chat,
      setting: setting
    ).call(
      content: params.require(:content),
      assistant_context: assistant_context_params
    )

    render json: chat_payload(result.chat)
  rescue RubyLLM::Error, Llm::Error => e
    render json: { error: e.message }, status: :unprocessable_content
  end

  private

  def set_chat
    @chat = current_user.ai_chats.find(params[:id])
  end

  def assistant_context_params
    return {} unless params[:assistant_context].present?

    params.require(:assistant_context).permit(
      :host_type,
      referenced_tab_ids: [],
      linked_target: %i[type tab_id system_id source_path],
      workspace_snapshot: [
        :active_tab_id,
        { tabs: %i[id type label source_path system_id] }
      ],
      editor_context: [
        :system_yaml,
        :system_id,
        :source_path,
        :yaml_hash,
        { diagnostics: %i[message line column length code path] }
      ]
    ).to_h
  end

  def llm_setting_configured?(setting) = Llm::ProviderCatalog.setting_configured?(setting)

  def chat_payload(chat) = Llm::Assistant::ChatPayloadBuilder.call(chat)
end
