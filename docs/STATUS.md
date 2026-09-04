# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 9 — hardening and public-repository review (complete;
  awaiting review/merge)
- Overall state: Sessions 1–8 are merged into `main`; every Session 9 task and
  acceptance criterion is complete on its session branch
- Current branch: `session/09-hardening-public-review`
- Branch base: `main` at `80295ba`, the Session 8 merge
- Verified implementation commit: `ab02b31`

## Completed

- Added content-minimal structured JSON API/worker logs, safe request-ID
  validation/generation, response correlation headers, and correlation IDs on
  durable agent-run, conversation-event, and commerce audit rows.
- Added atomic Redis fixed-window limits for conversation starts/turns,
  approvals, checkout/provider-order creation, and webhooks. Protected routes
  fail closed if Redis is unavailable.
- Bounded API connection/request receipt, PostgreSQL connection/statement/query,
  OpenAI, Razorpay, payment-creation, and graceful-shutdown time. Added recursive
  key/value log redaction tests without logging bodies, prompts, query strings,
  addresses, signatures, or credentials.
- Added migration `0005_operational_hardening.sql` with correlation evidence and
  query indexes. Reviewed row locks, uniqueness constraints, immutable evidence,
  webhook recovery, and cleanup boundaries.
- Found and fixed an inverted payment lock order exposed by repeated concurrent
  integration runs. Checkout-claim and provider-finalization paths now lock the
  checkout row before the payment row; the concurrency suite passes repeatedly.
- Added production dependency, dependency-license, Compose configuration, and
  container-hardening checks to the repository and CI. Upgraded Next.js,
  Fastify, Drizzle, React, Playwright, Sharp, and PostCSS to clear one critical,
  multiple high, and one moderate advisory.
- Reconciled the README and architecture/testing/submission docs with the actual
  implementation. Added Mermaid trust-boundary diagrams, complete API/setup and
  seed instructions, operational behavior, cleanup guidance, evaluation result,
  and explicit limitations. Removed stale BullMQ, SDK, Testcontainers, future
  session, and unimplemented-table claims.

## Verification

Passed on 2026-09-04:

- Two independent `git clone --no-hardlinks` directories installed with
  `corepack pnpm install --frozen-lockfile`; each then passed
  `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm quality`.
- In each clean run: repository hygiene passed for 118 candidate files;
  formatting, lint, strict type checks, 41 unit/contract tests, 27
  PostgreSQL/Redis integration tests, all workspace production builds, the 50/50
  ShopPilot evaluation (baseline 45/50), and six desktop/mobile Playwright runs
  passed.
- `corepack pnpm audit --prod --registry=https://registry.yarnpkg.com` — no known
  vulnerabilities. The primary npm advisory endpoint intermittently returned
  socket time-outs/503; the npm-compatible mirror returned the full audit after
  the patched lockfile was installed.
- `corepack pnpm security:licenses` — installed dependency licenses are within
  the reviewed allow-list: 0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
  CC-BY-4.0, ISC, LGPL-3.0-or-later, MIT, and Python-2.0.
- `corepack pnpm container:check`, resolved `docker compose config`, and running
  image review passed; PostgreSQL 17 Alpine and Redis 7.4 Alpine were healthy,
  without privileged mode, host networking, `latest` tags, or missing health
  checks.
- Working-tree and full-Git-history secret-pattern scans found no live Razorpay,
  OpenAI, GitHub, or private-key material. `git diff --check` passed.
- Payment integration passed twice consecutively after the lock-order fix,
  including concurrent provider-order creation, uncertain-call expiry,
  duplicate/out-of-order webhook recovery, and single-order assertions.

## Blockers

- None.

## Exact next action

Review and merge Session 9. Then create `session/10-submission-video-readiness`
from updated `main` and begin release freeze plus five-minute demo rehearsal.
