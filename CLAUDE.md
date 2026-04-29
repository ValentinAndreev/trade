Read **memory_bank/index.md** first. It contains the project map, reading hierarchy, workflow rules, and canonical command menu.

## Stack

Rails 8, Ruby 4.0.1, PostgreSQL 17, TimescaleDB, Solid Queue, Solid Cable, TypeScript, Stimulus, Tailwind CSS, AG Grid, Lightweight Charts, Vitest, RSpec, RBS/Steep.

## Quick Commands

- `bin/setup` - bootstrap app and database
- `bin/dev` - run Rails, Solid Queue, JS watcher, CSS watcher
- `bundle exec rspec` - backend test suite
- `npm test` - frontend test suite
- `npm run typecheck` - TypeScript check
- `bundle exec steep check` - Ruby type check
- `bin/rubocop` - Ruby style
- `bin/brakeman --no-pager` - Rails security scan
- `bin/bundler-audit` - gem CVE scan
- `npm audit --audit-level=high` - npm security scan
- `bin/memory-bank-check` - memory-bank structure/path check

Development and CI details live in `memory_bank/ops/development.md` and `memory_bank/ops/ci.md`.

## Constraints Source

Hard constraints and autonomy boundaries live in `memory_bank/engineering/conventions.md`. Do not duplicate them here; update the conventions file when a rule changes.

## Memory Bank Conventions

- Process rules live in `memory_bank/workflow.md`, `memory_bank/index.md`, `.prompts/`, and `bin/memory-bank-check`.
- Large forward work follows `brief: <идея>` -> `review brief: <id>` -> `spec: <id>` -> `review spec: <id>` -> `plan: <id>` -> `review plan: <id>` -> `impl: <id>` -> `review: <id>`.
- Memory bank language: root docs RU, feature packages EN, inline prompt artifact examples EN.
