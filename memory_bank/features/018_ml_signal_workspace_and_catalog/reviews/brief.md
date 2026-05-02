# Review

Фича: 018_ml_signal_workspace_and_catalog
Стадия: brief
Статус: advisory
Дата: 2026-05-03

## Итог

Brief проходит gate `Brief -> Spec`: stakeholder и сценарий названы, scope вынесен поверх 017 без изменения backend storage/training contracts, non-scope отделяет LNN/torch, ACL, retention и broad precompute. Блокеров нет.

## Замечания

1. advisory, `memory_bank/features/018_ml_signal_workspace_and_catalog/brief.md`: Pair/proxy modules need an explicit same-series vs cross-symbol contract before implementation. Current spec/plan now reject cross-symbol/cross-timeframe refs in 018.
2. advisory, `memory_bank/features/018_ml_signal_workspace_and_catalog/brief.md`: The 018 catalogue is large for one package. Current plan keeps one package because UI, grid and catalogue share the 017 integration surface, but splits implementation/review checks and specs between transforms and pair/proxy modules.

## Проверки

- Read `memory_bank/workflow.md` Brief -> Spec gate.
- Read `memory_bank/features/018_ml_signal_workspace_and_catalog/brief.md`.
- Read `memory_bank/features/018_ml_signal_workspace_and_catalog/spec.md`.
- Read `memory_bank/features/018_ml_signal_workspace_and_catalog/plan.md`.
- Checked dependency boundary against `memory_bank/features/017_ml_signal_modules/spec.md`.

## Следующий шаг

`review spec: 018`
