# Research YAML DSL — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/09-research-systems.md`, `config/research/systems`.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Represent server-side research systems as versionable YAML files with modules, parameters, conditions and optimization metadata.

## Current Contract

1. System YAML must load deterministically from configured paths.
2. Validation must catch missing required sections and unsupported modules/operators.
3. Condition expressions must resolve candle fields, module aliases, params and helpers consistently.
4. Invalid systems must return actionable errors for UI and API consumers.
5. Optimization metadata must identify parameter names/ranges without executing backtests.

## Non-Scope

- Arbitrary Ruby execution from YAML.
- Replacing frontend data-grid systems.
- User-uploaded untrusted code execution.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Valid sample systems load and validate.
- Invalid systems return structured validation errors.
- Module aliases are available to conditions as documented.
- Changed DSL behavior includes service specs and editor-facing tests if metadata changes.

## Main Implementation

- Config/data: `config/research/dictionary.yml`, `config/research/systems/ema_ribbon_10.yml`, `config/research/systems/examples/ema_fast_slow_cross.yml`.
- Services: `app/services/research/systems/catalog.rb`, `app/services/research/systems/repository.rb`, `app/services/research/systems/schema.rb`, `app/services/research/systems/definition.rb`, `app/services/research/systems/editor_metadata.rb`.
- Validation/expression: `app/services/research/systems/validation/validator.rb`, `app/services/research/systems/validation/checks/structure.rb`, `app/services/research/systems/validation/checks/conditions.rb`, `app/services/research/systems/condition_expression/parser.rb`, `app/services/research/systems/condition_expression/evaluator.rb`.
- Frontend DSL helpers: `app/javascript/research/dsl.ts`, `app/javascript/system_editor/condition_expression.ts`, `app/javascript/system_editor/yaml_highlighter.ts`.

## Tests

- `spec/services/research/systems/example_systems_spec.rb`
- `spec/services/research/systems/validation/validator_spec.rb`
- `spec/services/research/systems/condition_expression_spec.rb`
- `app/javascript/__tests__/system_editor/condition_expression.test.ts`
- `app/javascript/__tests__/system_editor/yaml_highlighter.test.ts`

## Invariants Enforced By Code

- DSL systems are loaded from configured research paths through repository/catalog services.
- Validation checks structure, conditions and optimization before execution.
- Condition expression parser/evaluator has backend specs and frontend expression helper tests.
- Example YAML systems are validated by `example_systems_spec`.

## Known Gaps / Tech Debt

- YAML DSL remains file-backed; concurrent editor writes require careful API-level handling when changed.
- Backend validator and frontend editor helpers can drift if condition syntax or aliases change without paired tests.
- Sample systems validate the current DSL floor, but do not prove every production strategy pattern.

## Verification On Change

```bash
bundle exec rspec spec/services/research/systems/example_systems_spec.rb spec/services/research/systems/validation/validator_spec.rb spec/services/research/systems/condition_expression_spec.rb
npm test -- app/javascript/__tests__/system_editor/condition_expression.test.ts app/javascript/__tests__/system_editor/yaml_highlighter.test.ts
```
