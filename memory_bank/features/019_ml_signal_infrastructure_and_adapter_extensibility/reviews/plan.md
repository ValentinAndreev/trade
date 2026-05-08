# Review

Фича: 019_ml_signal_infrastructure_and_adapter_extensibility
Стадия: plan
Статус: advisory
Дата: 2026-05-09

## Итог

Plan готов к переходу в implementation: шаги стали атомарнее, documentation идет первым, полноценный registry заменен на lightweight catalog, fake-adapter proof обязателен, а future neural work вынесен в отдельный artifact. Blocking замечаний нет.

## Замечания

1. advisory, `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/plan.md`: в step 2 стоит при implementation явно добавить `sig/app/services/ml/adapter_catalog.rbs`, если `Ml::AdapterCatalog` получает public methods. Текущий plan покрывает RBS общим "related RBS files", но конкретный путь лучше не потерять при реализации.
2. advisory, `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/plan.md`: fake adapter proof должен оставаться test-only hook. При implementation не добавлять fake architecture в production supported architectures, API metadata или persisted validation path; лучше оформить test catalog override/helper так, чтобы production catalog оставался только baseline.

## Проверки

- Plan reviewed against `.prompts/plan.md` and `memory_bank/workflow.md` stage gate.
- `bin/memory-bank-check` was run after the revised artifacts and passed before this review note.

## Следующий шаг

`impl: 019`
