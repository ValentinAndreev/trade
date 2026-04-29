# Прайминг: Plan / Implement

Используй этот prompt как самодостаточный рабочий чеклист для `plan`, `review plan` и `impl`.
Полный контекст остается в `memory_bank/index.md` и `memory_bank/workflow.md`, но обычный проход должен обходиться без переходов за шаблоном и gate rules.

## Preconditions

- `plan: <id>` требует `memory_bank/features/<id>_<slug>/spec.md`.
- `review plan: <id>` требует `memory_bank/features/<id>_<slug>/plan.md`.
- `impl: <id>` требует `memory_bank/features/<id>_<slug>/plan.md`.
- Если `reviews/spec.md` или `reviews/plan.md` имеет `blocking`, сначала нужен соответствующий `fix review`.

Если вход отсутствует, остановись по fail-fast rule из `memory_bank/workflow.md`.

## Outputs

- `plan: <id>` creates `memory_bank/features/<id>_<slug>/plan.md`.
- `review plan: <id>` creates or updates `memory_bank/features/<id>_<slug>/reviews/plan.md`.
- `impl: <id>` modifies only files named or implied by the approved plan, plus relevant docs/contracts/current focus.

## Reading Set

1. Feature `spec.md` для `plan`; feature `plan.md` для `impl`.
2. `memory_bank/engineering/conventions.md`.
3. Relevant код, RBS и тесты.

## Create Plan

- Создавай plan только для forward work. Для уже shipped functionality не создавай retro plan; обновляй `summary.md`.
- Сохрани результат в `memory_bank/features/<id>_<slug>/plan.md`.
- Каждый шаг должен быть атомарным, называть files, behavior, checks и связанные `ac-*`.
- Для нового Ruby public class/method добавь RBS step.

## Plan Template

````md
# <Feature Name> — Plan

**Spec:** `memory_bank/features/<id>_<slug>/spec.md`

## Approach

[Which layers are touched and why this order is safe.]

## Implementation Steps

### 1. <Step Name>

**Files:** `<path>` (new | modify)

**Change:** [Atomic implementation change.]

**Check:** `<command>` or `<test path>`

**AC:** `ac-<slug>` from `spec.md`

## Verification

```bash
<relevant command>
```
````

## Review Plan

- Review stance: non-atomic steps, missing files, missing checks, unmentioned `ac-*`, missing RBS/test/doc steps.
- Сохрани note в `memory_bank/features/<id>_<slug>/reviews/plan.md`.
- Note format: `Фича`, `Стадия: plan`, `Статус: advisory | blocking`, `Дата`, then `## Итог`, `## Замечания`, `## Следующий шаг`.

## Implement

- Выполняй approved plan в порядке, который минимизирует риск.
- Обновляй затронутые contracts/docs/current focus.
- Не расширяй scope за пределы spec/plan без явного запроса.
- После implementation запускай verification из plan или более узкий defensible subset, если полный набор не нужен.

Stage gates live in `memory_bank/workflow.md`; do not duplicate gate text here.
