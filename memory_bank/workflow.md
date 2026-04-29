# Workflow — как работаем

Memory bank задает process/contract layer. `docs/` остаются подробной продуктовой и технической документацией.

Подробное developer-facing описание процесса: [../docs/11-developer-workflow.md](../docs/11-developer-workflow.md). При изменении workflow обновлять этот документ вместе с `memory_bank/workflow.md`, prompts и validator rules.

## Базовый цикл

Forward work для крупных изменений идет по циклу:

```text
Brief -> Spec -> Plan -> Implement -> Review -> Done
```

Retrospective package описывает уже shipped функциональность одним `summary.md`; он не проходит искусственный forward-цикл задним числом. Retrospective state выводится из структуры: package с `summary.md` и без forward artifacts считается retrospective.

```text
features/<id>_<slug>/
  summary.md                 # только для retrospective shipped state
  brief.md                   # только для forward work
  spec.md                    # только для forward work
  plan.md                    # только для forward work
  reviews/
    brief.md
    spec.md
    plan.md
    impl.md
```

## Stage Values

`features/index.md` and active `process/current-focus.md` use one lifecycle enum:

<!-- stage-values -->
```text
brief | spec | plan | impl | done
```

`bin/memory-bank-check` reads the fenced block above; do not duplicate these enum values in validator, glossary or index docs. If `process/current-focus.md` has no active feature, its stage is `—`.

Правила:
- `features/index.md` хранит persisted stage package.
- `current-focus.md` хранит session cursor; `—` означает, что active feature не выбрана.
- `Stage: done` для retrospective package означает shipped feature with `summary.md`.
- `Stage: done` для forward package требует non-blocking `reviews/impl.md`.
- Review не является stage; review state фиксируется через `Review notes` и статус note.
- `fix review` не является stage: stage остается на проверяемой стадии, а cursor задается через `Review notes` и `Следующий шаг`.

Переходы:
- `brief -> spec -> plan -> impl -> done` для forward cycle.
- Shipped retrospective packages остаются `done`; первый крупный future change начинается с forward `brief.md`, где relevant `summary.md` является входным контекстом. Work идет в том же package или в новом package, если scope независимый.
- Blocking review оставляет stage на проверяемой стадии и указывает active `Review notes`.

## Fail Fast

- `spec: <id>` требует `brief.md`.
- `plan: <id>` требует `spec.md`.
- `impl: <id>` требует `plan.md`.
- `review: <id>` требует `spec.md` и `plan.md` для forward package; для retrospective package semantic review может читать `summary.md` и текущий diff/code.
- `fix review: <id> <stage>` требует `reviews/<stage>.md`.

Если вход отсутствует:

```text
BLOCKER: missing <artifact>. Cannot run <command>. Next step: <what to create first>.
```

Нельзя восстанавливать downstream artifact по коду, плану или `current-focus`, если обязательный upstream-файл отсутствует.

## Retrospective Packages

Retrospective `summary.md` фиксирует текущий контракт уже реализованной функциональности. Он должен быть grounded: требования считаются контрактом только если подтверждены кодом, тестом или документацией.

Обязательные секции:
- `Goal`;
- `Current Contract`;
- `Verified By`;
- `Main Implementation`;
- `Tests`;
- `Invariants Enforced By Code`;
- `Known Gaps / Tech Debt`.

Retrospective summary template:

````md
# <Feature Name> — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `<doc-or-code-path>`, `<test-path>`.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

[What shipped capability this feature provides.]

## Current Contract

- [Behavior guaranteed by current code, docs or tests.]

## Non-Scope

- [Related behavior this feature does not currently provide.]

## Verified By

- [Existing behavior and the code/test/doc source that verifies or constrains it.]

## Main Implementation

- `<path/to/runtime_file>`

## Tests

- `<path/to/spec_or_test>`

## Invariants Enforced By Code

- [Validation, DB constraint, test, RBS contract or service behavior that must stay true.]

## Known Gaps / Tech Debt

- [Real gap, residual risk or re-review trigger.]

## Verification On Change

```bash
<focused verification command>
```
````

Residual risk и re-review triggers фиксируются в `Known Gaps / Tech Debt`; backfill сам по себе не создает `reviews/impl.md`.

Retrospective summaries do not use `ac-*` ids. If future work changes retrospective contract, first create forward `brief.md` with the relevant `summary.md` as context, then create `spec.md` with stable `ac-*` ids derived from the brief and summary contract. Only then create `plan.md`, which references those `ac-*`.

Acceptance criteria ids are forward-spec only and use descriptive kebab-case, not ordinal numbers. Prefer `ac-restore-saved-tabs` or `ac-reject-invalid-yaml`; avoid `ac-1`, because ids must survive reordering.

## Fix After Review

Review и fix разделены намеренно.

- `review <stage>` только читает artifact/code и пишет `reviews/<stage>.md`.
- Explicit `review: <id>` always writes or updates `reviews/impl.md`; retrospective backfill does not create this note automatically.
- `fix review <stage>` исправляет замечания из `## Замечания`.
- После fix нужен повторный review той же стадии.
- Если замечание не подтверждается кодом, fix явно пишет это в ответе.

Review note имеет статус:
- `advisory` - можно двигаться дальше, риск зафиксирован;
- `blocking` - переход запрещен до fix и повторного review.

Canonical review note format:

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

## Stage Gates

### Brief -> Spec

- Stakeholder и сценарий названы.
- Проблема конкретна и проверяема.
- Scope и non-scope разделены.
- Нет hidden implementation, если пользователь просил только проблему.
- Если `reviews/brief.md` blocking, сначала `fix review: <id> brief`.

### Spec -> Plan

- Acceptance criteria проверяемы и имеют stable `ac-*` ids.
- Success, empty, loading и error states описаны там, где это важно.
- Инварианты и ограничения реализации указаны.
- Если `reviews/spec.md` blocking, сначала `fix review: <id> spec`.

### Plan -> Impl

- Каждый шаг атомарен и проверяем.
- Шаги называют конкретные файлы и relevant checks.
- Для нового Ruby public class/method есть RBS step.
- Каждый `ac-*` из spec упомянут в plan.
- Если `reviews/plan.md` blocking, сначала `fix review: <id> plan`.

### Impl -> Done

- Forward package имеет `spec.md` и `plan.md`.
- `reviews/impl.md` существует и не `blocking`.
- Acceptance criteria закрыты кодом/тестами или явно перенесены в Known Gaps.
- Релевантные проверки пройдены.

## Малые задачи

Малое локальное изменение может идти без feature package: reproduce/implement/verify. Feature package нужен, если изменение затрагивает storage contracts, migrations, DSL/research systems, LLM tools, auth/encryption/user data, persistent frontend state, несколько слоев сразу или сам workflow/process.
