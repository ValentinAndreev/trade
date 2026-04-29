# Core Market Data Foundation — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/01-product-overview.md`, `docs/02-architecture.md`, `docs/03-domain-model.md`, `docs/05-api.md`.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Provide a reliable server-side foundation for market candles, symbols, exchanges and range queries used by dashboard, charts, data grids and research.

## Current Contract

1. Candle identity must be deterministic by exchange, symbol, timeframe and timestamp.
2. Backfill must be idempotent and safe to rerun.
3. Range APIs must return ordered time-series data with complete OHLCV fields.
4. Aggregated timeframes must preserve timestamp alignment expected by chart and grid consumers.
5. External-source failures must not corrupt existing stored candles.
6. Data consumers must not depend on frontend cache as source of truth.

## Non-Scope

- Broker execution.
- Full multi-exchange normalization beyond implemented sources.
- Client-side replacement for the server data store.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Re-running a backfill does not duplicate candles.
- Candle API consumers can request a symbol/timeframe/range and receive ordered data.
- Missing upstream data is represented as an error or empty result, not fabricated candles.
- Tests cover persistence, API and service-level edge cases for changed behavior.

## Main Implementation

- Models: `app/models/candle.rb`.
- Services: `app/services/candle/find_query.rb`, `app/services/candle/indicator_calculator.rb`, `app/services/candle/ticker_query.rb`, `app/services/candle/syncer.rb`, `app/services/candle/sync/backfill.rb`, `app/services/candle/sync/recent.rb`, `app/services/candle/sync/importer.rb`, `app/services/candle/sync/history_source.rb`, `app/services/candle/sync/paginator.rb`.
- Jobs: `app/jobs/candle_backfill_job.rb`, `app/jobs/candle_sync_job.rb`, `app/jobs/candle_sync_symbol_job.rb`.
- Controllers/Channels: `app/controllers/api/candles_controller.rb`, `app/controllers/api/tickers_controller.rb`, `app/controllers/api/indicators_controller.rb`, `app/channels/candles_channel.rb`.
- Config/RBS: `config/configs/bitfinex_config.rb`, `config/initializers/candle_sync.rb`, `sig/app/models/candle.rbs`, `sig/app/services/candle/find_query.rbs`, `sig/app/services/candle/syncer.rbs`.

## Tests

- `spec/models/candle_spec.rb`
- `spec/requests/api/candles_spec.rb`
- `spec/requests/api/tickers_spec.rb`
- `spec/requests/api/indicators_spec.rb`
- `spec/jobs/candle_backfill_job_spec.rb`
- `spec/jobs/candle_sync_job_spec.rb`
- `spec/jobs/candle_sync_symbol_job_spec.rb`
- `spec/services/candle/find_query_spec.rb`
- `spec/services/candle/indicator_calculator_spec.rb`
- `spec/services/candle/ticker_query_spec.rb`
- `spec/services/candle/syncer_spec.rb`
- `spec/services/candle/sync/importer_spec.rb`
- `spec/services/candle/sync/backfill_spec.rb`
- `spec/services/candle/sync/recent_spec.rb`
- `spec/services/utils/bitfinex_client_spec.rb`

## Invariants Enforced By Code

- `app/models/candle.rb` requires `ts`, `symbol`, `exchange`, `timeframe`, `open`, `high`, `low`, `close`, `volume`.
- `db/schema.rb` keeps `candles` without id and enforces `null: false` for OHLCV and identity fields.
- `db/schema.rb` has unique index `index_candles_on_symbol_exchange_ts`.
- `Candle.import` uses `unique_by: INDEX_FIELDS`; `spec/models/candle_spec.rb` checks duplicate imports are skipped.
- `Candle.ordered` sorts by `ts ASC`; `spec/models/candle_spec.rb` covers ordering.

## Known Gaps / Tech Debt

- Unique index does not include `timeframe`, while the model validation treats `timeframe` as required. Changing this requires migration/spec review.
- Live provider behavior is covered through service boundaries and stubs; external Bitfinex availability is not verified by tests.
- Sync/backfill jobs and channel consumers share candle ordering/idempotency assumptions; re-review them together when touching candle identity fields.

## Verification On Change

```bash
bundle exec rspec spec/models/candle_spec.rb spec/requests/api/candles_spec.rb spec/requests/api/tickers_spec.rb spec/requests/api/indicators_spec.rb spec/jobs/candle_backfill_job_spec.rb spec/jobs/candle_sync_job_spec.rb spec/jobs/candle_sync_symbol_job_spec.rb spec/services/candle
```
