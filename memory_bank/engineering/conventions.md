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
- Boundary payload has one canonical shape. Do not add helper/fallback code that accepts multiple aliases (`foo`, `fooBar`, `id`) or silently converts parser/validator failures to `nil`, unless the spec explicitly requires legacy compatibility and tests cover every accepted shape. Normalize once at the boundary, then use canonical keys with `fetch` and fail fast on malformed data.
- Не использовать defensive capability/type guards для неизвестного shape: `respond_to?`, `is_a?`, `kind_of?`, `instance_of?`, `case value when Hash/Array/...` и похожие проверки по умолчанию запрещены. Не обходить это через exception-driven dispatch (`rescue NoMethodError`, `rescue TypeError`, `rescue ArgumentError` как способ различить тип/shape/capability). Для внутренних контрактов требовать конкретный тип/shape (`Hash`, `Array`, domain object), читать canonical keys через `fetch`, а ошибочный input чинить на boundary. Такие проверки допустимы только в редких случаях реальной необходимости: polymorphic API/adapter boundary, external payload normalization boundary или точечное различение типов из-за контракта Ruby/library; каждая поддержанная ветка должна быть явным контрактом и покрываться тестами.
- Перед добавлением type/null guard нужно письменно назвать boundary и контракт: почему значение реально может быть `nil` или нескольких типов, какие формы принимаются, где они нормализуются и каким тестом это закреплено. Если boundary не назван или контракт server-owned/internal, не добавлять `nil` fallback, optional-chain fallback, `blank?`/`present?` fallback, `to_s`/`to_h`/`to_f` coercion или rescue-dispatch; читать canonical shape и fail fast.
- Не писать номера фич, исторические ссылки на задачи или implementation-slice labels в runtime code, пользовательские/API error messages, UI text и executable spec names. Такие ссылки живут только в memory_bank/docs/review artifacts; application code формулирует продуктовый контракт без `017`, `018` и похожих маркеров.
- Не использовать `send`/`__send__`/`public_send` вообще. Если код требует dynamic dispatch, перепроектировать контракт на явный вызов метода, case/map dispatch по разрешенному enum или отдельный adapter object.
- Метапрограммирование в app code (`method_missing`, `define_method`, `const_missing`, `class_eval`/`module_eval`/`instance_eval`, dynamic constant/method lookup и похожее) по умолчанию запрещено. Допустимо только в очень обоснованных изолированных случаях: DSL/adapter/registry boundary, где явный код создает реальную неподдерживаемую дубликацию, например dispatch технических индикаторов. При добавлении или изменении такого кода явно фиксировать причину и границы контракта в коде или feature artifact; verification выбирать по обычной Testing Policy и blast radius, без требования покрывать каждый dynamic path отдельно.
- Type conversion/coercion делать явно и узко: numeric через `Float(value, exception: false)`/`Integer(value, exception: false)` без дополнительных `finite?` guards; hash-like external payload через `to_h` только на boundary, где текущий Rails/API flow реально приносит `ActionController::Parameters`/`HashWithIndifferentAccess`. Не добавлять экстремальные проверки на `NaN`/`Infinity`, если конкретный контракт фичи явно этого не требует. Не добавлять blanket `to_s`/`to_h`/`to_f` coercion inside domain code.
- Проверка: `bundle exec steep check`.

## TypeScript

- Stimulus controllers держать тонкими; feature logic выносить в modules/coordinators.
- Shared DOM events именовать через constants, если событие используется между слоями.
- Для async lifecycle использовать `AbortSignal` или явные disconnect guards.
- Внутренний frontend-код должен опираться на TypeScript domain types, а не на defensive runtime shape checks. Не добавлять `typeof`/`Array.isArray`/`in`/optional fallback chains для данных, которые уже типизированы как `DataColumn`, `DataConfig`, `DataTableRow` или другой domain type. Runtime validation допустима на external JSON/API/localStorage/DOM boundary только если контракт прямо допускает несколько форм или отсутствие значения; после normalization код использует один canonical shape и падает/возвращает structured error на malformed data.
- Для server-owned JSON API не строить ручные shape normalizers из `typeof`/`Array.isArray`/deep optional chains. Разрешены protocol-level проверки (`response.ok`, `Content-Type`, abort/offline) и typed decode по контракту; malformed JSON contract должен падать явно, а не маскироваться fallback-значениями.
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
