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
- [x] A manual Razorpay test transaction reaches a verified terminal state when credentials are available.
- [x] The deliberately demonstrated failure is a duplicated webhook or a price/stock change, handled without duplicate order or charge.

## Session 6 — merchant growth evidence

- [x] Add a compact merchant-facing demo view for funnel and add-on outcomes.
- [x] Calculate base cart value, accepted add-on value, attach rate, and observed order value using SQL-backed events.
- [x] Create a fixed simulation comparing “no add-on” with the compatibility-based suggestion policy.
- [x] Label simulated results clearly; make no unsupported causal or production-revenue claim.
- [x] Explain why each suggestion is compatible and useful.

Acceptance:

- [x] The dashboard derives every number from stored events.
- [x] The demo can show both a useful accepted add-on and a declined suggestion with no checkout penalty.
- [x] Metric definitions are visible and reproducible.

## Session 7 — adversarial evaluation harness

- [x] Create at least 50 versioned cases: happy path, ambiguous request, no result, stale price, missing stock, malicious catalogue text, over-budget, wrong size, duplicate action, and payment failure.
- [x] Implement deterministic scoring for constraint adherence, catalogue grounding, question count, policy violations, injection blocking, add-on compatibility, and task completion.
- [x] Compare the agent with a simple baseline and publish failures, not only averages.
- [x] Save a machine-readable result artifact and a concise Markdown summary.
- [x] Add regression cases for every material bug found later.

Acceptance targets:

- [x] 100% hard-constraint adherence in the fixed evaluation set.
- [x] 0 unapproved cart mutations or order creations.
- [x] 100% rejection of the repository’s known injection cases at the tool/policy boundary.
- [x] At least 95% catalogue-grounded recommendation fields.
- [x] Median clarification count no greater than 2 for underspecified prompts.
- [x] All failures are listed with case IDs and explanations.

## Session 8 — demo experience and accessibility

- [x] Build a polished responsive shopper journey: prompt, clarification, recommendations, product detail, cart, add-on, approval, payment, receipt.
- [x] Add a human-readable audit drawer showing what the agent proposed, what policy allowed, and what the user approved.
- [x] Build deterministic demo presets for happy path and failure recovery.
- [x] Add loading, empty, error, retry, cancellation, and stale-cart states.
- [x] Meet keyboard navigation, focus, contrast, form-label, and reduced-motion basics.

Acceptance:

- [x] Playwright covers the complete happy path and one recovered failure on desktop and mobile viewports.
- [x] No dead end requires database editing or page refresh.
- [x] A new viewer can understand the product and safety model without narration.

## Session 9 — hardening and public-repository review

- [x] Add structured logs, request/job correlation IDs, rate limits, time-outs, and redaction tests.
- [x] Run dependency, secret, license, and container checks; fix high-confidence issues.
- [x] Review database indexes, migrations, concurrency, failure recovery, and data cleanup.
- [x] Produce an architecture diagram, API overview, setup steps, demo data instructions, limitations, and evaluation results.
- [x] Verify every README claim against the running product.
- [x] Remove dead code, placeholders, local artifacts, unused dependencies, and unnecessary files.

Acceptance:

- [x] A clean clone reaches the fake-provider demo with documented commands.
- [x] Full CI and evaluation suite pass twice from a clean state.
- [x] Secret scan is clean and all sample keys are obviously fake.
- [x] Known limitations and non-goals are honest and current.

## Session 10 — submission and video readiness

- [x] Freeze a tagged release and record exact commit/hash used for the video.
- [x] Run the five-minute demo script without manual repair or hidden setup.
- [x] Capture final evaluation numbers and the failure-recovery evidence.
- [x] Complete public repository, architecture, pitch, and form-field checklists.
- [x] Verify all URLs from a signed-out/private browser where applicable.
- [x] Reconcile successful Standard Checkout callbacks directly with Razorpay
  and route desktop/mobile shoppers to a verified receipt without requiring a
  localhost webhook.
