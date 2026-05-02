# Review

Фича: 017_ml_signal_modules
Стадия: plan
Статус: advisory
Дата: 2026-05-04

## Итог

Plan проходит gate `Plan -> Impl` после повторной проверки: storage-first порядок сохранен, шаги называют runtime/test/docs поверхности, все implementation sections имеют `Files/Change/Check/AC`, RBS добавляются alongside public Ruby constants, и все 24 `ac-*` из обновленного spec покрыты. Предыдущие advisory по first-registration, missing metadata rejection, performance target и prediction-cell formula закрыты. Блокеров нет; один оставшийся advisory связан с точной label-return formula.

## Замечания

1. advisory, `memory_bank/features/017_ml_signal_modules/plan.md:79`: DatasetBuilder step describes deadband handling but still leaves the exact `return(t, horizon)` price basis/formula implicit. Before or during Step 2b implementation, pin this as a close-to-close simple return over `horizon` candles or another explicit formula, then cover it in dataset-builder fixtures.

## Проверки

- Read `memory_bank/workflow.md` Plan -> Impl gate.
- Read `memory_bank/features/017_ml_signal_modules/spec.md`.
- Read `memory_bank/features/017_ml_signal_modules/plan.md`.
- Read `memory_bank/features/017_ml_signal_modules/reviews/spec.md`.
- Checked that every `ac-*` from the updated spec is referenced by the updated plan.
- `ruby -e ...` plan structure check: 13 sections, no missing `Files/Change/Check/AC` blocks.
- `ruby -e ...` AC coverage check: 24 AC, no missing references in plan.
- `bin/memory-bank-check` passed.

## Следующий шаг

`review spec: 018`
