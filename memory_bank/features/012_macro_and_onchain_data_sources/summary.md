# Macro and On-Chain Data Sources — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/01-product-overview.md`, `docs/03-domain-model.md`, macro sync code.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Store and expose macro/on-chain time series so charts and data grids can compare market prices with broader context.

## Current Contract

1. Each supported series must have a stable key.
2. Sync jobs must be idempotent and safe to rerun.
3. Missing credentials or provider failures must be visible and non-destructive.
4. Range APIs must return ordered timestamp/value data.
5. Frontend consumers must handle missing or sparse macro series.

## Non-Scope

- Paid/unlimited provider coverage.
- Treating macro sources as candle exchanges.
- Fabricating missing values.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Supported series can be backfilled/synced without duplicate rows.
- Missing provider credentials produce clear failure state.
- Chart/data-grid consumers can request a range and render sparse data.
- Changed sync/API behavior has service/request specs.

## Main Implementation

- Model: `app/models/macro_series.rb`.
- Services: `app/services/macro/catalog.rb`, `app/services/macro/find_query.rb`, `app/services/macro/importer.rb`, `app/services/macro/syncer.rb`, `app/services/macro/sync/backfill.rb`, `app/services/macro/sync/recent.rb`.
- Providers/jobs/API: `app/services/utils/yahoo_finance_client.rb`, `app/services/utils/fred_client.rb`, `app/services/utils/alternative_me_client.rb`, `app/services/utils/coin_metrics_client.rb`, `app/jobs/macro_sync_job.rb`, `app/controllers/api/macro_series_controller.rb`.
- Config: `config/configs/macro_config.rb`.

## Tests

- `spec/config/macro_config_sync_spec.rb`
- `spec/factories/macro_series.rb`
- `spec/requests/api/macro_series_spec.rb`
- `spec/services/macro/find_query_spec.rb`
- `spec/services/macro/syncer_spec.rb`
- `spec/services/macro/sync/backfill_spec.rb`
- `spec/services/macro/sync/recent_spec.rb`
- `spec/services/utils/yahoo_finance_client_spec.rb`
- `spec/services/utils/fred_client_spec.rb`
- `spec/services/utils/alternative_me_client_spec.rb`
- `spec/services/utils/coin_metrics_client_spec.rb`

## Invariants Enforced By Code

- `MacroSeries` requires `ts`, `source`, `indicator`, `value`.
- `db/schema.rb` enforces unique `index_macro_series_on_source_indicator_ts`.
- `MacroSeries.import` uses that unique index for idempotent inserts.
- Provider behavior is covered by utility client specs.

## Known Gaps / Tech Debt

- External provider availability and credentials remain operational dependencies; tests use stubs and cannot guarantee provider uptime.
- Sparse macro/on-chain data is expected, so consumers must not assume dense candle-like ranges.
- Provider-specific adapters should stay isolated; shared importer changes require review across all configured sources.

## Verification On Change

```bash
bundle exec rspec spec/config/macro_config_sync_spec.rb spec/requests/api/macro_series_spec.rb spec/services/macro/find_query_spec.rb spec/services/macro/syncer_spec.rb spec/services/macro/sync/backfill_spec.rb spec/services/macro/sync/recent_spec.rb spec/services/utils/yahoo_finance_client_spec.rb spec/services/utils/fred_client_spec.rb spec/services/utils/alternative_me_client_spec.rb spec/services/utils/coin_metrics_client_spec.rb
```
