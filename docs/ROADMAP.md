# Delivery roadmap

Sessions are outcome-sized, not calendar days. Complete them in order unless a task is explicitly blocked. Each session uses its own `session/NN-short-name` branch and ends with passing acceptance checks plus a `docs/STATUS.md` handoff. Merge decisions remain with the user.

## Session 0 — product and execution design

- [x] Define the product promise, primary journey, growth journey, and non-goals.
- [x] Choose a TypeScript architecture and ownership boundaries.
- [x] Define money-safety, approval, audit, and prompt-injection rules.
- [x] Define automated tests, agent evaluations, and submission evidence.
- [x] Create persistent repository instructions and project status.

Acceptance:

- [x] Every planned feature maps to the official Track 1 bar.
- [x] Future sessions have measurable tasks and completion conditions.
- [x] A fresh Codex session can locate the next action without conversation history.

## Session 1 — repository foundation

- [x] Initialize pnpm workspaces for `apps/web`, `apps/api`, `apps/worker`, `packages/domain`, `packages/db`, and `packages/testkit`.
- [x] Configure strict TypeScript, formatting, linting, Vitest, and shared scripts.
- [x] Add Docker Compose for PostgreSQL and Redis with health checks and named volumes.
- [x] Add typed environment validation and `.env.example`; test mode must be the only supported Razorpay mode.
- [x] Add API, web, worker, database, and Redis health checks.
- [x] Add `.gitignore`, secret scanning, dependency caching, and GitHub Actions quality gates.
- [x] Add minimal local setup instructions and verify a clean clone workflow.

Acceptance:

