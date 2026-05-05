# Developer Workflow

## Назначение

Этот документ описывает рабочий процесс для разработчиков и агентов. Он дополняет `memory_bank/`: `docs/` объясняет продукт и архитектуру, а memory bank хранит process rules, текущий фокус и feature-level contracts.

Основное правило: изменения должны оставлять проект в состоянии, которое можно восстановить по `memory_bank/index.md`, `memory_bank/process/current-focus.md` и relevant feature package.

## Главные файлы

| Файл | Роль |
|---|---|
| `CLAUDE.md` | Минимальный entrypoint для агента |
| `memory_bank/index.md` | Каноническое меню команд, порядок чтения и карта memory-bank документов |
| `memory_bank/workflow.md` | Lifecycle, stage values, gates и fail-fast rules |
| `memory_bank/process/current-focus.md` | Активная задача, started date, stage, review note и следующий command |
| `memory_bank/features/index.md` | Реестр packages, persisted stage и main sources |
| `memory_bank/features/<id>_<slug>/summary.md` | Retrospective contract для shipped feature |
| `memory_bank/features/<id>_<slug>/{brief,spec,plan}.md` | Forward contract для новой или изменяемой feature |
| `memory_bank/ops/development.md` | Local env, DB, credentials and dev commands |
| `memory_bank/ops/ci.md` | CI jobs, local equivalents and test DB details |
| `.prompts/` | Workflow prompts для команд `brief`, `spec`, `plan`, `review`, `fix review` |
| `bin/memory-bank-check` | Offline validator структуры memory bank |

## Stage Model

Forward work для крупных изменений идет по циклу:

```text
Brief -> Spec -> Plan -> Implement -> Review -> Done
```

Канонические значения stage живут только в `memory_bank/workflow.md` -> `Stage Values`.

`Stage` описывает lifecycle package. Тип package выводится из структуры:

- `summary.md` без forward artifacts = shipped feature, описанная ретроспективно.
- `brief.md`, `spec.md` или `plan.md` = forward work; `Stage: done` требует non-blocking `reviews/impl.md`.
- Состояние review — это metadata: активный `Review notes` плюс `Статус: advisory | blocking` внутри note.
- Fix review — command/cursor state, а не lifecycle stage; stage остается на проверяемом artifact до прохождения повторного review.
- Канонический путь команд для крупной forward work: `brief: <идея>` -> `review brief: <id>` -> `spec: <id>` -> `review spec: <id>` -> `plan: <id>` -> `review plan: <id>` -> `impl: <id>` -> `review: <id>`.

## Когда нужен feature package

Малую локальную правку можно сделать без feature package: reproduce/implement/verify.

Feature package нужен, если изменение затрагивает хотя бы одну из зон:

- storage contracts, migrations или persistent state;
- DSL, research systems или YAML validation;
- LLM tools, prompts, agent behavior;
- auth, encryption или пользовательские данные;
- persistent frontend state: `Preset.payload`, localStorage, IndexedDB;
- несколько слоев сразу: backend API, services, frontend, jobs, docs;
- cross-cutting refactor или изменение процесса разработки.

## Package Structure

Retrospective package:

```text
memory_bank/features/<id>_<slug>/
  summary.md
```

Forward package:

```text
memory_bank/features/<id>_<slug>/
  brief.md
  spec.md
  plan.md
  reviews/
    brief.md
    spec.md
    plan.md
    impl.md
```

Ретроспективный package позже может получить `reviews/impl.md`, если явно запрошена смысловая проверка реализации. Создание backfill-сводки не создает эту review note, и она не требуется для ретроспективного `Stage: done`, пока нет forward artifacts.

## Как начинать работу

1. Прочитать `memory_bank/index.md`.
2. Если нужно продолжить прошлую задачу, прочитать `memory_bank/process/current-focus.md`.
3. Если известен touched path, определить связанную feature через `rg` по summaries/tests/code и `memory_bank/features/index.md`.
4. Для retrospective feature прочитать `summary.md`; для future change поверх shipped behavior начать forward `brief.md`, где `summary.md` является входным контекстом. Для active forward work читать artifacts по stage.
5. Прочитать `memory_bank/engineering/conventions.md`, если предстоит код или review.
6. Читать релевантные `docs/*`, код, RBS и тесты после определения feature boundary.

