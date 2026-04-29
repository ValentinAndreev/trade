# Presets and Auth — Summary

> Backfilled summary of existing shipped behavior.
> Sources: `docs/02-architecture.md`, `docs/03-domain-model.md`, presets/auth code.
> Purpose: document current contract, main paths, checks and known gaps; not future work.

## Goal

Persist workspace snapshots for signed-in users while keeping access control simple and internal-app oriented.

## Current Contract

1. A preset must belong to the appropriate user/auth context.
2. Payloads must restore existing workspace tabs and configs.
3. New workspace payload fields must be backward-compatible.
4. API errors must distinguish unauthenticated, not found and invalid payload cases.
5. Tests must cover auth boundaries when routes/controllers change.

## Non-Scope

- Multi-tenant SaaS roles and permissions.
- Public sharing/collaboration.
- Breaking preset payload migrations without compatibility plan.

## Verified By

Current verification sources are listed in `Tests`; items below describe behavior covered or constrained by the existing implementation.

- Signed-in users can save and reload workspace presets.
- Invalid preset payloads fail safely.
- Unauthorized access is rejected.
- Payload shape changes include compatibility handling and tests.

## Main Implementation

- Models: `app/models/user.rb`, `app/models/preset.rb`.
- Controllers: `app/controllers/api/application_controller.rb`, `app/controllers/api/sessions_controller.rb`, `app/controllers/api/registrations_controller.rb`, `app/controllers/api/presets_controller.rb`.
- Frontend: `app/javascript/controllers/auth_controller.ts`, `app/javascript/services/auth.ts`, `app/javascript/services/presets.ts`, `app/javascript/templates/auth_templates.ts`.
- Schema/RBS: `db/schema.rb`, `sig/app/models/user.rbs`, `sig/app/models/preset.rbs`, `sig/app/controllers/api/presets_controller.rbs`.

## Tests

- `spec/models/user_spec.rb`
- `spec/models/preset_spec.rb`
- `spec/requests/api/sessions_spec.rb`
- `spec/requests/api/registrations_spec.rb`
- `spec/requests/api/presets_spec.rb`
- `app/javascript/__tests__/services/auth.test.ts`
- `app/javascript/__tests__/services/presets.test.ts`

## Invariants Enforced By Code

- `Preset` belongs to `User`, requires `name` and `payload`, and validates unique `name` per user.
- `db/schema.rb` enforces unique `index_presets_on_user_id_and_name`.
- `User` has secure password and unique `username`.
- Request specs cover session/registration/preset API behavior.

## Known Gaps / Tech Debt

- `Preset.payload` has no explicit version field; compatibility relies on frontend defaulting and careful schema evolution.
- Auth boundaries are app-local and not a broader SaaS authorization model; scope expansion needs separate design.
- Workspace restore can break silently if payload shape changes without compatibility handling.

## Verification On Change

```bash
bundle exec rspec spec/models/user_spec.rb spec/models/preset_spec.rb spec/requests/api/sessions_spec.rb spec/requests/api/registrations_spec.rb spec/requests/api/presets_spec.rb
npm test -- app/javascript/__tests__/services/auth.test.ts app/javascript/__tests__/services/presets.test.ts
```
