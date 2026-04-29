# Memory Bank Process — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `memory_bank/`, `.prompts/`, `CLAUDE.md`.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Add a repository-local development memory bank and prompt workflow modeled after `llm-learn`.

## Current Contract

1. `memory_bank/index.md` must be the entry point and list reading order.
2. Prompts must define fail-fast preconditions for missing input artifacts.
3. Workflow docs must define review-note status and stage gates.
4. Project docs must summarize stack, glossary, conventions and checks.
5. Backfilled feature packages must use `summary.md` and state that they document current shipped implementation.
6. `process/current-focus.md` must identify the active task and next step.
7. Canonical forward lifecycle includes `impl: <id>` between `review plan: <id>` and `review: <id>`.
8. Future large changes on shipped behavior start with forward `brief.md` using the relevant `summary.md` as context.
9. Explicit `review: <id>` writes `reviews/impl.md`; retrospective backfill does not create that note automatically.

## Non-Scope

- Changing application runtime behavior.
- Replacing existing `docs/`.
- Adding dependencies for memory-bank validation.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- `.prompts` contains orient, brief, spec, plan, review-code and fix-review prompts.
- `CLAUDE.md` points agents to `memory_bank/index.md` as the command menu source.
- `memory_bank/features/index.md` lists all feature packages.
- `memory_bank/features/coverage.md` maps PRD areas and owning paths to feature packages.
- Each listed retrospective feature has `summary.md`; forward features use `brief.md`, `spec.md` and `plan.md`.
- Documentation sanity checks pass.

## Main Implementation

- Entry point: `CLAUDE.md`.
- Prompts: `.prompts/orient.md`, `.prompts/brief.md`, `.prompts/spec.md`, `.prompts/plan.md`, `.prompts/review-code.md`, `.prompts/fix-review.md`.
- Process docs: `memory_bank/index.md`, `memory_bank/workflow.md`, `memory_bank/process/current-focus.md`.
- Project docs: `memory_bank/prd.md`, `memory_bank/project/overview.md`, `memory_bank/project/glossary.md`, `memory_bank/engineering/conventions.md`.
- Ops docs: `memory_bank/ops/development.md`, `memory_bank/ops/ci.md`.
- Feature index and coverage: `memory_bank/features/index.md`, `memory_bank/features/coverage.md`.
- Validator: `bin/memory-bank-check`.

## Tests

- `bin/memory-bank-check`
- `spec/bin/memory_bank_check_spec.rb`
- `ruby -c bin/memory-bank-check`
- Whitespace validation: `git diff --check`.

## Invariants Enforced By Code

- Workflow documents define fail-fast behavior for missing artifacts.
- `current-focus.md` must not claim `done` while pointing to an unfinished blocking review.
- Prompts and workflow documents define mandatory grounding sections for retrospective summaries and forward artifacts.
- Validator enforces entrypoint/prompt/session-menu files, blocking review gates, current focus shape and review-note status/path consistency.

## Known Gaps / Tech Debt

- `bin/memory-bank-check` covers structural drift and lifecycle gates, but not semantic correctness of package boundaries.
- Prompt routing, `memory_bank/index.md` and `CLAUDE.md` can drift; `memory_bank/index.md` is the canonical command map.
- Backfilled summaries are structural contracts; they are not semantic code reviews of every feature package.

## Verification On Change

```bash
find .prompts -maxdepth 1 -type f | sort
bin/memory-bank-check
bundle exec rspec spec/bin/memory_bank_check_spec.rb
ruby -c bin/memory-bank-check
git diff --check
```
