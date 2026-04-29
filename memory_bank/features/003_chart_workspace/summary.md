# Chart Workspace — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/03-domain-model.md`, `docs/06-ui-workflows.md`, chart workspace code.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Provide an interactive multi-tab chart workspace for price analysis, overlays, indicators, drawings and realtime updates.

## Current Contract

1. Chart state must be serializable into workspace/preset payloads.
2. Panels must maintain stable overlay identity across updates.
3. Primary overlay selection must remain available to linked workflows.
4. Historical fetch and realtime updates must not duplicate or reorder candles.
5. Error and empty states must be scoped to the affected chart/panel.
6. User-created drawings/configuration must not be lost by data refreshes.

## Non-Scope

- Rebuilding the chart engine.
- Broker execution from charts.
- Full offline parity for server-only data.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Opening/restoring a chart tab keeps symbol, timeframe, panels and overlays.
- Realtime updates append/replace the expected candle without duplication.
- Linked data workflows can identify the chart's primary symbol/timeframe.
- Changed chart behavior has frontend tests around state serialization or update logic.

## Main Implementation

- Controllers: `app/javascript/controllers/chart_controller.ts`, `app/javascript/controllers/tabs_controller.ts`.
- Chart modules: `app/javascript/chart/data_loader.ts`, `app/javascript/chart/indicator_loader.ts`, `app/javascript/chart/indicator_manager.ts`, `app/javascript/chart/overlay_utils.ts`, `app/javascript/chart/scale_manager.ts`, `app/javascript/chart/series_factory.ts`, `app/javascript/chart/drawing_manager.ts`, `app/javascript/chart/volume_profile_manager.ts`.
- Realtime/API: `app/channels/candles_channel.rb`, `app/javascript/chart/feeds/cable_feed.ts`, `app/controllers/api/candles_controller.rb`, `app/controllers/api/indicators_controller.rb`, `app/controllers/api/macro_series_controller.rb`.
- Workspace/tabs: `app/javascript/tabs/persistence.ts`, `app/javascript/tabs/store.ts`, `app/javascript/tabs/panel_renderer.ts`, `app/javascript/tabs/drawing_actions.ts`.

## Tests

- `app/javascript/__tests__/chart/overlay_utils.test.ts`
- `app/javascript/__tests__/chart/scale_manager.test.ts`
- `app/javascript/__tests__/tabs/drawing_actions.test.ts`
- `app/javascript/__tests__/tabs/persistence.test.ts`
- `app/javascript/__tests__/tabs/store.test.ts`
- `spec/requests/api/candles_spec.rb`
- `spec/requests/api/indicators_spec.rb`
- `spec/requests/api/macro_series_spec.rb`

## Invariants Enforced By Code

- Tab persistence is covered by `app/javascript/__tests__/tabs/persistence.test.ts`.
- Overlay and scale behavior are covered by dedicated chart module tests.
- Candle and indicator API contracts are covered by request specs.
- Realtime chart input is routed through `CandlesChannel` and cable feed modules.

## Known Gaps / Tech Debt

- Visual chart rendering itself is not fully covered by browser/e2e screenshots; module tests cover deterministic helpers.
- Realtime candle append/replace behavior crosses Rails channels and TypeScript feeds; review both sides when changing payload shape.
- Tab persistence and chart panel state are tightly coupled; saved-state compatibility should be checked for workspace serialization changes.

## Verification On Change

```bash
bundle exec rspec spec/requests/api/candles_spec.rb spec/requests/api/indicators_spec.rb spec/requests/api/macro_series_spec.rb
npm run typecheck
npm test -- app/javascript/__tests__/chart/overlay_utils.test.ts app/javascript/__tests__/chart/scale_manager.test.ts app/javascript/__tests__/tabs/drawing_actions.test.ts app/javascript/__tests__/tabs/persistence.test.ts app/javascript/__tests__/tabs/store.test.ts
```
