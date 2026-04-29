# Data Grid MVP — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/03-domain-model.md`, `docs/06-ui-workflows.md`, data tab code/tests.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Provide a data-table workspace for OHLCV, indicators, formulas, instrument columns and macro columns.

## Current Contract

1. Data tab configuration must serialize/restore without losing columns or symbols.
2. Column calculations must be deterministic for the same input rows.
3. Invalid column configs must fail visibly and locally.
4. Linked chart context must populate data tab defaults where supported.
5. Macro/instrument columns must handle missing data without corrupting rows.

## Non-Scope

- Replacing server research backtesting.
- Arbitrary spreadsheet compatibility.
- Mutating canonical candle data from the grid.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- A data tab can restore symbols, timeframe, columns and date range from saved state.
- Supported columns render values or explicit empty/error states.
- Formula/indicator behavior is covered by frontend tests when changed.
- Linked chart creation preserves source symbol/timeframe.

## Main Implementation

- Backend: `app/controllers/api/data_tables_controller.rb`, `app/services/data_table/builder.rb`, `app/services/data_table/macro_attach_step.rb`, `app/services/data_table/statistics.rb`.
- Frontend controller/modules: `app/javascript/controllers/data_grid_controller.ts`, `app/javascript/data_grid/data_loader.ts`, `app/javascript/data_grid/grid_config.ts`, `app/javascript/data_grid/sidebar_renderer.ts`.
- Tab actions/templates: `app/javascript/tabs/data_actions/column_actions.ts`, `app/javascript/tabs/data_actions/data_sync.ts`, `app/javascript/templates/data_grid_form_templates.ts`.

## Tests

- Request spec for `Api::DataTablesController` is not present; backend data table behavior is currently covered by service specs.
- `spec/services/data_table/macro_attach_step_spec.rb`
- `app/javascript/__tests__/data_grid/condition_engine.test.ts`
- `app/javascript/__tests__/tabs/config.test.ts`
- `app/javascript/__tests__/tabs/persistence.test.ts`

## Invariants Enforced By Code

- `DataConfig` persistence is tested via tab persistence tests.
- Macro attachment behavior is covered by `spec/services/data_table/macro_attach_step_spec.rb`.
- Condition logic used by grid rows is covered by `app/javascript/__tests__/data_grid/condition_engine.test.ts`.

## Known Gaps / Tech Debt

- No request spec currently exists for `Api::DataTablesController`; add one before changing backend data-table API contracts.
- AG Grid adapter/UI behavior is thinner than pure module coverage; visual grid regressions may escape current tests.
- DataConfig persistence is shared with other tab features, so schema changes need cross-feature review with 006/007.

## Verification On Change

```bash
bundle exec rspec spec/services/data_table/macro_attach_step_spec.rb
npm run typecheck
npm test -- app/javascript/__tests__/data_grid/condition_engine.test.ts app/javascript/__tests__/tabs/config.test.ts app/javascript/__tests__/tabs/persistence.test.ts
```
