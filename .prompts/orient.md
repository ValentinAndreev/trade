# Прайминг: Orient / Resume

Canonical command menu lives in `memory_bank/index.md`; lifecycle rules live in `memory_bank/workflow.md`.

## Routing

- `resume` / "продолжай": read `memory_bank/process/current-focus.md`, then the active package if one is set.
- `orient`: read `memory_bank/index.md`, then project overview/glossary/features index.

## Preconditions

- Если `Review notes` указан, файл должен существовать.
- Если активная задача указана, feature directory должен существовать.

Если контекст отсутствует или противоречив, остановись по fail-fast rule из `memory_bank/workflow.md`.

## Outputs

- `resume` and `orient` do not create or modify files.
- Response names active feature, stage, review note, next command and documents read.

## Reading Set

- `memory_bank/process/current-focus.md` for `resume`.
- `memory_bank/index.md`.
- `memory_bank/project/overview.md`.
- `memory_bank/project/glossary.md`.
- `memory_bank/features/index.md`.
- Active feature package, if `current-focus.md` names one.

## Result

Назови активную задачу, текущий этап, следующий конкретный шаг и прочитанные документы. Не меняй файлы во время orient/resume без отдельного запроса.
