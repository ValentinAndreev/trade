# Dashboard and Market Tiles — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/01-product-overview.md`, `docs/06-ui-workflows.md`, dashboard code/config.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Give the user a first-screen market monitoring surface for key crypto symbols plus market context from indices, forex and commodities.

## Current Contract

1. Dashboard symbols must come from explicit configuration or stored state, not hidden constants.
2. Tiles must tolerate missing or stale external data.
3. The UI must distinguish unavailable data from zero/flat values.
4. Navigation into deeper workflows must preserve the selected symbol where supported.
5. Dashboard code must not mutate canonical candle contracts.

## Non-Scope

- Full portfolio management.
- Broker order placement.
- Replacing chart/data workspace analysis.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Configured symbols appear in deterministic order.
- Missing data produces an explicit degraded state.
- Selecting a symbol can feed chart/data workflows where supported.
- Changed behavior has frontend or request specs around data parsing and UI routing.

## Main Implementation

- Controllers: `app/controllers/api/dashboards_controller.rb`, `app/controllers/api/markets_controller.rb`, `app/controllers/api/tickers_controller.rb`, `app/controllers/api/configs_controller.rb`.
- Services/Config: `app/services/candle/ticker_query.rb`, `app/services/utils/symbol_store.rb`, `config/configs/dashboard_config.rb`, `config/configs/markets_config.rb`, `config/dashboard.yml`, `config/dashboard.current.yml`.
- Frontend: `app/javascript/controllers/main_controller.ts`, `app/javascript/templates/main_templates.ts`, `app/javascript/services/connection_monitor.ts`.

## Tests

- `spec/requests/api/dashboards_spec.rb`
- `spec/requests/api/markets_spec.rb`
- `spec/requests/api/tickers_spec.rb`
- `spec/requests/api/configs_spec.rb`
- `spec/services/candle/ticker_query_spec.rb`
- `spec/services/utils/symbol_store_spec.rb`
- `app/javascript/__tests__/services/connection_monitor.test.ts`

## Invariants Enforced By Code

- `Api::DashboardsController` accepts only `BitfinexConfig.available_symbols`.
- `Api::MarketsController` accepts only configured market category/symbol pairs.
- `Utils::SymbolStore` persists dashboard and market symbols through dashboard current state.
- Request specs cover invalid dashboard symbols, invalid market category and invalid market symbol.

## Known Gaps / Tech Debt

- No dedicated frontend test currently targets `main_controller.ts` tile rendering; dashboard UI coverage is mostly request/service-level.
- Degraded-state behavior depends on market/ticker API error shapes; changes should be checked against frontend parsing.
- Configured symbol order is part of the contract and can drift if dashboard/market config readers change independently.

## Verification On Change

```bash
bundle exec rspec spec/requests/api/dashboards_spec.rb spec/requests/api/markets_spec.rb spec/requests/api/tickers_spec.rb spec/requests/api/configs_spec.rb spec/services/candle/ticker_query_spec.rb spec/services/utils/symbol_store_spec.rb
npm run typecheck
npm test -- app/javascript/__tests__/services/connection_monitor.test.ts
```