- [x] `docker compose up -d` makes PostgreSQL and Redis healthy.
- [x] `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [x] Web and API health endpoints respond; worker reports readiness.
- [x] The tracked file list contains no secret, generated output, or machine-specific file.

## Session 2 — catalogue and merchant surface

- [x] Model merchants, products, variants, inventory, compatibility, and catalogue versions in PostgreSQL.
- [x] Seed one fictional shoe merchant with 30–50 products and useful variants/add-ons.
- [x] Implement typed catalogue search and product lookup with hard filters for budget, size, type, stock, and optional colour.
- [x] Publish a standards-inspired discovery document at `/.well-known/ucp` and documented catalogue endpoints; label the implementation as a subset, not UCP-conformant.
- [x] Add Schema.org `Product`/`Offer` JSON-LD to product pages.
- [x] Generate an OpenAPI document and validate responses against schemas.

Acceptance:

- [x] An HTTP client can discover capabilities, search shoes under ₹4,000, and retrieve exact variants without UI scraping.
- [x] Price, stock, size, colour, return policy, and compatible add-ons are machine-readable.
- [x] Contract and integration tests cover invalid products, out-of-stock variants, pagination, and injection-like descriptions.

## Session 3 — grounded shopping conversation

- [x] Implement conversation/session persistence and a typed shopping-intent schema.
- [x] Implement the minimum-question policy: ask only for missing hard constraints; combine questions where possible.
- [x] Add agent tools for catalogue search and lookup with strict Zod inputs and read-only permissions.
- [x] Implement deterministic candidate filtering and scoring; use the model only to extract intent and explain results.
- [x] Present at most three recommendations with price, fit, trade-off, and the exact constraints matched.
- [x] Add deterministic fake-model mode for tests and local demonstrations without an API key.

Acceptance:

- [x] “Running shoes under ₹4,000” asks for size and at most one compact preference question.
- [x] Every recommendation exists in the database and satisfies hard constraints.
- [x] The agent admits when fewer than three or no valid products exist.
- [x] Unit, integration, and recorded-conversation tests pass without network access.

## Session 4 — cart, upsell, policy gate, and approval

- [x] Implement cart and checkout state machines with optimistic concurrency.
- [x] Add a deterministic compatibility-based add-on selector; the model may explain but not select unavailable/incompatible products.
- [x] Show one optional add-on and measure accepted/declined/skipped outcomes.
- [x] Implement immutable cart snapshots and a final approval record bound to user, cart hash, total, and expiry.
- [x] Implement the policy gate for budget, stock, price, quantity, approval freshness, duplicate execution, and cart mutation.
- [x] Add an append-only audit timeline with safe redaction.

Acceptance:

- [x] No add-on is added without explicit consent.
- [x] Any post-approval cart change invalidates approval.
- [x] The API cannot create an external order without a valid policy decision and approval.
- [x] Concurrent approvals cannot create duplicate checkout attempts.

## Session 5 — Razorpay test-mode checkout

- [x] Implement a Razorpay adapter and a fake payment adapter behind the same interface.
- [x] Create one server-side Razorpay Order from the approved immutable cart.
- [x] Open Razorpay Standard Checkout from the browser without exposing the key secret.
- [x] Verify checkout signatures server-side.
- [x] Verify webhook signatures from the raw request body; deduplicate by Razorpay event ID and tolerate out-of-order delivery.
- [x] Reconcile checkout callbacks with webhooks and expose clear pending, paid, failed, expired, and cancelled states.
- [x] Add retry/time-out behavior that never silently creates another order.

Acceptance:

- [x] Fake-provider end-to-end tests cover success, decline, cancellation, time-out, duplicate webhook, and out-of-order webhook.
- [ ] A manual Razorpay test transaction reaches a verified terminal state when credentials are available. (Blocked: no Razorpay test credentials or configured webhook are available in this environment.)
- [x] The deliberately demonstrated failure is a duplicated webhook or a price/stock change, handled without duplicate order or charge.

## Session 6 — merchant growth evidence

- [ ] Add a compact merchant-facing demo view for funnel and add-on outcomes.
- [ ] Calculate base cart value, accepted add-on value, attach rate, and observed order value using SQL-backed events.
- [ ] Create a fixed simulation comparing “no add-on” with the compatibility-based suggestion policy.
- [ ] Label simulated results clearly; make no unsupported causal or production-revenue claim.
- [ ] Explain why each suggestion is compatible and useful.

Acceptance:

- [ ] The dashboard derives every number from stored events.
- [ ] The demo can show both a useful accepted add-on and a declined suggestion with no checkout penalty.
- [ ] Metric definitions are visible and reproducible.

## Session 7 — adversarial evaluation harness

- [ ] Create at least 50 versioned cases: happy path, ambiguous request, no result, stale price, missing stock, malicious catalogue text, over-budget, wrong size, duplicate action, and payment failure.
- [ ] Implement deterministic scoring for constraint adherence, catalogue grounding, question count, policy violations, injection blocking, add-on compatibility, and task completion.
- [ ] Compare the agent with a simple baseline and publish failures, not only averages.
- [ ] Save a machine-readable result artifact and a concise Markdown summary.
- [ ] Add regression cases for every material bug found later.

Acceptance targets:

- [ ] 100% hard-constraint adherence in the fixed evaluation set.
- [ ] 0 unapproved cart mutations or order creations.
- [ ] 100% rejection of the repository’s known injection cases at the tool/policy boundary.
- [ ] At least 95% catalogue-grounded recommendation fields.
- [ ] Median clarification count no greater than 2 for underspecified prompts.
- [ ] All failures are listed with case IDs and explanations.

## Session 8 — demo experience and accessibility

- [ ] Build a polished responsive shopper journey: prompt, clarification, recommendations, product detail, cart, add-on, approval, payment, receipt.
- [ ] Add a human-readable audit drawer showing what the agent proposed, what policy allowed, and what the user approved.
- [ ] Build deterministic demo presets for happy path and failure recovery.
- [ ] Add loading, empty, error, retry, cancellation, and stale-cart states.
- [ ] Meet keyboard navigation, focus, contrast, form-label, and reduced-motion basics.

Acceptance:

- [ ] Playwright covers the complete happy path and one recovered failure on desktop and mobile viewports.
- [ ] No dead end requires database editing or page refresh.
- [ ] A new viewer can understand the product and safety model without narration.

## Session 9 — hardening and public-repository review

- [ ] Add structured logs, request/job correlation IDs, rate limits, time-outs, and redaction tests.
- [ ] Run dependency, secret, license, and container checks; fix high-confidence issues.
- [ ] Review database indexes, migrations, concurrency, failure recovery, and data cleanup.
- [ ] Produce an architecture diagram, API overview, setup steps, demo data instructions, limitations, and evaluation results.
- [ ] Verify every README claim against the running product.
- [ ] Remove dead code, placeholders, local artifacts, unused dependencies, and unnecessary files.

Acceptance:

- [ ] A clean clone reaches the fake-provider demo with documented commands.
- [ ] Full CI and evaluation suite pass twice from a clean state.
- [ ] Secret scan is clean and all sample keys are obviously fake.
- [ ] Known limitations and non-goals are honest and current.

## Session 10 — submission and video readiness

- [ ] Freeze a tagged release and record exact commit/hash used for the video.
- [ ] Run the five-minute demo script without manual repair or hidden setup.
- [ ] Capture final evaluation numbers and the failure-recovery evidence.
- [ ] Complete public repository, architecture, pitch, and form-field checklists.
- [ ] Verify all URLs from a signed-out/private browser where applicable.

Acceptance:

- [ ] The video is five minutes or less and shows working software, not a code tour.
- [ ] The repository builds from its public instructions and contains no secret.
- [ ] The submission explicitly shows growth, agentic checkout, bounded/gated money actions, auditability, and graceful failure recovery.
