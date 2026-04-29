# Workspace Frontend Refactor — Summary

> Backfilled summary of existing shipped behavior.
> Sources: workspace TypeScript modules, frontend tests, recent git history.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Keep the frontend workspace maintainable by separating tab orchestration, feature modules, events, API calls and lifecycle handling.

## Current Contract

1. Controllers should delegate nontrivial logic to modules/coordinators.
2. Shared events must use constants or central helpers when crossing layers.
3. Async requests tied to UI lifecycle must support abort/disconnect guards.
4. Refactors must preserve preset/localStorage compatibility.
5. Behavioral equivalence must be covered by targeted Vitest tests.
6. Error paths must remain explicit after code movement.

## Non-Scope

- Rewriting the frontend framework.
- Changing UX contracts without feature specs.
- Broad visual redesign.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Existing workspace flows still typecheck and pass frontend tests: `app/javascript/__tests__/workspace/linked_data_coordinator.test.ts`, `app/javascript/__tests__/workspace/research_coordinator.test.ts`, `app/javascript/__tests__/workspace/system_editor_coordinator.test.ts`, `app/javascript/__tests__/workspace/assistant_coordinator.test.ts`.
- Disconnecting controllers does not apply stale async results: `app/javascript/__tests__/services/api_fetch.test.ts`, `app/javascript/__tests__/workspace/linked_data_coordinator.test.ts`, `app/javascript/__tests__/workspace/research_coordinator.test.ts`.
- Shared event names remain stable across modules: `app/javascript/__tests__/workspace/events.test.ts`.
- Refactored modules have focused tests for moved behavior: `app/javascript/__tests__/tabs/store.test.ts`, `app/javascript/__tests__/tabs/persistence.test.ts`, `app/javascript/__tests__/utils/dom.test.ts`.

## Main Implementation

- Workspace coordinators: `app/javascript/workspace/assistant_coordinator.ts`, `app/javascript/workspace/linked_data_coordinator.ts`, `app/javascript/workspace/research_coordinator.ts`, `app/javascript/workspace/system_editor_coordinator.ts`, `app/javascript/workspace/events.ts`, `app/javascript/workspace/types.ts`.
- Tabs modules: `app/javascript/tabs/store.ts`, `app/javascript/tabs/persistence.ts`, `app/javascript/tabs/config.ts`, `app/javascript/tabs/renderer.ts`, `app/javascript/tabs/data_actions/index.ts`.
- Shared services/utils: `app/javascript/services/api_fetch.ts`, `app/javascript/utils/dom.ts`, `app/javascript/types/events.ts`.
- Controllers: `app/javascript/controllers/tabs_controller.ts`, `app/javascript/controllers/system_editor_controller.ts`, `app/javascript/controllers/research_controller.ts`, `app/javascript/controllers/assistant_controller.ts`.

## Tests

- `app/javascript/__tests__/workspace/events.test.ts`
- `app/javascript/__tests__/workspace/linked_data_coordinator.test.ts`
- `app/javascript/__tests__/workspace/research_coordinator.test.ts`
- `app/javascript/__tests__/workspace/system_editor_coordinator.test.ts`
- `app/javascript/__tests__/workspace/assistant_coordinator.test.ts`
- `app/javascript/__tests__/tabs/store.test.ts`
- `app/javascript/__tests__/tabs/persistence.test.ts`
- `app/javascript/__tests__/services/api_fetch.test.ts`
- `app/javascript/__tests__/utils/dom.test.ts`

## Invariants Enforced By Code

- Workspace event names and dispatch behavior are covered by `workspace/events.test.ts`.
- Tab persistence/store behavior is covered by dedicated tests.
- `apiFetch` abort semantics are covered by `services/api_fetch.test.ts`.
- Coordinator behavior is covered per workspace integration slice.

## Known Gaps / Tech Debt

- `tabs_controller.ts` remains a large orchestration surface; future refactors should keep extracting logic into tested modules.
- Broad frontend refactors can break full workspace restore despite focused module tests; run typecheck and affected Vitest suites together.
- Shared event names are cross-feature contracts, especially for chart/data/research/system editor/assistant coordinators.

## Verification On Change

```bash
npm run typecheck
npm test -- app/javascript/__tests__/workspace app/javascript/__tests__/tabs/store.test.ts app/javascript/__tests__/tabs/persistence.test.ts app/javascript/__tests__/tabs/config.test.ts app/javascript/__tests__/services/api_fetch.test.ts app/javascript/__tests__/utils/dom.test.ts
```