- [x] Replace the unused OpenAI runtime configuration with a typed Claude
  Messages adapter and Anthropic structured output.
- [x] Harden Claude's structured responses against unsupported schema keywords,
  unknown products, duplicate explanations, invented catalogue facts, and
  first-request latency.
- [x] Polish catalogue realism with public product photography, 48 shoe styles,
  in-journey search refinement, and safe alternatives when an optional colour
  has no exact match.
- [x] Correct catalogue merchandising integrity: use one photographed colour
  per style, return value/mid/top price coverage for broad requests, start clean
  replacement searches, show accessory photography, and expose live catalogue
  health on the merchant surface.
- [x] Turn the merchant surface into an evidence-backed operating dashboard
  with seven-day activity, funnel and category charts, growth insights,
  best-seller/demand-gap states, and a complete 48-style performance table;
  surface live stock and return windows on shopper catalogue cards.
- [x] Clarify the human-gated payment boundary in the journey: distinguish the
  success and recovery demo stories, carry the selected story into Razorpay
  guidance, expose the audit trail before payment, and let shoppers return from
  clarification to edit their original request.
- [x] Harden the final commerce UX: constrain optional add-ons to the remaining
  shopper budget, make cancelled/failed/expired Razorpay attempts recoverable,
  restore reliable home navigation, and turn the safety drawer into an
  amount-aware, actor-labelled decision timeline.

Acceptance:

- [ ] The video is five minutes or less and shows working software, not a code tour.
- [x] The repository builds from its public instructions and contains no secret.
- [ ] The submission explicitly shows growth, agentic checkout, bounded/gated money actions, auditability, and graceful failure recovery.

## Session 11 — footwear storefront identity

Supporting product scope: [`docs/PRODUCT.md`](PRODUCT.md).

- [x] Reframe the shopper surface as StepUp Footwear, powered by the ShopPilot
  assistant, without changing the narrow commerce workflow.
- [x] Replace the demo-first landing hierarchy with footwear-specific discovery,
  activity shortcuts, and a secondary guided-story control.
- [x] Carry the store identity through product detail, checkout, receipt, and
  merchant surfaces while keeping Razorpay test mode explicit.
- [x] Turn the machine-readable product route into a credible, responsive
  catalogue detail page without changing canonical product data.
- [x] Add store-specific page metadata and a bespoke social preview asset.
- [x] Update browser coverage for the revised labels and guided-story disclosure.
- [x] Correct verified-receipt value contrast on the dark summary ticket.

Acceptance:

- [x] A first-time viewer understands that StepUp is a footwear store and
  ShopPilot is its shopping assistant before interacting.
- [x] The main journey still exposes no more than three recommendations, one
  consent-only add-on, exact-total approval, test payment, and the audit trail.
- [x] Desktop and mobile browser journeys pass with the revised storefront.
- [x] Formatting, lint, strict types, tests, integration tests, evaluation, and
  production builds pass on the complete branch.

## Session 12 — catalogue breadth and add-on variety

This session branch depends on the unmerged Session 11 storefront commit; it
must not be merged independently. Supporting product scope:
[`docs/PRODUCT.md`](PRODUCT.md).

- [x] Expand the repeatable catalogue from 48 to 95 footwear styles while
  preserving the five bounded recommendation categories.
- [x] Provide 19 styles per category, UK sizes 5–12, 12 photographed colour
  families, and a ₹1,799–₹8,549 price ladder.
- [x] Expand compatible accessories from four to 10 and distribute every one
  across the new footwear relations.
- [x] Keep the original 48 products, prices, and compatibility behavior stable
  so existing demo and commerce evidence remains reproducible.
- [x] Extend deterministic fake-model colour aliases and merchant performance
  capacity for the larger catalogue.
- [x] Add integration coverage for catalogue counts, category balance, exact
  colour availability, and add-on distribution.