## Forward Artifacts

Brief отвечает на вопрос "зачем это делаем": проблема, пользователь, scope и non-scope.

Spec переводит brief в проверяемый контракт. Acceptance criteria получают stable ids вида `ac-*`.

Plan описывает реализацию через атомарные slices. Каждый slice называет files, behavior, checks и связанные `ac-*`.

Реализация идет по утвержденному plan. Во время реализации обновляются затронутые docs, memory-bank contracts и current focus.

Review только читает artifact/code и пишет note по inline format из `.prompts/review-code.md`. Fix review исправляет только замечания из active note; после fix нужен повторный review той же стадии.

## Backfilled Summary

`summary.md` описывает уже существующую функциональность и не является обещанием будущей работы. Требование считается contract только если подтверждено кодом, тестом или документацией.

Обязательные части:

- `Goal`;
- `Current Contract`;
- `Verified By`;
- `Main Implementation`;
- `Tests`;
- `Invariants Enforced By Code`;
- `Known Gaps / Tech Debt`.

Residual risk and re-review triggers live in `Known Gaps / Tech Debt`; backfill itself does not create snapshot review files.

Retrospective summaries do not use `ac-*`. Future work on top of a retrospective package starts by writing forward `brief.md` with the relevant `summary.md` as context, then `spec.md` creates stable `ac-*` ids derived from the brief and summary contract, and `plan.md` references those ids.

## Validator

`bin/memory-bank-check` - dependency-free Ruby script. Он проверяет:

- enum values для `Stage` и review status;
- required entrypoint, prompt and session-menu files;
- canonical `session-menu` block;
- обязательные files по `Stage` и derived package type;
- blocking review gates for `brief -> spec -> plan -> impl -> done`;
- non-blocking `reviews/impl.md` для forward `Stage: done`;
- структуру `current-focus.md`, including `Review notes` path when present.

Validator не доказывает, что package boundary концептуально верен, и не заменяет code review.
Validator намеренно не проверяет stale code paths в summaries или review notes: переименование файлов не должно ломать CI.

## CI и проверки

Для изменений в memory bank или процессе минимально запускать:

```bash
bin/memory-bank-check
bundle exec rspec spec/bin/memory_bank_check_spec.rb
ruby -c bin/memory-bank-check
git diff --check
```

Для runtime-изменений проверки выбираются по blast radius из `memory_bank/engineering/conventions.md`.

## ML Signal Modules

Фича 017 добавляет ML-слой без внешнего Python/Torch сервиса. Обучение и inference выполняются in-process Ruby baseline adapter-ом, поэтому разработка и CI не требуют отдельного model-serving процесса.

Очередь обучения изолирована в `config/queue.yml`: очередь `ml` настроена с `threads: 1` и `processes: 1`. Это часть контракта MVP: для одной модели допускается только один активный запуск в состоянии `queued` или `running`, а stale `running`-запуск с устаревшим `heartbeat_at` перед replacement-запуском переводится в `failed` с метаданными `stale_worker`.

`ml_predictions` — Timescale hypertable по `ts` без отдельного `id`. Уникальность задается через `(ml_model_id, exchange, symbol, timeframe, ts)`. Prediction rows являются пересчитываемым кэшем: повторное использование разрешено только при совпадении serving `weight_checksum` и `source_window_checksum`; upsert с защитой не дает старому training snapshot перезаписать rows от более нового успешного обучения.

Практические проверки для ML-срезов:

```bash
bundle exec rspec spec/services/ml spec/models/ml_model_spec.rb spec/models/ml_training_run_spec.rb spec/jobs/ml_training_job_spec.rb
bundle exec rspec spec/services/research/systems/validation/checks/ml_models_spec.rb spec/services/research/modules/ml_signal_spec.rb spec/services/research/backtest_ml_signal_spec.rb
bundle exec steep check
bin/memory-bank-check
git diff --check
```

Для документационных изменений достаточно `bin/memory-bank-check` и `git diff --check`, если runtime-контракты не менялись.
