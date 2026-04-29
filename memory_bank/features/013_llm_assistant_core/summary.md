# LLM Assistant Core — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/10-llm-assistant.md`, assistant models/API/frontend.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Provide an in-app LLM assistant that can chat with workspace context and use configured providers safely.

## Current Contract

1. Provider settings must validate provider/model/API key requirements.
2. API keys must remain encrypted at rest.
3. Chats and messages must persist with user/session scope.
4. Assistant requests must include normalized, bounded context.
5. Tool calls must be recorded when executed.
6. Errors must be visible to UI without corrupting chat history.

## Non-Scope

- Unlimited provider support without explicit scope.
- Letting LLM output mutate systems without validation.
- Public multi-user chat product.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- A configured provider can receive a chat request and return a message.
- Missing/invalid provider settings return actionable errors.
- Chat history survives reload.
- Tool-call records are associated with assistant messages where applicable.
- Backend request/model/service specs cover changed behavior; frontend tests cover UI state logic.

## Main Implementation

- Models: `app/models/ai_chat.rb`, `app/models/ai_message.rb`, `app/models/ai_tool_call.rb`, `app/models/llm_setting.rb`, `app/models/ai_model.rb`.
- API/Realtime: `app/controllers/api/assistant_chats_controller.rb`, `app/controllers/api/llm_settings_controller.rb`, `app/channels/assistant_chat_channel.rb`.
- Services: `app/services/llm/assistant/chat_runner.rb`, `app/services/llm/assistant/chat_payload_builder.rb`, `app/services/llm/assistant/chat_broadcaster.rb`, `app/services/llm/context_normalizer.rb`, `app/services/llm/provider_catalog.rb`, `app/services/llm/llama_server_manager.rb`.
- Frontend: `app/javascript/controllers/assistant_controller.ts`, `app/javascript/assistant/api.ts`, `app/javascript/assistant/chat_service.ts`, `app/javascript/assistant/settings_service.ts`, `app/javascript/assistant/state.ts`, `app/javascript/assistant/templates.ts`.

## Tests

- `spec/models/ai_message_spec.rb`
- `spec/requests/api/assistant_chats_spec.rb`
- `spec/requests/api/llm_settings_spec.rb`
- `spec/services/llm/assistant/chat_runner_spec.rb`
- `spec/services/llm/provider_catalog_spec.rb`
- `spec/services/llm/llama_server_manager_spec.rb`
- `app/javascript/__tests__/assistant/state.test.ts`
- `app/javascript/__tests__/workspace/assistant_coordinator.test.ts`

## Invariants Enforced By Code

- `AiChat` belongs to `User`, has default title and recent ordering.
- `AiMessage` requires role/chat and broadcasts visible user/assistant messages after commit.
- `AiToolCall` requires unique `tool_call_id`.
- `LlmSetting` encrypts `api_key`, enforces provider uniqueness per user and validates model/temperature/token limits.

## Known Gaps / Tech Debt

- Provider behavior depends on external services; specs cover catalog/settings/runner boundaries, not real provider uptime.
- Chat/message/tool-call persistence has coupled FK and broadcast behavior; destructive cleanup or cascade changes need review.
- Provider secrets and local llama server behavior are operationally sensitive and should stay out of docs/fixtures.

## Verification On Change

```bash
bundle exec rspec spec/models/ai_message_spec.rb spec/requests/api/assistant_chats_spec.rb spec/requests/api/llm_settings_spec.rb spec/services/llm/assistant/chat_runner_spec.rb spec/services/llm/provider_catalog_spec.rb spec/services/llm/llama_server_manager_spec.rb
npm test -- app/javascript/__tests__/assistant/state.test.ts app/javascript/__tests__/workspace/assistant_coordinator.test.ts
```
