# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 7 — adversarial evaluation harness (complete; awaiting review/merge)
- Overall state: every Session 7 task and acceptance target passes; Session 8 has not started
- Current branch: `session/07-adversarial-evaluation`
- Branch base: synced `main` at `48bff9e`, after Session 5 PR #7 and Session 6 PR #8 were merged in dependency order

## Completed

- Added 50 strict, versioned JSONL cases using the exact category mix in `docs/TESTING.md`: 10 happy paths, 10 ambiguous requests, 8 no-result/stale-catalogue cases, 10 malicious cases, 7 commerce attacks, and 5 payment failures.
- Added a frozen `eval-catalogue-v1` catalogue and a deterministic evaluation model so normal CI never needs a paid model call, network access, or a Razorpay account.
- Exercised production conversation orchestration, deterministic ranking, catalogue-grounded recommendation fields, strict tool schemas, commerce gates, add-on compatibility, duplicate protection, and payment state transitions.
- Added deterministic scoring for hard constraints, grounded fields, unauthorized actions, injection containment, add-on compatibility, duplicate safety, task completion, and clarification count.
- Compared ShopPilot with the documented fixed-keyword baseline using the same catalogue and commerce boundaries.
- Published every result to `eval/results/latest.json` and a concise summary to `eval/SUMMARY.md`; both ShopPilot and baseline failures are listed by stable case ID with explanations.
- Added a root `eval` command that validates the dataset, regenerates both artifacts, and exits non-zero if a release threshold fails.
- Documented the durable offline evaluation architecture and the rule that each later material boundary bug receives a versioned regression case.

## Evaluation result

- ShopPilot: 50/50 cases passed; 100% task completion, hard-constraint adherence, grounded-field accuracy, known-injection containment, add-on compatibility, and duplicate safety; 0 unauthorized actions; median and p95 clarification count both 1.
- Fixed-keyword baseline: 45/50 cases passed and 90% task completion. Cases `v1-ambiguous-04` through `v1-ambiguous-08` failed because fixed keywords did not interpret jogging, gym, hiking, commute, or weekend synonyms.
- All Session 7 release thresholds pass. The result is explicitly an offline deterministic evaluation of ShopPilot orchestration and boundaries, not a live-model quality claim.

## Verification

Passed on 2026-09-04:

- `corepack pnpm install --no-frozen-lockfile` — lockfile updated for the new workspace; no packages downloaded
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm quality` — the complete repository gate passed in one run
- `corepack pnpm repo:check` — 109 candidate files clean
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck` — root sources and all seven workspace projects pass strict TypeScript
- `corepack pnpm test` — 36 tests in 14 files pass without network access
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm test:integration` — 26 PostgreSQL/Redis tests in six files pass
- `corepack pnpm eval` — 50/50 ShopPilot cases and every threshold pass; baseline passes 45/50
- `corepack pnpm build` — shared packages, evaluation runner, API, worker, and production Next.js application pass
- `git diff --check`

`test:e2e` does not exist yet; its roadmap implementation begins in Session 8, so it is not applicable to Session 7.

## Blockers

- None for Session 7.

## Exact next action

Review and merge `session/07-adversarial-evaluation`. Then create `session/08-demo-experience-accessibility` from updated `main` and build the complete shopper journey and Playwright coverage.
