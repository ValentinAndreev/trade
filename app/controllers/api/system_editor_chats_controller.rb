# frozen_string_literal: true

class Api::SystemEditorChatsController < Api::ApplicationController
  before_action :require_auth
  before_action :set_chat, only: %i[show update destroy create_message]

  def index
    chats = current_user.ai_chats.includes(:ai_messages).recent
    chats = chats.where(source_path: params[:source_path]) if params[:source_path].present?

    render json: { chats: chats.limit(30).map { |chat| chat_payload(chat)[:chat] } }
  end

  def create
    chat = current_user.ai_chats.create!(
      title: params[:title].presence || 'New chat',
      source_path: params[:source_path].presence,
      system_id: params[:system_id].presence
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

    result = Llm::SystemEditor::ChatRunner.new(
      user: current_user,
      chat: @chat,
      setting: setting
    ).call(
      content: params.require(:content),
      editor_context: editor_context_params.to_h
    )

    render json: chat_payload(result.chat)
  rescue RubyLLM::Error, Llm::Error => e
    render json: { error: e.message }, status: :unprocessable_content
  end

  private

  def set_chat
    @chat = current_user.ai_chats.find(params[:id])
  end

  def editor_context_params
    params.require(:editor_context).permit(
      :system_yaml,
      :system_id,
      :source_path,
      :yaml_hash,
      diagnostics: %i[message line column length code path]
    )
  end

  def llm_setting_configured?(setting) = Llm::ProviderCatalog.setting_configured?(setting)

  def chat_payload(chat) = Llm::SystemEditor::ChatPayloadBuilder.call(chat)
end
