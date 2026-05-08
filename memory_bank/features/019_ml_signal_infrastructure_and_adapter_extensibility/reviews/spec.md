# Review

Фича: 019_ml_signal_infrastructure_and_adapter_extensibility
Стадия: spec
Статус: advisory
Дата: 2026-05-08

## Итог

Spec готов к переходу в plan: scope намеренно ограничен adapter-boundary/documentation work, второй runtime adapter и `torch-rb` исключены, acceptance criteria проверяемы и связаны с текущими ML contracts. Blocking замечаний нет.

## Замечания

1. advisory, `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/spec.md`: `ac-position-baseline-as-reference-adapter` говорит про "code-facing names/comments". В plan нужно трактовать это осторожно: не переименовывать публичный architecture string, persisted values или class/module names без отдельного compatibility plan; достаточно docs, registry metadata, comments where useful and tests that preserve current public identifiers.
2. advisory, `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/spec.md`: `ac-structure-adapter-errors` covers unsupported weight format/output/architecture. В plan нужно явно назвать focused specs для каждого failure path, иначе structured-error requirement легко останется частично документированным.

## Проверки

- Spec reviewed against `.prompts/spec.md` and `memory_bank/workflow.md` stage gate.

## Следующий шаг

`plan: 019`
