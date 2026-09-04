# Submission and demo plan

## What the public repository must prove

- The merchant is machine-discoverable and has a structured catalogue.
- The agent asks little, stays grounded, and completes the shopping workflow.
- The add-on is relevant, optional, and measurable.
- Money actions are bounded, gated, explained, and audited.
- Razorpay test mode is genuinely integrated.
- One meaningful failure is handled safely.
- Results come from a repeatable evaluation, including failures.

## Repository deliverables

- Concise README with problem, demo, architecture, setup, tests, results, limitations, and links
- Public source code and reproducible seed data
- `.env.example` containing names and safe examples only
- Architecture and trust-boundary diagram
- Generated OpenAPI contract and machine-readable catalogue examples
- Database migrations and deterministic seeds
- Unit, integration, contract, end-to-end, and evaluation suites
- Frozen evaluation result JSON plus human-readable summary
- Screenshots or short GIF only if they help reviewers before running the app
- License and third-party attribution where required

Do not publish credentials, raw traces, real personal/payment data, dependency caches, generated builds, local database volumes, editor state, abandoned experiments, or duplicate planning documents.

## Five-minute video outline

### 0:00–0:30 — problem and promise

“Online stores are designed for humans to browse. ShopPilot makes a merchant discoverable and transactable by an AI buyer while keeping the shopper in control of every rupee.”

Show the one-screen product promise and the two outcomes: faster buying and useful add-on revenue.

### 0:30–1:50 — live shopper journey

- Prompt: “Find running shoes under ₹4,000.”
- Answer the compact size/colour question.
- Show three grounded choices and select one.
- Accept or decline the single cleaning-kit suggestion.
- Show the exact frozen cart and approve it.
- Open and complete Razorpay test checkout.

### 1:50–2:35 — merchant and machine-readable view

- Open discovery and catalogue response briefly.
- Explain that canonical price, stock, variants, and compatibility come from the merchant API, not the model.
- Show the small merchant-growth panel and clearly labelled simulated evidence.

### 2:35–3:30 — safety architecture

Use one diagram and one line:

> The model proposes; deterministic policy authorizes; the shopper approves; Razorpay executes.

Show the approval-bound cart and readable audit timeline. Avoid scrolling through code.

### 3:30–4:15 — failure recovery

Replay a duplicate Razorpay webhook or trigger a post-approval stock/price change. Show safe rejection/no-op, no duplicate order, and the matching audit event.

### 4:15–4:50 — evaluation

Show frozen results for hard constraints, grounding, question count, injection containment, unauthorized actions, compatibility, and duplicate safety. Include at least one failed case if any remains.

### 4:50–5:00 — close

“This is a narrow MVP, but the contracts, policy boundary, tests, and audit evidence make it a credible foundation for agentic commerce on Razorpay.”

## Demo reliability checklist

- [x] Use the frozen release tag and the repeatable migration/seed commands below.
- [x] Preflight web, API, worker, PostgreSQL, Redis, model, and payment behavior through the quality and rehearsal commands.
- [x] Keep fake-model fallback ready and disclose its use.
- [x] Use the deterministic `Decline & recover` preset for the selected failure.
- [x] Use test payment data only and keep credentials out of the recording.
- [ ] Record at 1080p with browser zoom and text large enough to read.
- [ ] Disable notifications and unrelated tabs.
- [x] Rehearse to under 4:45 to leave editing margin.
- [x] Keep the local fake-provider recording path available; do not depend on an untested deployment.

### Clean rehearsal commands

The volume reset is intentionally explicit because it irreversibly removes only
this Compose project's local demo data. It is not required between takes.

```bash
docker compose down --volumes
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm demo:rehearse
```

`pnpm demo:rehearse` starts the web and API processes itself and uses the
documented local PostgreSQL and Redis URLs. It opens fresh desktop and mobile
browser contexts, runs the live `Decline & recover` journey, proves that the
retry uses one provider order, opens the audit explanation and merchant view,
checks capability discovery, and fails if the automated story exceeds 4:45.

Release rehearsal on 2026-09-04: **PASS**, two browser projects in 20.1 seconds.
This credential-free rehearsal uses the fake model and fake payment adapter and
must be described that way. A final Razorpay Standard Checkout take requires the
submitter's test credentials and reachable test webhook.

## Frozen release evidence

- Release tag: `shoppilot-submission-v1`
- Tagged commit: `bd0e4f281bada2c44e1ec936adccafe576434e4d`
- Source branch: `session/10-submission-video-readiness`
- Payment mode: test only; fake adapter for the reproducible rehearsal
- Dataset: `eval/v1/cases.jsonl`, 50 reviewed cases
- Evaluation catalogue: `eval-catalogue-v1`
- Evaluation timestamp: fixed at `2026-09-04T00:00:00.000Z`

Resolve and verify the frozen source before recording:

```bash
git rev-list -n 1 shoppilot-submission-v1
git status --short
pnpm quality
pnpm security:check
pnpm container:check
pnpm demo:rehearse
```

### Final measured evidence

| Metric | ShopPilot | Fixed-keyword baseline |
| --- | ---: | ---: |
| Cases passed | 50/50 | 45/50 |
| Task completion | 100% | 90% |
| Hard-constraint adherence | 100% | 100% |
| Catalogue-grounded fields | 100% | 100% |
| Unauthorized actions | 0 | 0 |
| Known injection containment | 100% | 100% |
| Compatible add-ons | 100% | 100% |
| Duplicate safety | 100% | 100% |
| Median clarifications | 1 | 1 |