Acceptance:

- [x] Each footwear category contains 19 styles and remains fully considered by
  the bounded catalogue query.
- [x] Blue, pink, orange, yellow, purple, and brown exact-colour searches return
  in-stock UK-size variants within the configured price ceiling.
- [x] Every one of the 10 accessories is reachable through a deterministic
  compatibility relation, while checkout still offers at most one.
- [x] Explicit catalogue colour words are deterministically grounded from the
  shopper's latest text before search, so a model omission or conflict cannot
  silently substitute another colour.
- [x] The complete quality pipeline passes and the expanded live catalogue is
  reseeded for review.

## Session 13 — visible machine-contract trace

This session branch depends on the unmerged Session 11 and 12 commits plus the
explicit-colour grounding fix; it must not be merged independently. Supporting
product scope: [`docs/PRODUCT.md`](PRODUCT.md).

- [x] Proxy the public discovery profile and OpenAPI document through the web
  origin so a browser-visible machine client can read the same contracts.
- [x] Add an always-reachable trace for discovery, grounded search,
  exact-variant consent, versioned cart preparation, frozen approval, policy
  authorization, and one Razorpay test order.
- [x] Derive progress from the current typed shopper state and validate the live
  discovery response instead of presenting a parallel scripted checkout.
- [x] Carry a compact AI-buyer, policy, and provider handoff onto the secure
  Razorpay checkout page.
- [x] Keep the trace read-only, redact identifiers, disclose the UCP-inspired
  subset accurately, and preserve every existing human-consent boundary.
- [x] Add desktop and mobile browser coverage for initial discovery, complete
  state progression, same-origin contracts, and the Razorpay handoff.

Acceptance:

- [x] A reviewer can open the trace before or during shopping and understand
  how an external buyer reaches checkout without scraping the storefront.
- [x] The seven stages advance only when the corresponding real shopper state
  exists; the trace itself performs no commerce mutation.
- [x] The checkout surface visibly separates AI preparation, deterministic
  authorization, and shopper-authenticated Razorpay execution.
- [x] The complete quality pipeline passes on the session branch.

## Session 14 — autonomous machine-buyer execution

This session branch depends on the unmerged Sessions 11–13 stack plus the
explicit-colour grounding fix; it must not be merged independently. Supporting
product scope: [`docs/PRODUCT.md`](PRODUCT.md).

- [x] Keep the guided shopper journey and its read-only contract explainer
  separate from a real autonomous machine-client route.
- [x] Accept one complete instruction, hard spending cap, optional add-on rule,
  and explicit preparation delegation before execution.
- [x] Discover the merchant, search, choose and validate one exact variant,
  construct the versioned cart, apply the add-on rule, and freeze review through
  validated public HTTP responses without intermediate product-selection clicks.
- [x] Carry one caller-created correlation ID through every exchange and read
  PostgreSQL-backed append-only cart evidence back before approval and after
  provider-order creation.
- [x] Preserve one exact-total human approval, deterministic checkout policy,
  one server-created Razorpay test order, and secure payment authentication.
- [x] Distinguish the autonomous-buyer handoff on the secure checkout page and
  add desktop/mobile browser coverage for the complete separate flow.
- [x] Use the full desktop viewport for the autonomous route, placing delegation
  and execution beside the buyer explanation while retaining the stacked mobile
  layout.

Acceptance:

- [x] The visible exchanges are emitted only after schema-validated live HTTP
  responses, not projected from pre-filled UI state.
- [x] A complete instruction reaches an exact frozen cart with no intervening
  human product or add-on choice.
- [x] Server audit readback proves the same correlation ID and a durable single
  provider-order event while the payment boundary remains human-controlled.
- [x] Desktop controls begin above the fold instead of inheriting the global
  narrow-page width, and a browser assertion guards the full-width layout.
- [ ] The complete quality pipeline passes on the session branch.
