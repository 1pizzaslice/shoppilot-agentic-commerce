# Project status

Last updated: 2026-09-05

## Current position

- Active session: Session 14 — autonomous machine-buyer execution
- Overall state: the complete product flow and Razorpay test checkout are
  implemented. The shopper experience now presents StepUp as a focused footwear
  store with ShopPilot as its embedded assistant, while retaining the guarded
  agentic purchase flow, a separate autonomous machine client with durable
  correlated evidence, and secondary guided demo stories. The v2 catalogue now
  contains 95 footwear styles and 10 compatible add-ons. Final local
  verification, video capture, upload, and form submission remain.
- Current branch: `session/14-autonomous-buyer`
- Previous release tag (before Session 11): `shoppilot-submission-v1` at
  `bd0e4f281bada2c44e1ec936adccafe576434e4d`
- Session 10 merge: PR #13 at `5b5517b`

## Completed

- Corrected the autonomous route's desktop composition after the global narrow
  `main` rule constrained it to the left side. The route now fills the viewport,
  keeps the buyer explanation on the left, and places delegation plus live API
  execution in the available right side; mobile continues to stack naturally.
- Added a separate `/ai-buyer` machine-client journey without changing the
  guided shopper flow. One complete instruction, hard cap, optional add-on rule,
  and visible preparation delegation now drive live discovery, grounded search,
  exact-variant validation, versioned cart construction, add-on decision, and
  immutable review without intermediate selection clicks.
- Carried one caller-created correlation ID through every autonomous exchange,
  validated each response with strict shared schemas, and read PostgreSQL-backed
  append-only commerce evidence back before approval and after the single
  provider order. The final read requires both the same correlation ID and a
  durable `provider_order_created` event.
- Preserved the exact frozen-total human approval and Razorpay authentication
  boundaries. The checkout handoff identifies AI preparation without suggesting
  that the buyer can enter payment credentials or bypass deterministic policy.
- Reclassified the previous guided-state drawer as a contract explainer and
  linked it to the separate real execution route, removing the earlier
  overstatement that a projected UI trace proved autonomous buying.
- Added a visible, read-only machine-contract trace that validates StepUp's
  public discovery profile and follows the current shopper journey across
  catalogue search, exact-variant consent, versioned cart preparation, frozen
  approval, deterministic checkout policy, and one Razorpay test order.
- Proxied discovery and OpenAPI through the same web origin, kept the trace
  accessible throughout desktop and mobile shopping, and carried the
  AI-buyer/policy/provider handoff onto the secure checkout page. The surface
  discloses that the protocol is UCP-inspired rather than conformant, exposes no
  secrets, and performs no cart or payment mutation.

- Grounded explicit catalogue colour words deterministically after model
  extraction. A request containing `red` now binds the search to red catalogue
  variants even if the model omits or conflicts with that colour; the decision
  is recorded in the append-only conversation audit.
- Expanded the PostgreSQL seed to 95 footwear styles, evenly covering running,
  walking, training, trail, and casual use across UK sizes 5–12. Six additional
  exact-search colour families and a ₹1,799–₹8,549 price ladder improve result
  coverage without increasing the three-choice UI limit.
- Expanded checkout compatibility from four to 10 accessories. Each footwear
  product still has exactly one deterministic compatible relation, offers are
  budget-checked, and no add-on is inserted without consent.
- Raised the merchant performance contract and query capacity to 200 products,
  added fake-model aliases for all 12 catalogue colours, and added integration
  coverage for counts, balance, colour availability, and add-on distribution.
- Corrected the verified Razorpay receipt so totals, payment state, and order
  reference render in high-contrast white on the dark green ticket.
- Reframed the complete public UI around StepUp Footwear without changing the
  commerce scope, catalogue authority, approval boundary, or test-mode payment
  behavior. The landing page now leads with footwear discovery and activity
  shortcuts; buildathon presets remain available in a secondary disclosure.
- Rebuilt public product pages as responsive catalogue detail experiences with
  canonical imagery, live variants, stock, prices, return policy, ShopPilot
  handoff, product-specific social metadata, and the existing Schema.org data.
- Carried the StepUp/ShopPilot brand relationship through checkout, receipts,
  navigation, and merchant evidence. Added a bespoke, repository-owned social
  preview card and host-derived root metadata.
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
- Rebuilt the merchant view as an operating dashboard backed entirely by
  stored commerce evidence: seven-day activity and funnel charts, category
  demand, deterministic growth-factor insights, best-seller and demand-gap
  states, and a 48-style table with inventory, cart interest, paid units,
  value, and conversion. Empty sales states remain explicit instead of ranking
  arbitrary products.
