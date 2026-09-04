# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 6 — merchant growth evidence (complete; awaiting review/merge)
- Overall state: every Session 5 and Session 6 task and acceptance criterion passes; Session 7 has not started
- Current branch: `session/06-merchant-growth-evidence`
- Branch dependency: Session 6 is stacked directly on completed Session 5 commit `0b587c7`. Merge Session 5 before Session 6.

## Completed

- Added strict payment contracts, an explicit checkout/payment state machine, and fake/Razorpay test providers behind one typed port.
- Added server-side Razorpay Order creation, Standard Checkout, verified callbacks and raw-body webhooks, event-ID deduplication, out-of-order reconciliation, single-shot retry/timeout behavior, and append-only redacted payment audits.
- Routed browser checkout calls through a same-origin Next.js proxy so normal browsers can reach the API without cross-origin failures; the upstream remains server-configurable with `API_BASE_URL`.
- Expanded cart audit timelines to include related checkout and webhook records, with regression coverage for provider order creation, callback verification, and processed webhook evidence.
- Completed a ₹2,349 Razorpay test-mode purchase using an approved immutable cart. The server created one Razorpay Order, processed signed webhook deliveries, safely ignored later/out-of-order evidence, and persisted the terminal `paid` state with the matching payment ID.
- Added a strict merchant growth summary contract and PostgreSQL reader for funnel counts, add-on outcomes, paid base cart value, accepted add-on value, gross and average order value, and attach rate.
- Derived funnel counts from append-only audit events and value metrics from verified paid immutable checkout snapshots. Empty datasets return explicit zero values rather than estimates.
- Added a fixed historical-cart simulation comparing the compatibility policy with the same authorized carts after subtracting accepted add-on lines.
- Labeled the comparison “not causal” in both API and UI, and explicitly avoided conversion-lift or production-revenue claims.
- Added recent suggestion evidence with catalogue-authored compatibility reasons, accepted/declined/skipped outcomes, and associated checkout state.
- Added `GET /v1/merchants/:merchantId/growth`, published its response in OpenAPI, and added a responsive `/merchant` dashboard with visible metric definitions.
- Verified a two-order evidence fixture: one accepted add-on and one declined add-on both reached `paid`; the dashboard reported ₹4,698.00 base value, ₹699.00 accepted add-on value, ₹5,397.00 observed order value, ₹2,698.50 average order value, and 50.00% attach rate.
- Visually checked the production dashboard at 1280px and 390px widths: hierarchy and values rendered correctly, no horizontal overflow occurred, and the browser produced no warnings or errors.

## Verification

Passed on 2026-09-04:

- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:migrate`
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:seed`
- `corepack pnpm repo:check` — 98 candidate files clean
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck` — root sources and all six packages pass strict TypeScript
- `corepack pnpm test` — 35 tests in 13 files pass without network access
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm test:integration` — 26 PostgreSQL/Redis tests in six files pass
- `corepack pnpm build` — shared packages, API, worker, and production Next.js application pass
- `git diff --check`

Payment coverage includes an HTTP-boundary fake-provider purchase, one-order concurrency, same-order retry, callback and raw webhook signature verification, success, decline, cancellation, provider timeout, duplicate webhook, out-of-order webhook, terminal-state reconciliation, full cart-linked payment audit visibility, and durable rejection evidence. The credentialed manual smoke test additionally verified real test-order creation, Standard Checkout, signed webhook delivery, and terminal `paid` reconciliation.

Growth coverage includes empty data, exact paid-snapshot values, funnel event counts, attach rate, simulation arithmetic, visible compatibility reasons, and an explicitly declined add-on whose checkout still reaches `paid`.

`test:e2e` and `eval` scripts do not exist yet; their roadmap implementations begin in Sessions 8 and 7 respectively, so they are not applicable to Session 6.

## Blockers

- None for Sessions 5 or 6.
- The temporary Cloudflare webhook tunnel used for the manual test was stopped after verification; a future manual transaction needs a new reachable webhook URL.

## Exact next action

Review and merge Session 5 before the stacked Session 6 branch. After both land on `main`, create `session/07-adversarial-evaluation` from updated `main` and begin the versioned evaluation cases.