ShopPilot has no failing case in the frozen set. The baseline's five disclosed
failures are `v1-ambiguous-04` through `v1-ambiguous-08`. The visible recovery
evidence is the `Decline & recover` preset: the first signed fake-provider event
sets the payment to failed, retrying settles the same provider order as paid,
and the audit drawer explains the allowed policy decision. Payment integration
tests separately replay duplicate and out-of-order signed webhook events and
assert one provider order and a forward-safe terminal state.

## Final public-repository audit

- [x] Two no-hardlink clean clones passed the documented install and quality flow in Session 9.
- [x] Documented local commands and repository links were checked.
- [x] Full quality and evaluation run on the release candidate.
- [x] Repository and Git-history secret scans are clean; recording remains the submitter's final check.
- [x] README claims match measured evidence.
- [x] The project says “production-shaped MVP,” not “production ready.”
- [x] Discovery explicitly reports `ucpConformance: false`; no ACP/AP2/UCP conformance is claimed.
- [x] Test mode is visible in the shopper, checkout, receipt, README, and form copy.
- [x] Known limitations are specific and current.

## Submission checklist

### Public repository

- [x] Public URL: <https://github.com/1pizzaslice/shoppilot-agentic-commerce>
- [x] README covers promise, architecture, setup, API, evaluation, safety, and limitations.
- [x] Deterministic catalogue seed, migrations, OpenAPI, tests, and frozen evaluation artifacts are tracked.
- [x] Repository license and reviewed third-party license check are present.
- [x] No generated build output, credentials, local database state, or recordings are tracked.

### Architecture

- [x] README contains the one-screen system flow.
- [x] `docs/ARCHITECTURE.md` contains trust boundaries, state ownership, threats, and payment evidence flow.
- [x] Narration uses one sentence: “The model proposes; deterministic policy authorizes; the shopper approves; Razorpay executes.”
- [x] The architecture explains PostgreSQL catalogue truth, integer-paise money, immutable approval, server-side order creation, and append-only audit evidence.

### Pitch

- [x] Open with the shopper problem and the two outcomes: faster purchase and consented add-on evidence.
- [x] Show working software rather than source code.
- [x] Show machine discovery, no more than three grounded choices, one optional add-on, exact approval, and test-mode payment.
- [x] Show merchant evidence without a causal revenue claim.
- [x] Show the readable audit trail and one-order declined-payment recovery.
- [x] Show the frozen 50/50 evaluation and five baseline failures.
- [ ] Record and trim the final video to five minutes or less.
- [ ] Upload the video to a link viewable without sign-in and replay it once while signed out.

### Current form fields

Verified against the public application form on 2026-09-04:

- [ ] Submitter identity: email, full name, college name, graduation year, preferred internship duration.
- [x] Selected track: `Track 1: AI Growth & Agentic Commerce`.
- [x] Project title: `ShopPilot — Safe Agentic Checkout for AI-Readable Merchants`.
- [x] Project objectives: use the draft below.
- [x] GitHub repository URL: <https://github.com/1pizzaslice/shoppilot-agentic-commerce>.
- [ ] Five-minute pitch video link: add the final public/viewable URL.
- [x] Build challenges and technical obstacles: use the recovery draft below.

### URL audit

Checked without repository credentials on 2026-09-04:

| URL | Result |
| --- | --- |
| Public ShopPilot repository | HTTP 200 |
| Razorpay AI Buildathon page | HTTP 200; public repo, architecture, five-minute pitch, Track 1 bar unchanged |
| Razorpay application form | HTTP 200 after Google Forms redirect; fields above confirmed |
| Schema.org Product | HTTP 200 |
| Universal Commerce Protocol repository | HTTP 200 |
| Local shopper, merchant, API discovery | Fresh desktop and mobile Playwright contexts passed |

The in-app browser connection was unavailable during the release audit. Fresh
isolated Playwright browser contexts verified the local UI; credential-free HTTP
requests verified public URLs. The final uploaded video URL cannot be checked
until the submitter records and uploads it.

## Form-ready summary draft

### Project name

ShopPilot — Safe Agentic Checkout for AI-Readable Merchants

### Problem statement

Merchants expose storefronts for people, not reliable interfaces for AI buyers. Shopping agents can misunderstand product details or take unsafe money actions, while generic recommendations often add no measurable merchant value.

### Solution

ShopPilot gives a merchant a machine-readable catalogue and a guarded AI shopping flow. It asks only essential questions, recommends in-stock products within hard constraints, offers one compatible optional add-on, binds approval to an immutable cart, and creates a Razorpay test-mode checkout. Deterministic policy checks and an append-only audit trail govern every money-related action.

### What broke and how we recovered

During payment integration, repeated or delayed webhook delivery could have
reapplied a terminal transition. ShopPilot now claims every provider event ID in
a unique PostgreSQL inbox, locks the matching payment row, and applies only
forward-safe state transitions. A verified capture may recover a prior failed,
expired, or cancelled observation; older failure evidence cannot regress
`paid`. Integration tests replay duplicate and out-of-order events and verify
one provider order, one payment state, and visible no-op audit evidence.

### Build challenges and technical obstacles

The hardest correctness issue was concurrency at the payment boundary. Repeated
integration runs exposed an inverted lock order between checkout attempts and
payment rows. ShopPilot now claims and locks the checkout attempt before the
payment row on every provider-order and reconciliation path. PostgreSQL
uniqueness and forward-only payment transitions then prevent retries, duplicate
webhooks, and late failure events from creating a second order or regressing a
verified payment. The regression suite repeats concurrent creation and
duplicate/out-of-order webhook scenarios without a Razorpay account.
