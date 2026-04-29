# Engineering Conventions

## Архитектура

- Следовать текущему Rails monolith и существующей структуре frontend-модулей.
- Новые abstractions добавлять только если они уменьшают реальную сложность или повторяют локальный паттерн.
- Для workspace frontend предпочитать coordinators в `app/javascript/workspace` и actions в `app/javascript/tabs`.
- Не менять существующие миграции; schema changes идут новой миграцией.
- Не добавлять gems/npm packages без явного запроса.

## Ruby

- Бизнес-логика временных рядов, research и LLM tools живет в `app/services`.
- API controllers остаются thin JSON endpoints.
- Для новых Ruby-классов и публичных методов добавлять RBS в `sig/`.
- RBS file path mirrors the Ruby constant path in snake_case under `sig/`: `App::Services::FooBar` -> `sig/app/services/foo_bar.rbs`.
- Проверка: `bundle exec steep check`.

## TypeScript

- Stimulus controllers держать тонкими; feature logic выносить в modules/coordinators.
- Shared DOM events именовать через constants, если событие используется между слоями.
- Для async lifecycle использовать `AbortSignal` или явные disconnect guards.
- Проверки: `npm run typecheck`, `npm test`.

## Feature Contracts

Detailed feature invariants live in `memory_bank/features/<id>_<slug>/summary.md` or forward `spec.md`. Do not duplicate those contracts here.

When changing storage contracts, persistent frontend state, auth boundaries, DSL execution, LLM tools, jobs/channels or cross-feature event payloads:

- read the relevant feature summary/spec first;
- add or update focused tests for the changed contract;
- keep backward compatibility explicit, or document the migration/breaking change in the feature artifact.

## Testing Policy

Обязательно покрывать:

- models: validations, scopes, DB-backed invariants;
- services: happy path, edge path, external-provider failures;
- request specs: API contracts and auth boundaries;
- jobs/channels: scheduling, progress, broadcasts, side effects;
- frontend modules: persistence, coordinators, event routing, deterministic domain logic.

Не обязательно покрывать:

- простые Rails defaults без логики;
- декоративную верстку без поведения;
- повторяющие UI states, если contract уже покрыт module tests.

## Verification Commands

Для крупных изменений:

```bash
bundle exec rspec
npm test
npm run typecheck
bundle exec steep check
bin/rubocop
bin/brakeman --no-pager
bin/bundler-audit
npm audit --audit-level=high
```

Для узких frontend changes минимум:

```bash
npm run typecheck
npm test
```

Для узких backend changes минимум:

```bash
bundle exec rspec <relevant spec>
bundle exec steep check
```

## Autonomy Boundaries

Агент делает сам:

- читает код, docs, RBS и тесты;
- пишет focused tests;
- меняет docs/memory-bank;
- реализует изменения в рамках approved spec/plan;
- запускает релевантные проверки.

Агент спрашивает перед тем как:

- добавить dependency;
- изменить существующую миграцию или переписать `db/schema.rb` вручную;
- менять production deployment/credentials;
- менять `Preset.payload`, `localStorage` или IndexedDB schema без migration/compatibility plan;
- удалять существующие migrations, specs или data files;
- расширять scope фичи за пределы brief/spec.
