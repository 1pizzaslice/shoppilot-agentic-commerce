# Project status

Last updated: 2026-09-05

## Current position

- Active session: Session 10 — submission and video readiness
- Overall state: the complete product flow and Razorpay test checkout are
  implemented; live Claude inference and Razorpay test mode are configured,
  while final video capture, upload, and form submission require submitter
  account actions
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
- Froze the 50/50 ShopPilot evaluation (baseline 43/50) and documented the
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
- Replaced the unused OpenAI runtime with a direct Anthropic Messages adapter.
  Claude responses use JSON-schema structured output, are validated again with
  Zod, and remain limited to intent extraction and grounded recommendation
  explanations. Claude Haiku 4.5 is the default low-latency model.
- Removed JSON Schema constraints that Anthropic does not accept while keeping
  the original Zod validation after every response. Extended the API request
  ceiling beyond the bounded Claude call so first-use schema compilation cannot
  close the shopper connection prematurely.
- Expanded the demo catalogue to 48 shoe styles plus four accessories, with
  five colours, UK sizes 5–12, and validated public product photography stored
  as canonical catalogue data.
- Replaced the no-match dead end with an in-journey refinement form. Optional
  colour matching accepts partial shade names; if a colour is unavailable, one
  audited fallback search shows alternatives while preserving use, size,
  budget, and stock. Recommendation screens can also be refined in place.
- Reworded the approved-cart handoff as secure payment, disabled the Next.js
  development badge, improved product cards/detail imagery, and stopped
  expired receipt links from polling after a confirmed not-found response.
- Corrected recommendation variety after tracing the repeated-three result to
  price-only ranking. Hard-valid candidates now expose stable value, mid-range,
  and top-range price points, while replacement searches start a fresh
  conversation so omitted preferences cannot leak from the prior request.
  Claude's explanation contract now forbids unsupported cross-product
  comparisons and limits prose to the supplied price, stock, size, colour,
  product type, return window, and shopper constraints.
- Made catalogue presentation internally consistent: 48 footwear styles each
  have one photographed colour and UK 5–12 inventory, every accessory offer
  carries a canonical product photo, active filters and exact-versus-alternative
  headings are visible, and no-result/refinement actions remain in journey.
- Expanded the merchant surface with PostgreSQL-derived catalogue health,
  category coverage, ₹2,499–₹6,999 range, stock states, and representative live
  product cards alongside the existing growth and consent evidence.

## Verification

Passed through 2026-09-05:

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
- Claude-provider migration on 2026-09-04: repository hygiene, formatting,
  lint, strict type checks, 42 unit/contract tests, 28 PostgreSQL/Redis
  integration tests, all builds, and 50/50 evaluation passed. The first E2E
  attempt reused a development server while `next build` replaced its output;
  after stopping that stale process, all eight clean desktop/mobile Playwright
  runs passed.
- Final Claude hardening on 2026-09-04: the complete `pnpm quality` pipeline
  passed with repository hygiene (120 files), formatting, lint, strict type
  checks, 43 unit/contract tests, 28 PostgreSQL/Redis integration tests, all
  builds, the 50/50 evaluation (baseline 45/50), and all eight desktop/mobile
  Playwright runs. The callback-to-receipt regression also passed six repeated
  runs before the final suite.
- Live Anthropic smoke testing used the configured ignored local key. Claude
  correctly extracted a running-shoe, ₹4,000, UK-size-8 intent; ShopPilot then
  queried PostgreSQL and returned three live in-stock products with
  Claude-written explanations. Unsupported schema constraints were removed
  before the request and the original Zod schemas were enforced afterward.
- Live Claude catalogue smoke testing on 2026-09-04 returned three Cloud Grey,
  UK-size-8 products under ₹5,000 with HTTPS images. A purple-colour request
  disclosed that no exact shade existed and returned three alternatives while
  retaining use, size, budget, and stock. The focused unit/integration tests and
  all ten desktop/mobile Playwright journeys passed before the final suite.
- The refreshed offline evaluation passes 50/50 ShopPilot cases versus 43/50
  for the fixed-keyword baseline. Optional colour remains a preference: the
  evaluator still enforces product type, UK size, budget, stock, and catalogue
  grounding as hard constraints.
- Final catalogue and journey polish on 2026-09-04: the complete `pnpm quality`
  pipeline passed with repository hygiene (121 files), formatting, lint,
  strict type checks, 44 unit/contract tests, 28 PostgreSQL/Redis integration
  tests, all builds, the 50/50 evaluation (baseline 43/50), and all 12
  desktop/mobile Playwright journeys. An initial sandboxed run could not open
  localhost PostgreSQL/Redis (`EPERM`); the permitted localhost run exposed one
  newly out-of-stock test fixture, which was corrected and then passed both in
  isolation and in the final complete suite.
- Catalogue integrity follow-up on 2026-09-05: the final uninterrupted
  `pnpm quality` pipeline passed repository hygiene (121 files), formatting,
  lint, strict type checks, 44 unit/contract tests, 29 PostgreSQL/Redis
  integration tests, all production builds, the 50/50 evaluation (baseline
  43/50), and all 14 desktop/mobile Playwright journeys. The first browser run
  exposed stale test labels and an over-specific socks assertion; after updating
  them to the shipped accessible names and any compatible add-on image, the full
  browser suite and then the complete pipeline passed.
- A final live-Claude wording probe caught raw paise formatting in otherwise
  grounded prose. The prompt now requires natural rupee notation; its four
  focused adapter tests, API strict type check, API build, formatting, and diff
  checks passed after the last change.

## Blockers

- Final video capture and upload require the submitter's recording environment
  and hosting account. Razorpay test credentials are configured locally; the
  callback/API reconciliation now supports an immediate verified localhost
  result without a public webhook, while a reachable webhook is still required
  to demonstrate asynchronous delivery.
- Personal form fields and the irreversible form submission require the
  submitter. The uploaded video URL must then be replayed without sign-in.

## Exact next action

Rerun the browser flow with live Claude and the configured Razorpay test
credentials. Then record from the updated session branch using
`docs/SUBMISSION.md`, keep the final cut at five minutes or less, upload it with
public/viewer access, verify the link signed out, fill the personal fields, and
submit the form. Check the two remaining Session 10 acceptance boxes and merge
only with explicit approval.
