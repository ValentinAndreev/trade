# Прайминг: Brief

Используй этот prompt как самодостаточный рабочий чеклист для `brief` и `review brief`.
Полный контекст остается в `memory_bank/index.md` и `memory_bank/workflow.md`, но обычный проход должен обходиться без переходов за шаблоном и gate rules.

## Preconditions

- `brief: <идея>` не требует входных artifacts.
- `review brief: <id>` требует `memory_bank/features/<id>_<slug>/brief.md`.

Если вход отсутствует, остановись по fail-fast rule из `memory_bank/workflow.md`.

## Outputs

- `brief: <идея>` creates `memory_bank/features/<id>_<slug>/brief.md`.
- `review brief: <id>` creates or updates `memory_bank/features/<id>_<slug>/reviews/brief.md`.
- Retrospective packages are not converted to `brief.md` for backfill. A крупный future change on shipped behavior starts a new forward `brief.md` that cites the relevant `summary.md` as context.

## Reading Set

1. `memory_bank/prd.md`.
2. `memory_bank/project/overview.md`.
3. `memory_bank/project/glossary.md`.
4. `memory_bank/features/index.md` для проверки дублей.
5. Relevant `memory_bank/features/<id>_<slug>/summary.md`, если идея меняет already shipped behavior.

## Create Brief

- Создавай brief только для forward work. Для уже shipped functionality не создавай retro brief; если это future change, используй existing `summary.md` как входной контекст.
- Сохрани результат в `memory_bank/features/<id>_<slug>/brief.md`.
- Brief отвечает на "зачем и для кого", а не на "как реализовать".
- Разделяй scope и non-scope; hidden implementation details не добавляй, если пользователь просил только problem framing.

## Brief Template

```md
# <Feature Name> — Brief

## Goal

[What outcome is needed and why. Do not prescribe implementation.]

## For Whom

[User role and workflow.]

## Domain Context

[Terms, data and workflow context.]

## Current State

[What already exists and what problem remains.]

## Requirements

- [Concrete requirement.]

## Non-Scope

- [Explicitly excluded behavior.]
```

## Review Brief

- Review stance: unclear stakeholder, vague problem, hidden implementation, missing scope/non-scope, duplicate feature.
- Сохрани note в `memory_bank/features/<id>_<slug>/reviews/brief.md`.
- Note format: `Фича`, `Стадия: brief`, `Статус: advisory | blocking`, `Дата`, then `## Итог`, `## Замечания`, `## Следующий шаг`.

Stage gates live in `memory_bank/workflow.md`; do not duplicate gate text here.
