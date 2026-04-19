# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Llm::Assistant::ChatRunner do
  let(:user) { create(:user, password: 'password123') }
  let(:chat) { user.ai_chats.create!(title: 'New chat') }

  describe '.suggest_title' do
    it 'uses the prompt text as-is for the title' do
      expect(described_class.suggest_title('simple ema cross')).to eq('simple ema cross')
    end

    it 'collapses whitespace before truncation' do
      content = <<~TEXT
        fix exits in
        trend system
      TEXT

      expect(described_class.suggest_title(content)).to eq('fix exits in trend system')
    end

    it 'falls back to New chat when the message is empty' do
      expect(described_class.suggest_title(" \n\t ")).to eq('New chat')
    end
  end

  describe '#call' do
    let(:editor_context) do
      {
        system_yaml: "id: alpha\nname: Alpha",
        system_id: 'alpha',
        source_path: 'systems/alpha.yml',
        yaml_hash: 'abc123',
        diagnostics: []
      }
    end

    it 'uses the tool agent for tool-capable remote models' do
      setting = user.llm_settings.create!(
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        api_key: 'secret-key',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      agent = instance_double(Llm::Assistant::Agent, ask: nil)
      agent_chat = instance_double(AiChat, with_temperature: nil)
      allow(agent).to receive(:chat).and_return(agent_chat)
      allow(Llm::Assistant::Agent).to receive(:new).and_return(agent)
      allow(chat).to receive(:context=)
      allow(chat).to receive(:with_model)
      allow(chat).to receive(:with_temperature)
      allow(chat.ai_messages).to receive(:maximum).and_return(0)
      allow(chat.ai_messages).to receive_message_chain(:where, :where, :order, :last).and_return(nil)
      allow(Llm::SystemEditor::DraftExtractor).to receive(:call).and_return(nil)

      described_class.new(chat:, setting:).call(content: 'Fix the exits', assistant_context: { editor_context: })

      expect(Llm::Assistant::Agent).to have_received(:new)
      expect(agent).to have_received(:ask).with('Fix the exits')
    end

    it 'normalizes assistant_context and passes it to the agent without mutating chat targeting' do
      setting = user.llm_settings.create!(
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        api_key: 'secret-key',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      agent = instance_double(Llm::Assistant::Agent, ask: nil)
      agent_chat = instance_double(AiChat, with_temperature: nil)
      allow(agent).to receive(:chat).and_return(agent_chat)
      allow(Llm::Assistant::Agent).to receive(:new).and_return(agent)
      allow(chat).to receive(:context=)
      allow(chat).to receive(:with_model)
      allow(chat).to receive(:with_temperature)
      allow(chat.ai_messages).to receive(:maximum).and_return(0)
      allow(chat.ai_messages).to receive_message_chain(:where, :where, :order, :last).and_return(nil)
      allow(Llm::SystemEditor::DraftExtractor).to receive(:call).and_return(nil)

      described_class.new(chat:, setting:).call(
        content: 'Fix the exits',
        assistant_context: {
          host_type: 'assistant_tab',
          harness: 'system_patch',
          linked_target: {
            type: 'system_editor',
            tab_id: 'tab-5',
            system_id: 'alpha',
            source_path: 'systems/alpha.yml'
          },
          workspace_snapshot: {
            active_tab_id: 'tab-1',
            tabs: [
              { id: 'tab-1', type: 'assistant', label: 'Assistant', source_path: nil, system_id: nil },
              { id: 'tab-5', type: 'system_editor', label: 'System editor', source_path: 'systems/alpha.yml', system_id: 'alpha' }
            ]
          },
          referenced_tab_ids: [],
          editor_context:
        }
      )

      # The normalized context is correctly forwarded to the agent
      expect(Llm::Assistant::Agent).to have_received(:new).with(
        hash_including(
          assistant_context: include(
            host_type: 'assistant_tab',
            harness: 'system_patch',
            linked_target: include(
              type: 'system_editor',
              source_path: 'systems/alpha.yml',
              system_id: 'alpha'
            ),
            editor_context: include(
              source_path: 'systems/alpha.yml',
              system_id: 'alpha'
            )
          )
        )
      )
    end

    it 'falls back to a plain chat without tools for local endpoints' do
      setting = user.llm_settings.create!(
        provider: 'openai',
        model: 'qwen3.5_9B',
        api_base: 'http://127.0.0.1:8080/v1',
        temperature: 0.2,
        max_output_tokens: 4000
      )

      llm_chat = instance_double(RubyLLM::Chat, with_temperature: nil, complete: nil)
      response = double(
        content: <<~TEXT,
          ```yaml
          id: alpha_fixed
          name: Alpha Fixed

          modules:
            ema:
              type: ema
              period: 20

          params:
            position_mode: long_short

          conditions:
            long_entry: "close >> ema.value"
            long_exit: "close << ema.value"
            short_entry: "close << ema.value"
            short_exit: "close >> ema.value"
          ```
        TEXT
        thinking: nil,
        input_tokens: 11,
        output_tokens: 22
      )

      allow(RubyLLM).to receive(:chat).and_return(llm_chat)
      allow(llm_chat).to receive(:add_message)
      allow(llm_chat).to receive(:complete).and_return(response)
      allow(Llm::Assistant::Agent).to receive(:new)

      result = described_class.new(chat:, setting:).call(content: 'Fix the exits', assistant_context: { editor_context: })

      expect(Llm::Assistant::Agent).not_to have_received(:new)
      expect(RubyLLM).to have_received(:chat)
      expect(llm_chat).to have_received(:add_message).at_least(:once)
      expect(chat.ai_messages.order(:id).pluck(:role)).to eq(%w[user assistant])
      expect(result.assistant_message.metadata['draft']).to include(
        'kind' => 'system_draft',
        'yaml' => include('id: alpha_fixed')
      )
      expect(result.assistant_message.metadata['draft']).to include(
        'suggested_target' => {
          'type' => 'system_editor',
          'system_id' => 'alpha',
          'source_path' => 'systems/alpha.yml'
        },
        'origin_chat_id' => chat.id,
        'origin_message_id' => result.assistant_message.id
      )
    end

    it 'uses the OpenAI-compatible runtime for llama.cpp provider' do
      setting = user.llm_settings.create!(
        provider: 'llama',
        model: 'Qwen3.5-9B-Q6_K',
        api_base: 'http://127.0.0.1:8080/v1',
        temperature: 0.2,
        max_output_tokens: 4000,
        launch_config: {
          'binary_path' => '~/llama.cpp/build/bin/llama-server',
          'model_path' => '~/models/Qwen3.5-9B-Q6_K.gguf',
          'bind_host' => '0.0.0.0',
          'client_host' => '127.0.0.1',
          'port' => 8080,
          'extra_args' => '-ngl 99'
        }
      )

      llm_chat = instance_double(RubyLLM::Chat, with_temperature: nil, complete: nil)
      response = double(content: 'I am Qwen3.5-9B-Q6_K', thinking: nil, input_tokens: 5, output_tokens: 7)

      allow(RubyLLM).to receive(:chat).and_return(llm_chat)
      allow(llm_chat).to receive(:add_message)
      allow(llm_chat).to receive(:complete).and_return(response)

      described_class.new(chat:, setting:).call(content: 'What model are you?', assistant_context: { editor_context: })

      expect(RubyLLM).to have_received(:chat).with(hash_including(provider: :openai, model: 'Qwen3.5-9B-Q6_K'))
    end
  end
end
