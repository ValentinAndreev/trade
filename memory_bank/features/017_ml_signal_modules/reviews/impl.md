# Review

Фича: 017_ml_signal_modules
Стадия: impl
Статус: advisory
Дата: 2026-05-06

## Итог

Повторный review после `fix review: 017 impl` пройден без blocking замечаний. Найденный ранее `0m` timeframe crash закрыт: `TimeframeParser` отклоняет non-positive amounts, `Ml::InferenceService` возвращает structured `:invalid_timeframe`, regression spec добавлен. Документационная команда в `docs/11-developer-workflow.md` теперь ссылается на существующие spec files. Предыдущие review blockers по stale feature checksum, `label_horizon`, research cancellation, structured inference errors и duplicate deterministic weight checksums остаются закрытыми.

## Замечания

—

## Проверки

- `bundle exec rspec spec/services/ml/inference_service_spec.rb spec/services/candle/find_query_spec.rb` — 23 examples, 0 failures.
- `bundle exec rspec spec/models/ml_model_spec.rb spec/models/ml_model_weight_blob_spec.rb spec/models/ml_training_run_spec.rb spec/models/ml_prediction_spec.rb spec/services/ml spec/services/research/modules/ml_signal_spec.rb spec/services/research/systems/schema_spec.rb spec/services/research/systems/validation/validator_spec.rb spec/services/research/backtest_spec.rb spec/services/research/runs/execute_spec.rb spec/services/research/optimizer_spec.rb spec/jobs/ml_training_job_spec.rb spec/channels/ml_training_progress_channel_spec.rb spec/requests/api/ml_models_spec.rb spec/requests/api/ml_training_runs_spec.rb` — 174 examples, 0 failures.
- `bundle exec steep check` — no type errors.
- `bin/memory-bank-check` — passed.
- `git diff --check` — passed.
- `bin/rails runner "r = Ml::InferenceService.new(model_key: 'missing', symbol: 'BTCUSD', timeframe: '0m', start_time: Time.utc(2026,1,1), end_time: Time.utc(2026,1,1,0,1)).call; raise r.error.inspect unless r.error&.code == :invalid_timeframe; puts [r.status, r.error.code].inspect"` — `[:failed, :invalid_timeframe]`.
- `bundle exec rspec` — 551 examples, 0 failures.
- `CI=1 bin/brakeman --no-pager` — 0 security warnings, 1 ignored warning.
- `bin/bundler-audit` — no vulnerabilities found.
- `npm test` — 37 files, 484 tests, 0 failures.
- `npm run typecheck` — passed.
- `npm audit --audit-level=high` — initially found high advisories in `vite`/`picomatch`; after `npm audit fix`, passed with 0 vulnerabilities.

## Deferred Checks

—

## Следующий шаг

Mark `done: 017`, then start `impl: 018`.
