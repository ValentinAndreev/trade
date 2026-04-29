# Прайминг: Review / Verify

Используй этот prompt как самодостаточный рабочий чеклист для `review: <id>`.
Полный контекст остается в `memory_bank/index.md` и `memory_bank/workflow.md`, но обычный review не должен требовать перехода за template или gate rules.

## Preconditions

- `review: <id>` требует feature package из `memory_bank/features/<id>_<slug>/`.
- Forward package требует `spec.md` и `plan.md`.
- Retrospective package требует `summary.md`; backfill сам не создает review note, but explicit `review: <id>` creates or updates `reviews/impl.md`.
- Повторный review после fix читает active `reviews/impl.md`, если он указан в `memory_bank/process/current-focus.md`.

Если вход отсутствует, остановись по fail-fast rule из `memory_bank/workflow.md`.

## Outputs

- `review: <id>` creates or updates `memory_bank/features/<id>_<slug>/reviews/impl.md`.
- Review does not modify implementation files.
- If review is blocking, `memory_bank/process/current-focus.md` should point to `fix review: <id> impl`.

## Reading Set

1. Forward: feature `spec.md` and `plan.md`; retrospective: feature `summary.md`.
2. Active `reviews/impl.md`, если это повторный review.
3. `memory_bank/engineering/conventions.md`.
4. Relevant diff, runtime code, RBS, tests and docs по touched scope.
5. `memory_bank/ops/development.md` или `memory_bank/ops/ci.md`, если замечания касаются env, DB, credentials или CI.

## Review Stance

- Ищи bugs, behavioral regressions, missing tests, broken invariants, stale docs/contracts and unsafe compatibility changes.
- Для forward work сверяй реализацию с `spec.md` acceptance criteria and `plan.md` checks.
- Для retrospective package сверяй изменение с `summary.md`; если нужна новая работа поверх shipped contract, требуй forward `brief.md` with the relevant summary as context, then `spec.md` со stable `ac-*` ids before `plan`.
- Не исправляй код в этом проходе; review только читает и пишет note.
- Если проверка не была запущена, явно укажи почему.

## Review Note Template

Сохрани note в `memory_bank/features/<id>_<slug>/reviews/impl.md`.

```md
# Review

Фича: <id_slug>
Стадия: impl
Статус: advisory | blocking
Дата: YYYY-MM-DD

## Итог

[One-paragraph outcome: pass, advisory risk, or blocker.]

## Замечания

1. blocking, `<path>:<line>`: [bug/risk and required fix.]
2. advisory, `<path>:<line>`: [risk or follow-up.]

## Проверки

- [command run, result, or why not run]

## Следующий шаг

[For blocking: `fix review: <id> impl`. For advisory/pass: next lifecycle command.]
```

Stage gates live in `memory_bank/workflow.md`; do not duplicate gate text here.
