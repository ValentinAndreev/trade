# Прайминг: Fix Review Notes

Используй этот prompt как самодостаточный рабочий чеклист для `fix review: <id> <stage>`.
Полный контекст остается в `memory_bank/index.md` и `memory_bank/workflow.md`, но обычный fix не должен требовать перехода за routing rules.

## Preconditions

- `fix review: <id> <stage>` требует `memory_bank/features/<id>_<slug>/reviews/<stage>.md`.
- Review note должен содержать `## Замечания`.
- `<stage>` должен быть одной из проверяемых стадий: `brief`, `spec`, `plan`, `impl`.

Если вход отсутствует, остановись по fail-fast rule из `memory_bank/workflow.md`.

## Outputs

- `fix review: <id> <stage>` modifies only files needed to address `memory_bank/features/<id>_<slug>/reviews/<stage>.md`.
- It updates `memory_bank/process/current-focus.md` so the next step is repeat review for the same stage.
- It does not delete or rewrite the active review note.

## Reading Set

1. Active review note `memory_bank/features/<id>_<slug>/reviews/<stage>.md`.
2. Исправляемый artifact или implementation diff для этой стадии.
3. `memory_bank/engineering/conventions.md`, если fix затрагивает код, тесты, RBS или docs.
4. `memory_bank/ops/development.md` или `memory_bank/ops/ci.md`, если fix касается env, DB, credentials или CI.

## Fix Rules

- Исправляй только замечания из active review note, если пользователь явно не расширил scope.
- Не удаляй review note; после fix нужен повторный review той же стадии.
- Обнови `memory_bank/process/current-focus.md`: stage остается проверяемой стадией, `Review notes` указывает active note, `Следующий шаг` указывает повторный review.
- Если замечание не подтверждается кодом, не делай фиктивную правку; явно напиши это в ответе и оставь повторный review как следующий шаг.
- Для `impl` fixes запускай relevant checks по blast radius; для artifact fixes запускай validator/format checks where relevant.

## Completion Contract

- Все blocking remarks from active note либо исправлены, либо явно отклонены с доказательством.
- Scope не расширен за пределы review note.
- Current focus points back to `review <stage>` for the same feature.
- Final response lists changed files and verification run.
