# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 5 — Razorpay test-mode checkout (implementation complete; manual credentialed smoke test blocked)
- Overall state: all Session 5 code, automated tasks, and credential-free acceptance checks pass; Session 6 has not started
- Current branch: `session/05-razorpay-test-checkout`

## Completed

- Added strict shared payment contracts, an explicit checkout/payment state machine, and fake/Razorpay test providers behind one typed port.
- Added server-side Razorpay Orders API mapping with an 8-second request timeout, strict response validation, test-key enforcement, and no browser exposure of the key or webhook secrets.
- Added PostgreSQL payment orders and a webhook inbox. A row lock and primary key consume one allowed Session 4 checkout authorization before the provider call, so concurrent requests and retries cannot create a second provider order.
- Added Standard Checkout launch at `/checkout/:checkoutAttemptId`; retries reopen the same recorded provider order, callbacks are verified server-side, and modal dismissal records cancellation.
- Added raw-body webhook signature verification, event-ID deduplication, unknown-event handling, and out-of-order reconciliation. Verified capture can correct failed, expired, or cancelled local evidence; no later event can regress `paid`.
- Added pending, paid, failed, expired, and cancelled API states. An uncertain provider call stays single-shot in `creating` and expires with explicit `provider_timeout` evidence rather than being retried silently.
- Added append-only, redacted audit events for provider order creation, callback verification/rejection, timeout, cancellation, and every webhook outcome.
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

Payment coverage includes an HTTP-boundary fake-provider purchase, one-order concurrency, same-order retry, callback and raw webhook signature verification, success, decline, cancellation, provider timeout, duplicate webhook, out-of-order webhook, terminal-state reconciliation, and durable rejection audit evidence.

`test:e2e` and `eval` scripts do not exist yet; their roadmap implementations begin in Sessions 8 and 7 respectively, so they are not applicable to Session 5.

## Blockers

- The three Razorpay variables are absent from the current process environment. A manual Razorpay test transaction and webhook delivery require `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`, plus a test-mode webhook configured to reach the local/public callback. No credential value was read or logged.
- No automated work is blocked; all fake-provider and adapter verification is complete.

## Exact next action

Supply the three Razorpay test credentials locally and configure a test webhook, then run one manual Standard Checkout transaction through `/checkout/:checkoutAttemptId`, confirm the verified terminal state and audit events, and record the result here. After that acceptance item passes, review and merge `session/05-razorpay-test-checkout`; Session 6 must start from the updated `main` on `session/06-merchant-growth-evidence`.
