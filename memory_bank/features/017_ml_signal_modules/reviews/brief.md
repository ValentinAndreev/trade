# Review

Фича: 017_ml_signal_modules
Стадия: brief
Статус: advisory
Дата: 2026-05-02

## Итог

Brief passes the Brief -> Spec gate. Stakeholder, problem, scope and non-scope are clear enough to proceed to spec; the remaining risks are spec-level contract details around data labeling, prediction reuse and runtime constraints.

## Замечания

1. advisory, `memory_bank/features/017_ml_signal_modules/brief.md:29`: Spec should make model metadata, dataset spec, training identity and weight persistence explicit acceptance criteria, including what is stored in AR tables versus file/blob storage.
2. advisory, `memory_bank/features/017_ml_signal_modules/brief.md:31`: Spec should define prediction reuse semantics for `(model, symbol, timeframe, ts)`, including cache invalidation or recomputation when model weights, dataset spec or candle history change.
3. advisory, `memory_bank/features/017_ml_signal_modules/brief.md:34`: Spec should turn the no-lookahead requirement into a testable labeling/window contract, because this is the main correctness risk for research results.

## Проверки

- Read `memory_bank/workflow.md` Brief -> Spec gate.
- Read `memory_bank/features/017_ml_signal_modules/brief.md`.
- Read related summaries for features 005, 009 and 010.

## Следующий шаг

`spec: 017`
