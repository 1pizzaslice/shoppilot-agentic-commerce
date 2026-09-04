# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 10 — submission and video readiness
- Overall state: the complete product flow and Razorpay test checkout are
  implemented; live model language awaits a local OpenAI API key, while final
  video capture, upload, and form submission require submitter account actions
- Current branch: `session/10-submission-video-readiness`
- Release tag: `shoppilot-submission-v1` at
  `bd0e4f281bada2c44e1ec936adccafe576434e4d`
- Session 9 merge: PR #11 at `fe97407`; follow-up status merge at `e44f057`

## Completed

- Added `pnpm demo:rehearse`, a self-contained release rehearsal for the
  documented local PostgreSQL/Redis ports. Fresh desktop and mobile contexts
  exercise the live API and web app through declined-payment recovery, assert
  one provider order, open the audit and merchant views, verify discovery, and
  enforce a 4:45 ceiling.
- Expanded the submission plan into executable reset/rehearsal instructions,
  frozen metrics, failure evidence, and public-repository, architecture, pitch,
  form-field, and URL checklists.
- Rechecked the public Buildathon page and application form. The requirements
  remain a public repository, architecture, and five-minute pitch; Track 1
  still requires test-mode commerce, bounded/gated money actions, an audit
  trail, and one graceful failure.
- Verified the public repository, Buildathon page, application form, Schema.org
  Product page, and UCP repository without credentials. The form asks for
  identity/college details, Track 1, project title/objectives, repository URL,
  five-minute video URL, and build challenges.
- Froze the 50/50 ShopPilot evaluation (baseline 45/50) and documented the
  visible one-order decline/recovery story plus duplicate/out-of-order webhook
  integration evidence.
- Published the session branch and annotated `shoppilot-submission-v1` tag to
  the public GitHub repository without merging `main`.
- Replaced the localhost Razorpay `payment_pending` dead end with server-side
  provider reconciliation. A signed Standard Checkout callback now fetches the
  Razorpay payment, verifies its provider order, amount, currency, and captured
  status, and routes to a polished verified receipt. Pending checkout/receipt
  reads retry safely, while signed webhooks remain the asynchronous fallback.
- Added focused adapter and PostgreSQL integration coverage plus desktop/mobile
  browser coverage for the callback-to-receipt route. Reduced Playwright worker
  contention so the live rehearsal and new dynamic route run reliably together.

## Verification

Passed on 2026-09-04:

- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm quality`
  — repository hygiene (118 files), formatting, lint, strict type checks, 41
  unit/contract tests, 27 PostgreSQL/Redis integration tests, all builds, 50/50
  evaluation (baseline 45/50), and six desktop/mobile Playwright runs.
- `corepack pnpm demo:rehearse` — two live desktop/mobile release rehearsals
  passed in 20.1 seconds. The credential-free path explicitly uses fake model
  and payment adapters.
- `corepack pnpm security:check` — no known production dependency
  vulnerabilities; reviewed license allow-list passed. The first sandboxed npm
  request failed DNS resolution; the approved network retry passed.
- `corepack pnpm container:check` — resolved Compose and hardening checks passed.
- Public URL checks, including the published release tag and branch handoff,
  returned HTTP 200; fresh isolated Playwright contexts verified shopper,
  merchant, and discovery surfaces. The in-app browser had no connected
  instance, so it could not provide an additional interactive pass.
- `git diff --check` and release-candidate secret-pattern scan passed.
- Follow-up payment hardening on 2026-09-04: formatting, lint, strict type
  checks, 41 unit/contract tests, 28 PostgreSQL/Redis integration tests, all
  builds, and 50/50 evaluation passed. The focused Razorpay success regression
  passed twice, then the full eight-run desktop/mobile Playwright suite passed.

## Blockers

- Real model inference is not active because `OPENAI_API_KEY` is absent and
  `MODEL_PROVIDER=fake` remains configured. The submitter must add the key to
  the ignored local `.env` and set `MODEL_PROVIDER=openai`; catalogue facts and
  money authorization intentionally remain deterministic PostgreSQL/policy
  decisions rather than model-authored values.
- Final video capture and upload require the submitter's recording environment
  and hosting account. Razorpay test credentials are configured locally; the
  callback/API reconciliation now supports an immediate verified localhost
  result without a public webhook, while a reachable webhook is still required
  to demonstrate asynchronous delivery.
- Personal form fields and the irreversible form submission require the
  submitter. The uploaded video URL must then be replayed without sign-in.

## Exact next action

Add `OPENAI_API_KEY` to the ignored local `.env`, set
`MODEL_PROVIDER=openai`, and rerun the browser flow with the already configured
Razorpay test credentials. Then record from the updated session branch using
`docs/SUBMISSION.md`, keep the final cut at five minutes or less, upload it with
public/viewer access, verify the link signed out, fill the personal fields, and
submit the form. Check the two remaining Session 10 acceptance boxes and merge
only with explicit approval.
