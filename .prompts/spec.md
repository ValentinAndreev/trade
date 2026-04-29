# Прайминг: Spec

Используй этот prompt как самодостаточный рабочий чеклист для `spec` и `review spec`.
Полный контекст остается в `memory_bank/index.md` и `memory_bank/workflow.md`, но для обычного прохода не нужно прыгать по ним за шаблоном и gate rules.

## Preconditions

- `spec: <id>` требует `memory_bank/features/<id>_<slug>/brief.md`.
- `review spec: <id>` требует `memory_bank/features/<id>_<slug>/spec.md`.
- Если `reviews/brief.md` имеет `blocking`, сначала нужен `fix review: <id> brief`.

Если вход отсутствует, остановись по fail-fast rule из `memory_bank/workflow.md`.

## Outputs

- `spec: <id>` creates `memory_bank/features/<id>_<slug>/spec.md`.
- `review spec: <id>` creates or updates `memory_bank/features/<id>_<slug>/reviews/spec.md`.
- Retrospective packages are not converted to `spec.md` during backfill and do not use `ac-*`; future work first creates forward `brief.md`, then derives stable `ac-*` ids in `spec.md`.

## Reading Set

1. Feature `brief.md`.
2. `memory_bank/project/glossary.md`.
3. `memory_bank/engineering/conventions.md`.
4. Relevant retrospective `summary.md`, если brief changes shipped behavior.
5. Relevant `docs/*`, код, RBS и тесты по scope brief.

## Create Spec

- Создавай spec только для forward work. Для уже shipped functionality не создавай retro spec; обновляй `summary.md`.
- Сохрани результат в `memory_bank/features/<id>_<slug>/spec.md`.
- Acceptance criteria должны быть проверяемыми и иметь stable forward-only `ac-*` ids.
- Описывай success, empty, loading и error states там, где они влияют на контракт.
- Укажи implementation constraints: storage/API/RBS/backward compatibility/security, если relevant.
- Не добавляй implementation plan; это делает `plan: <id>`.

## Spec Template

```md
# <Feature Name> — Spec

**Brief:** `memory_bank/features/<id>_<slug>/brief.md`

## Goal

[One sentence.]

## Scope

In:
- [Included behavior.]

Out:
- [Excluded behavior.]

## Requirements

1. [Testable requirement.]

## Invariants

- [Contract that must remain true.]

## Acceptance Criteria

- [ ] **ac-<slug>:** [Expected behavior and verification source.]
- [ ] **ac-restore-saved-tabs:** Workspace restores existing saved tabs from `Preset.payload` without dropping unknown compatible fields.
- [ ] **ac-reject-invalid-yaml:** Research API rejects invalid YAML before execution and returns validation errors.

## Implementation Constraints

- [Storage/API/RBS/backward-compatibility/security constraint.]
```

## Review Spec

- Review stance: bugs, ambiguity, unverifiable requirements, missing states, missing constraints.
- Сохрани note в `memory_bank/features/<id>_<slug>/reviews/spec.md`.
- Note format: `Фича`, `Стадия: spec`, `Статус: advisory | blocking`, `Дата`, then `## Итог`, `## Замечания`, `## Следующий шаг`.

Stage gates live in `memory_bank/workflow.md`; do not duplicate gate text here.
