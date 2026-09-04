# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 3 — grounded shopping conversation (complete; awaiting review/merge)
- Overall state: all Session 3 tasks and acceptance criteria pass; Session 4 has not started
- Current branch: `session/03-grounded-shopping-conversation`

## Completed

- Reconciled the interrupted Session 2 handoff: PR #3 was already merged with all GitHub checks passing, and local `main` was fast-forwarded to `origin/main` at `16c7b48` before this branch was created.
- Added strict shopping-intent, model-output, conversation-response, recommendation, tool-input, and append-only event contracts plus an explicit conversation state machine.
- Added the minimum-question policy: shoe size and use are the only required missing constraints, combined into one question when both are absent; colour remains optional.
- Added strict read-only catalogue search/lookup tools and deterministic hard-filter revalidation, exact variant selection, stable price/ID ranking, a three-choice cap, and explicit fewer/no-results notices.
- Added PostgreSQL persistence for conversations, typed intent documents, messages, agent runs, and append-only model-call, tool-call, and policy-decision evidence.
- Added `POST /v1/conversations` and `POST /v1/conversations/:conversationId/messages` with request/response validation and OpenAPI descriptions.
- Added a deterministic fake model as the no-key local/test default and a server-only OpenAI Responses adapter with strict structured outputs, bounded requests, `store: false`, and validated external responses.
- Added offline unit, contract, recorded-conversation, and PostgreSQL integration coverage for question count, state transitions, malformed tools/model output, grounding, result limits, no results, persistence, and audit evidence.
- Documented conversation endpoints, fake/OpenAI modes, and the durable orchestration boundary in `README.md` and `docs/ARCHITECTURE.md`.

## Verification

Passed on 2026-09-04:

- `corepack pnpm install --offline`
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:migrate`
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:seed`
- `corepack pnpm repo:check` — 80 candidate files clean
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck` — root sources and all six packages pass strict TypeScript
- `corepack pnpm test` — 28 tests in 11 files pass without network access
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm test:integration` — nine PostgreSQL/Redis tests pass
- `corepack pnpm build` — shared packages, API, worker, and the production Next.js application pass
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm quality` — the complete applicable gate passes
- Built API smoke test in fake-model mode: the required prompt asked one compact size question; the continued turn returned three canonical in-stock UK-size-8 running variants below ₹4,000 with exact prices and constraints.

`test:e2e` and `eval` scripts do not exist yet; their roadmap implementations begin in Sessions 8 and 7 respectively, so they are not applicable to Session 3.

## Blockers

- None for Session 3.
- A live OpenAI smoke call was intentionally not run because no user-supplied `OPENAI_API_KEY` is required for acceptance; the adapter is covered with a validated HTTP fake.
- Later live test-mode payment integration will require `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` supplied locally, never committed.

## Exact next action

Review the complete Session 3 diff against `main`. After the user chooses to merge it, create `session/04-cart-policy-approval` from the updated local `main` and begin the first unchecked Session 4 task in `docs/ROADMAP.md` using the state and authority boundaries in `docs/ARCHITECTURE.md`.
