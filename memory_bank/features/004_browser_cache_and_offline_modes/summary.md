# Browser Cache and Offline Modes — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/08-offline-mode.md`, frontend cache/connectivity code.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Keep the workspace useful during backend, internet or Bitfinex degradation while preserving server truth.

## Current Contract

1. `backendOnline`, `internetOnline` and `bitfinexReachable` states must remain distinct.
2. Cached candles/series may be displayed only as derived data.
3. The UI must mark unavailable functionality rather than failing silently.
4. Cache reads must tolerate missing, stale or malformed entries.
5. Recovery must prefer fresh server data when available.

## Non-Scope

- Full offline parity for server-side research/backtesting.
- Conflict resolution for multi-device offline edits.
- Browser cache as canonical persistence.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- UI distinguishes backend-down from internet/Bitfinex degradation where supported.
- Cached data can be loaded without server writes.
- Returning online refreshes from server APIs.
- Cache errors do not crash the workspace.

## Main Implementation

- Cache: `app/javascript/data/idb_store.ts`, `app/javascript/data/candle_cache.ts`, `app/javascript/data/indicator_cache.ts`.
- Connectivity/API: `app/javascript/services/connection_monitor.ts`, `app/javascript/services/api_fetch.ts`.
- Consumers: `app/javascript/chart/data_loader.ts`, `app/javascript/chart/indicator_loader.ts`, `app/javascript/data_grid/data_loader.ts`, `app/javascript/controllers/main_controller.ts`.
- Docs contract: `docs/08-offline-mode.md`.

## Tests

- `app/javascript/__tests__/services/connection_monitor.test.ts`
- `app/javascript/__tests__/services/api_fetch.test.ts`
- `app/javascript/__tests__/research/request.test.ts`
- `app/javascript/__tests__/tabs/persistence.test.ts`

## Invariants Enforced By Code

- `apiFetch` abort/error behavior is tested in `app/javascript/__tests__/services/api_fetch.test.ts`.
- Connection state transitions are tested in `app/javascript/__tests__/services/connection_monitor.test.ts`.
- `docs/08-offline-mode.md` explicitly states IndexedDB is cache, not source of truth.

## Known Gaps / Tech Debt

- No dedicated Vitest file currently targets `candle_cache.ts`, `indicator_cache.ts` or `idb_store.ts` directly.
- Offline/degraded UX depends on browser storage and network states that are not covered by e2e tests.
- IndexedDB is documented as cache, not source of truth; changes must preserve server-owned data semantics.

## Verification On Change

```bash
npm run typecheck
npm test -- app/javascript/__tests__/services/connection_monitor.test.ts app/javascript/__tests__/services/api_fetch.test.ts app/javascript/__tests__/research/request.test.ts app/javascript/__tests__/tabs/persistence.test.ts
```
