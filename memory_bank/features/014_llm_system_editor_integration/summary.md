# LLM System Editor Integration — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/10-llm-assistant.md`, assistant tools and system editor integration.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Connect the LLM assistant to System Editor so it can help design or patch YAML research systems through validated drafts and tools.

## Current Contract

1. Assistant context must include current editor file/content when linked.
2. Tool calls must be persisted and attributable to a chat/message.
3. Draft YAML must be distinguishable from already-applied editor content.
4. Applying a draft must route through editor validation/save behavior.
5. Failed tools or invalid drafts must be visible without losing chat/editor state.
6. Harness mode must constrain prompt/tool behavior to the intended workflow.

## Non-Scope

- Applying LLM output automatically without user/editor validation.
- Editing arbitrary repo files.
- Allowing tools to execute untrusted code.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Assistant can use linked editor context in design/patch workflows.
- Drafts can be previewed and validated before apply.
- Invalid draft output is rejected with actionable errors.
- Tool-call persistence captures tool name, input/output/error state where supported.
- Changed integration behavior has request/service/frontend tests.

## Main Implementation

- Services: `app/services/llm/system_editor/context_builder.rb`, `app/services/llm/system_editor/draft_envelope.rb`, `app/services/llm/system_editor/draft_extractor.rb`, `app/services/llm/system_editor/knowledge_base.rb`.
- Tools: `app/services/llm/system_editor/tools/apply_system_draft_tool.rb`, `app/services/llm/system_editor/tools/load_dsl_reference_tool.rb`, `app/services/llm/system_editor/tools/load_example_system_tool.rb`, `app/services/llm/system_editor/tools/validate_system_yaml_tool.rb`.
- Frontend: `app/javascript/assistant/draft_service.ts`, `app/javascript/workspace/assistant_coordinator.ts`, `app/javascript/workspace/system_editor_coordinator.ts`, `app/javascript/controllers/assistant_controller.ts`.
- Prompt data: `app/prompts/llm/system_editor/dsl.yml`, `app/prompts/llm/system_editor/examples.yml`, `app/prompts/llm/system_editor/modules_meta.yml`, `app/prompts/llm/system_editor/plain_chat_instructions.txt.erb`.

## Tests

- `spec/services/llm/system_editor/draft_extractor_spec.rb`
- `spec/services/llm/assistant/chat_runner_spec.rb`
- `spec/requests/api/assistant_chats_spec.rb`
- `app/javascript/__tests__/assistant/draft_service.test.ts`
- `app/javascript/__tests__/workspace/assistant_coordinator.test.ts`
- `app/javascript/__tests__/workspace/system_editor_coordinator.test.ts`

## Invariants Enforced By Code

- Draft extraction is isolated and tested in backend/frontend draft tests.
- Assistant/editor workspace coordination uses explicit events/coordinators.
- System draft validation routes through research system validation tools.

## Known Gaps / Tech Debt

- Tool-level request coverage is concentrated in assistant chat specs; individual tool specs would make regressions easier to localize.
- Draft provenance and overwrite safety are critical because assistant output can propose file changes.
- Invalid LLM output must continue to route through System Editor validation before any apply/save path.

## Verification On Change

```bash
bundle exec rspec spec/services/llm/system_editor/draft_extractor_spec.rb spec/services/llm/assistant/chat_runner_spec.rb spec/requests/api/assistant_chats_spec.rb
npm test -- app/javascript/__tests__/assistant/draft_service.test.ts app/javascript/__tests__/workspace/assistant_coordinator.test.ts app/javascript/__tests__/workspace/system_editor_coordinator.test.ts
```
