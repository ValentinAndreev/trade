# Development Ops

Этот файл собирает local environment, database and credential rules для разработки. Long-form setup остается в `docs/04-local-setup.md`; здесь хранится короткий operational contract для agents and maintainers.

## Runtime

- Ruby `4.0.1`.
- Node.js `22` compatible with CI.
- PostgreSQL `17` with TimescaleDB extension.
- Bundler and npm dependencies installed from checked-in lockfiles.

## Setup

```bash
bin/setup
```

Use `bin/setup --reset` only when local data can be discarded.

## Development Server

```bash
bin/dev
```

`bin/dev` starts Rails, Solid Queue, JS watcher and CSS watcher through `Procfile.dev`.

## Database

- Local setup must create TimescaleDB hypertables for `candles` and `macro_series`.
- Continuous aggregates must exist for higher candle timeframes.
- Do not edit existing migrations; schema changes need a new migration.
- Do not rewrite `db/schema.rb` manually.

Useful commands:

```bash
bin/rails db:prepare
bin/rails db:migrate
bin/rails console
```

## Credentials

- FRED macro data may use Rails credentials key `macro.fred_api_key` or environment variable `MACRO_FRED_API_KEY`.
- LLM provider API keys are entered through the Assistant UI and stored encrypted in `llm_settings.api_key`.
- Do not put LLM provider keys in Rails credentials, docs, fixtures or test snapshots.
- Production credentials/deployment settings are out of scope for autonomous cleanup.

Edit local Rails credentials only when explicitly needed:

```bash
VISUAL="code --wait --new-window" bin/rails credentials:edit
```

## External Providers

- Bitfinex, Yahoo Finance, FRED, AlternativeMe and Coin Metrics may be unavailable locally.
- Tests should stub provider calls instead of requiring live network access.
- Missing FRED credentials should be visible and non-destructive.

## Local Verification

Pick the narrowest defensible set from `memory_bank/engineering/conventions.md`.

Common commands:

```bash
bundle exec rspec
npm test
npm run typecheck
bundle exec steep check
bin/memory-bank-check
```
