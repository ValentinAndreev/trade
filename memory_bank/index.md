# Memory Bank — индекс проекта

Этот каталог нужен для разработки и review. Он не заменяет `docs/`: long-form документация остается там, а memory bank хранит process, текущий фокус и feature-level contracts.

## Граница `docs/` и `memory_bank/`

- `docs/` — подробная product/technical документация.
- `memory_bank/` — process layer и feature contracts.
- [../docs/11-developer-workflow.md](../docs/11-developer-workflow.md) — подробное developer-facing описание процесса.
- Feature boundary определяется через `memory_bank/features/index.md`, relevant summaries and `rg`; архитектура живет в `docs/02-architecture.md`.

## Карта документов

| Документ | Что содержит | Читать при |
|---|---|---|
| [process/current-focus.md](process/current-focus.md) | Активная задача, started date, стадия, review note, следующий шаг | `resume` |
| [workflow.md](workflow.md) | Цикл Brief -> Spec -> Plan -> Impl -> Review -> Done | любой workflow |
| [prd.md](prd.md) | Продуктовые области, пользователи, non-scope | `orient`, `brief` |
| [project/overview.md](project/overview.md) | Краткая карта продукта, stack, решения | `orient`, `spec` |
| [project/glossary.md](project/glossary.md) | Доменные термины и process terms | `orient`, `review` |
| [engineering/conventions.md](engineering/conventions.md) | Coding style, testing policy, проверки, autonomy boundaries | `plan`, `impl`, `review` |
| [ops/development.md](ops/development.md) | Local env, DB, credentials and dev commands | local setup, env/debug |
| [ops/ci.md](ops/ci.md) | CI jobs, required checks and local equivalents | CI/debug/release prep |
| [features/index.md](features/index.md) | Реестр feature packages | `orient`, `resume` |
| [features/coverage.md](features/coverage.md) | PRD area -> package -> owning paths matrix | path triage, summary audit |

## Команды и промпты

<!-- session-menu -->
```text
resume                         Восстанавливает работу по current-focus.md
orient                         Читает карту проекта без полного обхода репозитория
brief: <идея>                  Создает forward feature brief
review brief: <id>             Проверяет brief и пишет reviews/brief.md
spec: <id>                     Создает spec из approved brief
review spec: <id>              Проверяет spec и пишет reviews/spec.md
plan: <id>                     Создает plan из spec
review plan: <id>              Проверяет plan и пишет reviews/plan.md
impl: <id>                     Реализует approved plan
review: <id>                   Делает code review реализации
fix review: <id> <stage>       Исправляет замечания review note
```

Artifact formats live inline where they are used: forward templates in `.prompts/brief.md`, `.prompts/spec.md`, `.prompts/plan.md`; review/fix note formats in `.prompts/review-code.md`, `.prompts/fix-review.md`; retrospective summary format and lifecycle gates live in `workflow.md`.
