# Research Backtest and Optimization — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/09-research-systems.md`, research services/jobs/API.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Execute YAML research systems server-side for backtests and parameter optimization with progress feedback.

## Current Contract

1. Research execution must require a valid YAML system.
2. Backtests must use server candle data and deterministic module evaluation.
3. Optimization must enumerate declared targets and record/report candidate results.
4. Progress updates must be tied to a run identity.
5. Result payloads must include metrics/trades or structured errors.
6. Failed runs must not corrupt saved system files or candle data.

## Non-Scope

- Live trading execution.
- Distributed compute cluster.
- Unvalidated ad hoc code execution.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- A valid system can start a run and return completed results.
- Invalid systems fail before execution with actionable errors.
- Optimization results are attributable to parameter values.
- Progress events or status polling identify the same run.
- Service/job/request specs cover changed behavior.

## Main Implementation

- Services: `app/services/research/backtest.rb`, `app/services/research/optimizer.rb`, `app/services/research/run_request.rb`, `app/services/research/runs/execute.rb`, `app/services/research/runs/progress_session.rb`, `app/services/research/cancellation_registry.rb`, `app/services/research/progress_broadcaster.rb`.
- Runtime/modules: `app/services/research/runtime/row_cursor.rb`, `app/services/research/runtime/signal_evaluator.rb`, `app/services/research/modules.rb`, `app/services/research/modules/external_series.rb`.
- API/Realtime: `app/controllers/api/research/runs_controller.rb`, `app/controllers/api/research/base_controller.rb`, `app/channels/research_progress_channel.rb`.
- Frontend: `app/javascript/research/request.ts`, `app/javascript/research/progress.ts`, `app/javascript/research/progress_subscription.ts`, `app/javascript/research/results.ts`, `app/javascript/research/optimization_chart.ts`, `app/javascript/controllers/research_controller.ts`.

## Tests

- `spec/services/research/backtest_spec.rb`
- `spec/services/research/optimizer_spec.rb`
- `spec/services/research/run_request_spec.rb`
- `spec/services/research/runs/execute_spec.rb`
- `spec/services/research/runs/progress_session_spec.rb`
- `spec/services/research/modules/external_series_spec.rb`
- `spec/requests/api/research_spec.rb`
- `app/javascript/__tests__/research/request.test.ts`
- `app/javascript/__tests__/research/progress.test.ts`
- `app/javascript/__tests__/research/results.test.ts`
- `app/javascript/__tests__/research/optimization_chart.test.ts`

## Invariants Enforced By Code

- Run input is normalized through `Research::RunRequest`.
- Backtest execution depends on validated system definitions and server candle data.
- Progress session behavior is covered by service specs and frontend progress tests.
- Optimization output is covered by backend optimizer specs and frontend chart tests.

## Known Gaps / Tech Debt

- Long-running research execution remains in-process/Solid Queue style; distributed execution is out of scope.
- Progress identity spans services, channel and frontend polling/subscription code, so race conditions need focused review on change.
- Optimization cost/performance is not deeply characterized; specs cover correctness boundaries.

## Verification On Change

```bash
bundle exec rspec spec/services/research/backtest_spec.rb spec/services/research/optimizer_spec.rb spec/services/research/run_request_spec.rb spec/services/research/runs/execute_spec.rb spec/services/research/runs/progress_session_spec.rb spec/services/research/modules/external_series_spec.rb spec/requests/api/research_spec.rb
npm test -- app/javascript/__tests__/research
```
