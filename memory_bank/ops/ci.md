# CI Ops

This file mirrors `.github/workflows/ci.yml` as an operational reference. The workflow file remains the executable source of truth; this document explains jobs, environment assumptions and local equivalents.

## Jobs

| Job | Purpose | Local equivalent |
|---|---|---|
| `memory_bank` | Validate memory-bank structure | `bin/memory-bank-check` |
| `scan_ruby` | Rails security and gem CVE scans | `bin/brakeman --no-pager`, `bin/bundler-audit` |
| `lint` | Ruby style | `bin/rubocop -f github` or `bin/rubocop` |
| `typecheck_ts` | TypeScript type check | `npm run typecheck` |
| `test_js` | Vitest frontend suite | `npm test` |
| `type_check` | RBS/Steep | `bundle exec rbs collection install`, `bundle exec steep check` |
| `test` | RSpec with PostgreSQL/TimescaleDB | `bundle exec rspec` |

## Test Database

CI runs backend specs with:

```text
RAILS_ENV=test
CI=true
DATABASE_URL=postgres://postgres:postgres@localhost:5432/trade_test
```

The PostgreSQL service uses `timescale/timescaledb:latest-pg17` and loads schema with:

```bash
bin/rails db:schema:load
```

## Dependency Installation

- Ruby jobs use `ruby/setup-ruby@v1` with bundler cache where dependencies are needed.
- Node jobs use `actions/setup-node@v4`, Node `22`, npm cache and `npm ci`.
- CI should keep using lockfile-based installs.

## Memory Bank Checks

For memory-bank or workflow changes, run:

```bash
bin/memory-bank-check
bundle exec rspec spec/bin/memory_bank_check_spec.rb
ruby -c bin/memory-bank-check
git diff --check
```

The validator checks stable structure, not path freshness, prose quality or semantic correctness.

## Failure Triage

- `memory_bank` failure usually means invalid stage/status, missing required process docs, or an invalid current-focus shape.
- `test` failures can depend on TimescaleDB availability and schema load.
- Provider availability should not be required for CI; specs should stub external network calls.