- Improved shopper catalogue cards with live stock and return-window signals,
  while preserving the three-choice limit, canonical product photography, and
  database-authoritative product facts.
- Clarified the agentic payment boundary in-product. Demo choices now explain
  that they share a catalogue request and differ at the payment outcome, the
  recovery story reaches the Razorpay page as explicit guidance, and the
  pre-payment handoff separates what ShopPilot prepared from what the shopper
  must approve and authenticate. The complete safety trail is linked beside
  that handoff, and clarification screens can return to the populated original
  request instead of trapping the shopper.
- Prevented an optional add-on from being offered when its canonical price
  would exceed the shopper's remaining budget. The final checkout policy still
  revalidates the complete frozen total as an independent second guard.
- Recovered cancelled, failed, and expired Razorpay attempts with an explicit
  no-charge terminal state and a direct route back to a fresh ShopPilot
  journey. Checkout pages now retain a visible return link, and the ShopPilot
  brand returns to a clean home journey.
- Rebuilt the safety drawer as a numbered decision timeline with actor and
  outcome labels, clearer responsibility definitions, and canonical budget and
  approved-total amounts when present. Error messages now sit in journey
  context instead of appearing as unexplained bottom-corner alerts.

## Verification

Passed through 2026-09-05:

- Session 14 responsive follow-up: full strict type checking and the focused
  autonomous Playwright flow passed on desktop and mobile against the running
  live-configured API. The regression verifies full viewport width, above-fold
  desktop controls, one shared correlation ID, and one provider-order request;
  it now accepts both fake-provider completion and the expected Razorpay
  test-mode checkout navigation.
- Session 14 partial verification: formatting, lint, full strict type checking,
  all 46 unit/contract tests, every production build, and the frozen evaluation
  (50/50 ShopPilot versus 43/50 baseline) passed. Before the final server-audit
  readback was added, the separate live autonomous flow passed on both desktop
  and mobile with one shared correlation ID and one payment-order request. The
  final focused browser rerun could not start localhost servers because the
  managed sandbox rejected port binding after its approval credits were
  exhausted. PostgreSQL/Redis integration reruns were blocked by the same
  `EPERM` localhost restriction; they are not reported as passing for Session
  14.
- Session 13 final: the uninterrupted `pnpm quality` pipeline passed repository
  hygiene (123 files), formatting, lint, strict type checks, 46 unit/contract
  tests, 32 PostgreSQL/Redis integration tests, every production build, the
  50/50 evaluation (baseline 43/50), and all 20 desktop/mobile Playwright
  journeys. The first full attempt stopped at README formatting before tests;
  after the mechanical reflow, the clean complete rerun passed. Browser coverage
  verifies initial live discovery, seven-stage progression from the same
  purchase state, same-origin discovery/OpenAPI routes, and the Razorpay
  handoff/callback path.
- Session 13 focused verification: web strict type checking passed. Six focused
  desktop/mobile Playwright runs passed for initial machine discovery, all
  seven trace stages advancing on the real journey state, and the existing
  signed Razorpay callback-to-receipt path with the new checkout handoff. The
  in-app browser runtime had no connected browser instance, so this session's
  rendered interaction evidence comes from Playwright.

- Explicit-colour search follow-up: a live Claude request for red running shoes
  in UK 8 returned only the Signal Red Enduro Run. The final complete
  `pnpm quality` pipeline passed repository hygiene (122 files), formatting,
  lint, strict type checks, 46 unit/contract tests, 32 PostgreSQL/Redis
  integration tests, all production builds, the 50/50 evaluation (baseline
  43/50), and all 18 desktop/mobile Playwright journeys. The first full run
  correctly exposed the new audit event in a fixed-count assertion; the
  assertion now verifies that event by name and the clean rerun passed.
- Session 12 catalogue expansion: the complete `pnpm quality` pipeline passed
  repository hygiene (122 files), formatting, lint, strict type checks, 45
  unit/contract tests, 32 PostgreSQL/Redis integration tests, all production
  builds, the 50/50 evaluation (baseline 43/50), and all 18 desktop/mobile
  Playwright journeys. The integration setup reseeded catalogue v2 with 95
  footwear styles and 10 accessories. A first full pass exposed one legacy
  fake-model `Black` alias assumption; preserving that generic alias restored
  the expected optional-colour fallback, and the focused seven-test regression
  plus the final complete pipeline passed.
- The post-pipeline live review setup loaded the ignored Anthropic and Razorpay
  test configuration. API and web health both returned ready; the merchant
  endpoint reported 95 styles, 10 accessories, 747 live variants, and 19
  styles in each category. Live Claude searches returned grounded in-stock
  Violet Purple trail and Cocoa Brown casual options in the requested UK sizes
  and budgets. The review storefront is running at `http://127.0.0.1:3000`.
