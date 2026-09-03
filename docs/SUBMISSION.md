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

- Use a tagged commit and reset script with known seed data.
- Preflight web, API, worker, PostgreSQL, Redis, model, and Razorpay connectivity.
- Keep fake-model fallback ready, but disclose when it is used.
- Prepare deterministic buttons for the selected failure scenario.
- Use test payment data only and hide every secret/window containing credentials.
- Record at 1080p with browser zoom and text large enough to read.
- Disable notifications and unrelated tabs.
- Rehearse to under 4:45 to leave editing margin.
- Never depend on an untested live deployment for the only recording.

## Final public-repository audit

- Clean clone setup verified by someone/something without local state.
- All documented commands and links work.
- Full CI and evaluation pass on the tagged commit.
- No secret appears in Git history, logs, screenshots, fixtures, or video.
- README claims match measured evidence.
- No “production ready” claim unless deployment, operational, and security requirements are actually met; prefer “production-shaped MVP.”
- No claim of ACP/AP2/UCP conformance unless official conformance tests are passed.
- Test mode is visible in the demo and documentation.
- Known limitations are short, specific, and honest.

## Form-ready summary draft

### Project name

ShopPilot — Safe Agentic Checkout for AI-Readable Merchants

### Problem statement

Merchants expose storefronts for people, not reliable interfaces for AI buyers. Shopping agents can misunderstand product details or take unsafe money actions, while generic recommendations often add no measurable merchant value.

### Solution

ShopPilot gives a merchant a machine-readable catalogue and a guarded AI shopping flow. It asks only essential questions, recommends in-stock products within hard constraints, offers one compatible optional add-on, binds approval to an immutable cart, and creates a Razorpay test-mode checkout. Deterministic policy checks and an append-only audit trail govern every money-related action.

### What broke and how we recovered

Reserve this section for a real implementation failure. Preferred candidate: duplicate or out-of-order payment webhook processing. State the observed symptom, root cause, added invariant/constraint, regression test, and measured result. Do not invent the story before it occurs.

