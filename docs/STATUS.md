# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 5 — Razorpay test-mode checkout (complete; awaiting review/merge)
- Overall state: all Session 5 tasks and acceptance criteria pass, including a real Razorpay test-mode transaction; Session 6 has not started on this branch
- Current branch: `session/05-razorpay-test-checkout`

## Completed

- Added strict shared payment contracts, an explicit checkout/payment state machine, and fake/Razorpay test providers behind one typed port.
- Added server-side Razorpay Orders API mapping with an 8-second request timeout, strict response validation, test-key enforcement, and no browser exposure of the key or webhook secrets.
- Added PostgreSQL payment orders and a webhook inbox. A row lock and primary key consume one allowed Session 4 checkout authorization before the provider call, so concurrent requests and retries cannot create a second provider order.
- Added Standard Checkout launch at `/checkout/:checkoutAttemptId`; retries reopen the same recorded provider order, callbacks are verified server-side, and modal dismissal records cancellation.
- Added raw-body webhook signature verification, event-ID deduplication, unknown-event handling, and out-of-order reconciliation. Verified capture can correct failed, expired, or cancelled local evidence; no later event can regress `paid`.
- Added pending, paid, failed, expired, and cancelled API states. An uncertain provider call stays single-shot in `creating` and expires with explicit `provider_timeout` evidence rather than being retried silently.
- Added append-only, redacted audit events for provider order creation, callback verification/rejection, timeout, cancellation, and every webhook outcome.
- Routed browser checkout calls through a same-origin Next.js proxy so normal browsers can reach the API without cross-origin failures; the upstream remains server-configurable with `API_BASE_URL`.
- Expanded the cart audit timeline to include its related checkout and webhook records, with regression coverage for provider order creation, callback verification, and processed webhook evidence.
- Completed a ₹2,349 Razorpay test-mode purchase using an approved immutable cart. The server created one Razorpay Order, processed signed webhook deliveries, safely ignored later/out-of-order evidence, and persisted the terminal `paid` state with the matching payment ID.
- Published payment endpoints in OpenAPI and documented fake-provider setup, Razorpay test-mode setup, browser launch, signatures, retry behavior, and the durable payment architecture decision.

## Verification

Passed on 2026-09-04:

- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:migrate`
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:seed`
- `corepack pnpm repo:check` — 94 candidate files clean
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck` — root sources and all six packages pass strict TypeScript
- `corepack pnpm test` — 35 tests in 13 files pass without network access
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm test:integration` — 25 PostgreSQL/Redis tests in five files pass
- `corepack pnpm build` — shared packages, API, worker, and production Next.js application pass
- `git diff --check`

Payment coverage includes an HTTP-boundary fake-provider purchase, one-order concurrency, same-order retry, callback and raw webhook signature verification, success, decline, cancellation, provider timeout, duplicate webhook, out-of-order webhook, terminal-state reconciliation, full cart-linked payment audit visibility, and durable rejection audit evidence. A credentialed manual smoke test additionally verified real test-order creation, Standard Checkout, signed webhook delivery, and terminal `paid` reconciliation.

`test:e2e` and `eval` scripts do not exist yet; their roadmap implementations begin in Sessions 8 and 7 respectively, so they are not applicable to Session 5.

## Blockers

- None for Session 5.
- The temporary Cloudflare webhook tunnel used for the manual test was stopped after verification; future manual transactions need a newly configured reachable webhook URL.

## Exact next action

Review and merge `session/05-razorpay-test-checkout`. Session 6 must be based on this verified Session 5 branch because its growth metrics consume payment records.