- Receipt contrast follow-up: formatting and the focused web strict type check
  passed; the running web and live-configured API health checks returned ready.
- Session 11 storefront pass: the complete `pnpm quality` pipeline passed with
  repository hygiene (122 files), formatting, lint, strict type checks, 44
  unit/contract tests, 30 PostgreSQL/Redis integration tests, all production
  builds, the 50/50 evaluation (baseline 43/50), and all 18 desktop/mobile
  Playwright journeys. A first unconfigured browser attempt lacked the required
  local database variables; the configured sandbox attempt could not bind
  localhost. The permitted run then found the intentionally retained preview
  server on port 3000; after stopping that exact process and updating the
  renamed search labels, the focused four-run regression and final complete
  pipeline passed.
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
- Final live-Claude wording probes caught unsupported comparison copy and raw
  paise/budget formatting in otherwise grounded prose. Claude now receives
  preformatted catalogue-derived rupee strings and may only copy them; its four
  focused adapter tests, API strict type check, API build, formatting, and diff
  checks passed after the last change.
- Merchant intelligence and catalogue UX pass on 2026-09-05: the complete
  `pnpm quality` pipeline passed repository hygiene (121 files), formatting,
  lint, strict type checks, 44 unit/contract tests, 29 PostgreSQL/Redis
  integration tests, all production builds, the 50/50 evaluation (baseline
  43/50), and all 14 desktop/mobile Playwright journeys. The first sandboxed
  integration attempt could not open localhost PostgreSQL/Redis (`EPERM`); the
  permitted localhost run passed. A final web build after the CSS compatibility
  cleanup passed without the earlier Autoprefixer warning. The in-app browser
  had no connected instance, so the automated desktop/mobile coverage remains
  the visual interaction evidence for this pass.
- Payment-boundary UX follow-up on 2026-09-05: the complete `pnpm quality`
  pipeline passed repository hygiene (121 files), formatting, lint, strict type
  checks, 44 unit/contract tests, 29 PostgreSQL/Redis integration tests, all
  production builds, the 50/50 evaluation (baseline 43/50), and all 16
  desktop/mobile Playwright journeys, including the new clarification-back
  regression and both success/recovery stories.
- Final budget/navigation/audit hardening on 2026-09-05: the complete
  `pnpm quality` pipeline passed repository hygiene (121 files), formatting,
  lint, strict type checks, 44 unit/contract tests, 30 PostgreSQL/Redis
  integration tests, all production builds, the 50/50 evaluation (baseline
  43/50), and all 18 desktop/mobile Playwright journeys. An initial sandboxed
  integration run could not open localhost PostgreSQL/Redis (`EPERM`). A later
  browser retry found an orphaned Next.js test server on port 3000; after
  stopping that exact process, the clean complete pipeline passed.
- The final live smoke loaded the ignored local configuration explicitly:
  Claude extracted a walking-shoe, UK-size-7, ₹5,000 intent and explained three
  distinct PostgreSQL-grounded results; API and web readiness passed with the
  Razorpay test provider configured. No in-app browser instance was connected,
  so the 18-run Playwright suite remains the final interactive evidence.

## Blockers

- Session 14 still needs one permitted local run of the PostgreSQL/Redis
  integration suite and the desktop/mobile autonomous-buyer Playwright case.
  The implementation compiled and the earlier 10-exchange flow passed, but the
  new audit-readback assertions have not been exercised after the sandbox
  exhausted approval credits.
- Final video capture and upload require the submitter's recording environment
  and hosting account. Razorpay test credentials are configured locally; the
  callback/API reconciliation now supports an immediate verified localhost
  result without a public webhook, while a reachable webhook is still required
  to demonstrate asynchronous delivery.
- Personal form fields and the irreversible form submission require the
  submitter. The uploaded video URL must then be replayed without sign-in.
- A true shopper-independent payment option is not available through the
  current one-time Razorpay Standard Checkout credentials. Saved cards still
  require shopper authentication, while unattended debits require a separately
  registered mandate/token and a recurring-payment use case plus Razorpay
  account enablement. No fake "agent pays" toggle has been added.

## Exact next action

When localhost permission is available, run
`DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot REDIS_URL=redis://localhost:6380 corepack pnpm quality`. Confirm the autonomous
desktop/mobile case reaches 12 completed exchanges, reads the durable audit
twice under one correlation ID, and creates exactly one payment order. Then run
the page with the ignored live Claude and Razorpay test configuration and record
the autonomous route followed by Razorpay authentication. Use
`docs/SUBMISSION.md`, keep the final cut at five minutes or less, and merge this
stacked session chain only with explicit approval.
