# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 1 — repository foundation (complete; awaiting review/merge)
- Overall state: foundation acceptance criteria pass; Session 2 has not started
- Current branch: `session/01-repository-foundation`

## Completed

- Created the pnpm workspace with Next.js web, Fastify API, worker, domain, database, and testkit packages.
- Added strict shared TypeScript, ESLint, Prettier, Vitest, workspace scripts, and a frozen lockfile.
- Added PostgreSQL 17 and Redis 7.4 Compose services with health checks, named volumes, and overrideable host ports. Redis defaults to host port 6380 to avoid a pre-existing local Redis service on 6379.
- Added Zod-validated API, web, worker, model, and Razorpay configuration. Razorpay accepts only `test` mode and `rzp_test_` key IDs.
- Added separate API liveness/readiness, web readiness, worker startup readiness, and typed PostgreSQL/Redis probes.
- Added repository hygiene/secret checks, ignore rules, pnpm caching, and GitHub Actions quality and Gitleaks jobs.
- Added local setup, runtime, readiness, port override, and shutdown instructions to `README.md`.
- Verified a clean-copy install from the candidate file set with the frozen lockfile, repository hygiene check, and strict typecheck.

## Verification

Passed on 2026-09-04:

- `corepack pnpm install --frozen-lockfile`
- `docker compose up -d --wait` — PostgreSQL and Redis healthy
- `corepack pnpm repo:check` — 60 candidate files clean
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck` — all six packages pass
- `corepack pnpm test` — 12 tests in 6 files pass without network access
- `corepack pnpm test:integration` — PostgreSQL and Redis readiness passes
- `corepack pnpm build` — all packages and the production Next.js application pass
- Built API `GET /health` returned `ready` with PostgreSQL and Redis `up`; built web `GET /api/health` returned `ready`; built worker `--health-check` returned `ready`.
- Clean-copy workflow: offline frozen install, repository hygiene, and strict typecheck passed in `/tmp`.

`test:e2e` and `eval` scripts do not exist yet; their roadmap implementations begin in later sessions, so they were not applicable to Session 1.

## Blockers

- None for the completed Session 1.
- Later live test-mode integration will require `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` supplied locally, never committed.
- Runtime AI calls will require an API key supplied locally. The code runs deterministically in fake-model mode by default.

## Exact next action

Review the complete Session 1 diff against `main`. After the user chooses to merge it, create `session/02-catalogue-merchant-surface` from the updated local `main`, update this status to Session 2, and begin the first unchecked Session 2 task in `docs/ROADMAP.md` using the catalogue and discovery boundaries in `docs/ARCHITECTURE.md`.
