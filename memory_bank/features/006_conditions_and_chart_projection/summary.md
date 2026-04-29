# Conditions and Chart Projection — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/03-domain-model.md`, `docs/06-ui-workflows.md`, data/chart linking code.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Let data-grid conditions produce visual filtering, highlighting, markers and chart-facing projections.

## Current Contract

1. Conditions must serialize/restore as part of `DataConfig`.
2. Evaluation must be deterministic for the same row set and config.
3. Filter/highlight/marker/color-zone modes must remain distinct.
4. Chart projection must include enough identity to remove or update derived visuals.
5. Invalid condition config must not break unrelated grid/chart behavior.

## Non-Scope

- Server-side execution of every grid condition.
- A universal expression language shared with research YAML.
- Mutating chart source candles from projected conditions.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Saved conditions restore with the data tab.
- A condition can affect grid visual state without changing row data.
- Marker/color-zone projection updates the linked chart deterministically.
- Tests cover changed condition evaluation and projection payloads.

## Main Implementation

- Condition engine: `app/javascript/data_grid/condition_engine.ts`.
- Data actions: `app/javascript/tabs/data_actions/condition_actions.ts`, `app/javascript/tabs/data_actions/link_actions.ts`.
- Projection/linking: `app/javascript/data_grid/chart_bridge.ts`, `app/javascript/workspace/linked_data_coordinator.ts`.
- Templates: `app/javascript/templates/condition_templates.ts`.

## Tests

- `app/javascript/__tests__/data_grid/condition_engine.test.ts`
- `app/javascript/__tests__/workspace/linked_data_coordinator.test.ts`
- `app/javascript/__tests__/tabs/persistence.test.ts`

## Invariants Enforced By Code

- Condition evaluation is isolated in `condition_engine.ts` and covered by unit tests.
- Linked chart/data behavior is covered by `workspace/linked_data_coordinator.test.ts`.
- Condition config persistence is covered through tab persistence tests.

## Known Gaps / Tech Debt

- Marker/color-zone visual rendering is not fully covered by browser-level tests.
- Projection payloads are shared between data grid and chart workspace; changes should be reviewed with linked chart behavior.
- Condition persistence relies on tab serialization invariants; saved-state compatibility should be checked before changing condition shape.

## Verification On Change

```bash
npm run typecheck
npm test -- app/javascript/__tests__/data_grid/condition_engine.test.ts app/javascript/__tests__/workspace/linked_data_coordinator.test.ts app/javascript/__tests__/tabs/persistence.test.ts
```
