# System Editor — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/06-ui-workflows.md`, `docs/09-research-systems.md`, system editor code.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Provide a workspace editor for YAML research systems with file catalog, validation, highlighting and authoring assistance.

## Current Contract

1. File operations must be scoped to allowed research system paths.
2. Validation must use server-compatible DSL semantics.
3. Invalid YAML must be editable but clearly marked invalid.
4. Async requests must respect controller disconnect/abort lifecycle.
5. Editor state must be shareable with Assistant and Research integrations.
6. Save/rename/delete errors must not silently discard editor content.

## Non-Scope

- Arbitrary filesystem access.
- Editing non-research application files.
- Making invalid YAML executable.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- User can select, edit and save an allowed system file.
- Invalid system text shows actionable validation errors.
- Rename/delete failures preserve UI clarity and local editor content.
- Frontend tests cover changed file-picker/editor lifecycle behavior.
- Request/service specs cover changed backend file operations.

## Main Implementation

- API/services: `app/controllers/api/research/catalog_controller.rb`, `app/controllers/api/research/systems_controller.rb`, `app/services/research/systems/repository.rb`, `app/services/research/systems/path_helpers.rb`, `app/services/research/systems/editor_metadata.rb`, `app/services/research/systems/validation/validator.rb`.
- Frontend: `app/javascript/controllers/system_editor_controller.ts`, `app/javascript/system_editor/editor_core.ts`, `app/javascript/system_editor/file_picker.ts`, `app/javascript/system_editor/state.ts`, `app/javascript/system_editor/validation.ts`, `app/javascript/system_editor/autocomplete.ts`, `app/javascript/system_editor/templates.ts`.
- Workspace: `app/javascript/workspace/system_editor_coordinator.ts`, `app/javascript/workspace/events.ts`.

## Tests

- `spec/requests/api/research_spec.rb`
- `spec/services/research/systems/validation/validator_spec.rb`
- `app/javascript/__tests__/system_editor/state.test.ts`
- `app/javascript/__tests__/system_editor/condition_expression.test.ts`
- `app/javascript/__tests__/system_editor/yaml_highlighter.test.ts`
- `app/javascript/__tests__/workspace/system_editor_coordinator.test.ts`
- `app/javascript/__tests__/services/api_fetch.test.ts`

## Invariants Enforced By Code

- Research system path handling is centralized in repository/path helper services.
- Editor validation uses server-side research validation semantics.
- Frontend editor state and coordinator behavior have dedicated tests.
- `apiFetch` abort behavior is tested and should be respected by editor requests.

## Known Gaps / Tech Debt

- File operation request specs are grouped under `spec/requests/api/research_spec.rb`; split specs would improve reviewability.
- Path safety depends on repository/path helper services and should be re-reviewed before expanding editable paths.
- Editor async lifecycle relies on abort-safe `apiFetch` behavior; UI races need focused frontend review when changed.

## Verification On Change

```bash
bundle exec rspec spec/requests/api/research_spec.rb spec/services/research/systems/validation/validator_spec.rb
npm test -- app/javascript/__tests__/system_editor/state.test.ts app/javascript/__tests__/system_editor/condition_expression.test.ts app/javascript/__tests__/system_editor/yaml_highlighter.test.ts app/javascript/__tests__/workspace/system_editor_coordinator.test.ts app/javascript/__tests__/services/api_fetch.test.ts
```
