# Review

Фича: 019_ml_signal_infrastructure_and_adapter_extensibility
Стадия: brief
Статус: advisory
Дата: 2026-05-08

## Итог

Brief готов к переходу в spec: stakeholder, текущая проблема, shipped ML контекст, scope и non-scope сформулированы достаточно явно. Основной риск не блокирует переход: в spec нужно аккуратно развести документационно-архитектурное прояснение, небольшой refactor adapter boundary и optional second reference adapter, чтобы 019 не разрослась в новую ML/modeling ветку.

## Замечания

1. advisory, `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/brief.md`: требование "If this task introduces a second adapter..." оставляет открытым, входит ли второй adapter в scope. В spec нужно выбрать один вариант: либо 019 ограничивается documentation/refactor boundary, либо включает маленький reference adapter с отдельными acceptance criteria и focused verification.
2. advisory, `memory_bank/features/019_ml_signal_infrastructure_and_adapter_extensibility/brief.md`: фраза про LLM harness/process как primary product track верно задает приоритет, но не должна стать неявным runtime requirement. В spec стоит превратить это в explicit non-scope/positioning requirement: ML остается signal infrastructure, а LLM harness work будет отдельным package.

## Проверки

- Brief reviewed against `.prompts/brief.md` and `memory_bank/workflow.md` stage gate.

## Следующий шаг

`spec: 019`
