# Review

Фича: 017_ml_signal_modules
Стадия: spec
Статус: advisory
Дата: 2026-05-04

## Итог

Spec проходит gate `Spec -> Plan` после повторной проверки: предыдущие advisory по first-registration flow, metadata-complete ML feature specs, soft performance target vs hard rejection and unified prediction-cell cap закрыты в тексте spec. Scope остается отделен от 018, acceptance criteria имеют stable `ac-*` ids, storage/reuse/no-lookahead/cancellation/API boundaries описаны проверяемо. Блокеров нет; ниже остается один advisory, который можно закрыть в plan-review или в раннем dataset-builder slice без остановки перехода.

## Замечания

1. advisory, `memory_bank/features/017_ml_signal_modules/spec.md:47`: Label rule defines `return(t, horizon)` but does not pin the exact price basis/formula, for example close-to-close simple return over `horizon` candles. The no-lookahead AC is still testable, but implementation specs should make this explicit so adapter/dataset tests do not infer different label semantics.

## Проверки

- Read `memory_bank/workflow.md` Spec -> Plan gate.
- Read `memory_bank/features/017_ml_signal_modules/brief.md`.
- Read `memory_bank/features/017_ml_signal_modules/spec.md`.
- Read `memory_bank/features/017_ml_signal_modules/plan.md`.
- Checked existing `Research::Modules`, `Research::Modules::Base`, `Research::Modules::ExternalSeries`, `Research::Systems::Schema`, `IndicatorsConfig`, `Research::Backtest` and `Research::Runs::Execute` for compatibility with the spec surface.
- `ruby -e ...` AC shape check: 24 AC, no duplicates, no malformed ids.
- `ruby -e ...` AC coverage check: 24 AC, no missing references in plan.
- `bin/memory-bank-check` passed.

## Следующий шаг

`review plan: 017`
