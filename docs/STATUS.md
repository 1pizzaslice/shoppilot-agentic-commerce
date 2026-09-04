# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 4 — cart, upsell, policy gate, and approval (complete; awaiting review/merge)
- Overall state: all Session 4 tasks and acceptance criteria pass; Session 5 has not started
- Current branch: `session/04-cart-policy-approval`

## Completed

- Created the Session 4 branch from local `main` after confirming it matched `origin/main` at `76e9b1a`.
- Added strict cart, line, add-on outcome, snapshot, approval, policy decision, checkout attempt, audit event, and HTTP boundary contracts plus explicit cart and checkout state machines.
- Added PostgreSQL carts with monotonically increasing versions and row-lock-backed optimistic concurrency; concurrent mutations and approvals serialize, and stale writers receive conflicts.
- Added a deterministic compatibility selector that returns at most one active, in-stock add-on. Direct accessory insertion is rejected; accepted, declined, and skipped outcomes are stored, and only explicit acceptance adds a line.
- Added canonical checkout snapshots that freeze SKU, variant, quantity, unit price, discount, tax, delivery, currency, and totals. SHA-256 hashes bind the contents, and a database trigger rejects snapshot updates.
- Added expiring, single-use approvals bound to user, cart version, snapshot hash, total, and currency. Any later cart mutation invalidates unused approval records.
- Added a transactional checkout policy gate for cart state, approval existence/freshness/use, mutation, budget, quantity, current stock, current price, and duplicate execution.
- Added one unique internal checkout authorization per approval and snapshot hash. No payment provider or external order can be invoked in Session 4; Session 5 must consume this allowed boundary.
- Added append-only, database-protected and safely redacted audit events for cart mutations, add-on outcomes, snapshots, approvals, invalidations, policy decisions, and checkout authorization.
- Published cart, review, approval, checkout-authorization, and audit endpoints in OpenAPI and documented the safety boundary in `README.md` and `docs/ARCHITECTURE.md`.

## Verification

Passed on 2026-09-04:

- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:migrate`
- `corepack pnpm repo:check` — 85 candidate files clean
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck` — root sources and all six packages pass strict TypeScript
- `corepack pnpm test` — 31 tests in 12 files pass without network access
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm test:integration` — 17 PostgreSQL/Redis tests in four files pass
- `corepack pnpm build` — shared packages, API, worker, and the production Next.js application pass
- `git diff --check`

Integration coverage includes explicit/declined/skipped add-ons, direct accessory rejection, stale and concurrent cart writes, concurrent approval submissions, database-immutable snapshots, approval invalidation, over-budget carts, expired approvals, price and stock changes, concurrent checkout authorization, duplicate execution, audit redaction, and append-only enforcement.

`test:e2e` and `eval` scripts do not exist yet; their roadmap implementations begin in Sessions 8 and 7 respectively, so they are not applicable to Session 4.

## Blockers

- None for Session 4.
- Session 5 live Razorpay testing will require `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` supplied locally, never committed. The fake payment adapter and automated failure coverage do not require those credentials.

## Exact next action

Review and merge `session/04-cart-policy-approval` into `main`. Then create `session/05-razorpay-test-checkout` from the updated local `main` and begin the fake/Razorpay payment adapter task, requiring every provider order creation to consume the stored allowed checkout authorization.
