# Architecture and safety

## Design choice

Use a modular TypeScript monorepo with three deployable processes and shared domain packages. This keeps money and catalogue rules testable without a model or browser while preserving a clean production shape.

```text
Shopper browser
  -> Next.js web
  -> Fastify API
       -> conversation orchestrator -> model adapter
       -> catalogue service          -> PostgreSQL
       -> policy + approval service  -> PostgreSQL audit log
       -> checkout service           -> Razorpay test API
       -> job queue                   -> Redis -> worker
Razorpay webhook
  -> raw-body verification -> inbox/deduplication -> payment state machine
```

## Planned modules

### `apps/web`

- Shopper conversation and recommendation UI
- Product comparison, optional add-on, cart review, and approval
- Razorpay Standard Checkout launcher
- Receipt, audit drawer, and demo/evaluation dashboard
- No secrets, model calls, price calculation, or authorization logic

### `apps/api`

- Fastify HTTP application and generated OpenAPI document
- Catalogue discovery/search/lookup
- Conversation and agent orchestration
- Cart, approval, policy, and checkout services
- Razorpay order creation, signature verification, and webhook endpoint
- Health/readiness and structured logging

### `apps/worker`

- Durable agent runs if request latency becomes unsuitable
- Batch evaluation jobs and result aggregation
- Outbox/event processing where needed
- No independent commerce rules; calls shared domain services

### `packages/domain`

- Zod schemas and TypeScript domain types
- Integer-paise money operations
- Shopping intent, ranking, compatibility, and question policy
- Cart, approval, order, and payment state machines
- Policy decisions and audit-event contracts
- Ports for model, payment, clock, ID, and event delivery

### `packages/db`

- Drizzle schema, migrations, transactions, indexes, and repositories
- PostgreSQL implementations of domain ports
- Seed data and reset tools

### `packages/testkit`

- Fake model and fake Razorpay adapters
- Fixed clock and deterministic ID generator
- Product factory, database helpers, webhook fixtures, and evaluation cases

## Why PostgreSQL and Redis

PostgreSQL is the source of truth for products, inventory, conversation state, carts, approvals, external orders, webhook inbox entries, audit events, and evaluation results. Transactions and uniqueness constraints protect payment boundaries.

Redis is not a source of truth. It supports BullMQ job coordination, short-lived locks, and rate limits. Correctness must survive Redis eviction or restart because durable state remains in PostgreSQL.

## Core data model

Initial tables:

- `merchants`
- `catalog_versions`
- `products`
- `product_variants`
- `inventory`
- `product_relations`
- `conversations`
- `shopping_intents`
- `agent_runs`
- `carts`
- `cart_lines`
- `checkout_snapshots`
- `approvals`
- `policy_decisions`
- `external_orders`
- `payments`
- `webhook_inbox`
- `audit_events`
- `evaluation_runs`
- `evaluation_case_results`

Important constraints:

- Prices are integer paise with a currency column.
- SKU and variant identifiers are unique per merchant.
- Cart has a monotonically increasing version.
- Approval is unique and single-use for one cart snapshot hash.
- External order creation has a unique idempotency key.
- Razorpay order ID, payment ID, and webhook event ID are unique where present.
- Audit events are append-only at application permission level.

## State ownership

### Shopping intent

`collecting -> ready -> recommendations_shown -> product_selected -> cancelled`

### Cart

`draft -> review -> approved -> checkout_started -> terminal`

Any mutation after `approved` creates a new cart version and invalidates the previous approval.

### External order

`not_created -> creating -> created -> payment_pending -> paid | failed | expired | cancelled`

Only database-validated transitions are allowed. Webhook order is not assumed.

## Agent design

Use one shopping agent, not a multi-agent swarm. Its allowed tools are deliberately narrow:

- `searchCatalog(filters)` — read-only
- `getProduct(productId)` — read-only
- `selectProduct(productId, variantId)` — internal proposal only
- `proposeAddon(productId)` — internal proposal only
- `requestCartReview()` — freezes a draft but does not approve or pay

The model cannot call Razorpay. After explicit UI approval, application code invokes the policy gate and checkout service.

Model responsibilities:

- Extract a typed intent from natural language.
- Decide whether an essential clarification remains.
- Explain already-filtered recommendations in plain language.
- Explain a deterministic add-on suggestion.

Deterministic responsibilities:

- Validate intent and tool inputs.
- Filter and rank eligible products.
- Read prices, inventory, policies, and compatibility.
- Calculate totals and snapshot hashes.
- Authorize, create, and reconcile orders.
- Enforce rate, turn, tool, budget, and time limits.

## Catalogue discovery design

Planned public endpoints:

```text
GET  /.well-known/ucp
GET  /openapi.json
POST /v1/catalog/search
GET  /v1/catalog/products/:id
POST /v1/carts
POST /v1/carts/:id/lines
POST /v1/carts/:id/review
POST /v1/carts/:id/approve
POST /v1/checkouts
POST /v1/payment-orders
GET  /v1/checkouts/:checkoutAttemptId
POST /v1/payments/callback
POST /v1/payments/cancel
POST /v1/webhooks/razorpay
```

The discovery endpoint declares only implemented capabilities and a project-specific protocol/version. Documentation will state that it is inspired by UCP capability discovery, catalog, cart, and checkout concepts. Product pages additionally emit Schema.org JSON-LD for broad machine readability.

## Payment boundary

1. Cart review creates an immutable snapshot from database values.
2. Shopper approval binds to that snapshot and expires quickly.
3. Checkout request opens a serializable database transaction or equivalent guarded transition.
4. Policy gate verifies the current snapshot, approval, total, stock, and prior execution.
5. An idempotency key derived from the approved snapshot identifies the attempt.
6. API creates a Razorpay Order server-side and persists the response.
7. Browser receives only public checkout configuration and the Razorpay order ID.
8. Callback evidence is signature-verified, but the payment state is also reconciled through verified webhook/API evidence.
9. Duplicate and out-of-order webhooks enter an inbox table and produce safe no-op or forward-only transitions.

## Threat model

| Threat | Primary control | Evidence |
|---|---|---|
| Catalogue prompt injection | Descriptions are untrusted tool data; strict schemas; deterministic filters and policy | Adversarial evaluation cases |
| Hallucinated product/price | Canonical IDs and DB lookups at every boundary | Grounding score and integration tests |
| Over-budget purchase | Integer-paise calculation and policy rejection | Unit/evaluation tests |
| Add-on without consent | Explicit cart mutation endpoint and approval invalidation | E2E and audit event |
| Price/stock race | Immutable snapshot plus pre-order revalidation | Integration and demo failure |
| Duplicate order/action | Unique idempotency key and guarded state transition | Concurrency test |
| Forged callback/webhook | HMAC verification using raw body and server-side secret | Signature tests |
| Duplicate/out-of-order webhook | Unique event inbox and state-machine rules | Integration and video demo |
| Secret leakage | Server-only env validation, redaction, secret scan | CI and review |
| Runaway model loop/cost | Max turns, tool calls, wall time, and token budget | Agent-run tests and telemetry |
| Sensitive trace/log data | Redaction and disabled sensitive trace payloads | Logging tests |

## API and process reliability

- External calls have connection and total time-outs.
- Retry only safe reads and explicitly idempotent operations, with bounded exponential backoff and jitter.
- Use correlation IDs across HTTP, jobs, audit, and logs.
- Use a transactional outbox/inbox only where an actual cross-process consistency need appears.
- Rate-limit conversation starts, model runs, approval attempts, checkout creation, and webhooks separately.
- Health checks distinguish liveness from dependency readiness.
- Graceful shutdown stops new work and lets active database/job operations settle within a bound.

## Privacy and retention

The MVP avoids accounts and minimizes personal data. Use fictional delivery data in demos. Do not store payment credentials or raw Razorpay secrets. Log identifiers and outcomes rather than full prompts or addresses. Provide development reset/cleanup commands and document retained tables.

## Architecture decisions

1. **One agent, deterministic commerce core.** Easier to inspect and safer than agent-to-agent choreography.
2. **Machine-readable API, not arbitrary crawling.** More reliable and directly demonstrates merchant transactability.
3. **Standards-inspired, not standards-certified.** Implement useful concepts without making a false conformance claim.
4. **Razorpay Standard Checkout, test only.** The agent prepares; the user controls credentials and payment confirmation.
5. **PostgreSQL is truth; Redis is coordination.** Payment correctness never depends on cache durability.
6. **Fake adapters are first-class.** CI and reviewers can run the full product without external accounts.
7. **Catalogue queries return eligible variants, not model-authored facts.** Search applies parameterized PostgreSQL filters before grouping products, uses stable product-ID cursors, and validates database rows and HTTP responses with shared Zod contracts.
8. **Conversation orchestration persists evidence but keeps authority deterministic.** PostgreSQL stores the typed intent and state on every turn plus append-only model-call, tool-call, and question-policy events. The model adapter can only return a strict intent patch and short explanations. A read-only catalogue tool, hard-filter recheck, stable price/ID scorer, exact variant selector, and three-result cap run in application code. The fake adapter is the default local and test provider, so the complete conversation path requires no network or API key.
9. **Checkout authorization is separate from payment execution.** A cart uses a monotonically increasing content version and PostgreSQL row locks for optimistic concurrency. The compatibility relation and live inventory deterministically produce at most one add-on offer; accepted, declined, and skipped outcomes are durable, and only explicit acceptance inserts the add-on line. Review stores a database-immutable canonical snapshot and SHA-256 hash. Approval binds that hash, user, total, currency, cart version, and expiry. The checkout policy transaction revalidates budget, quantities, stock, price, mutation state, freshness, and prior execution before producing one unique `authorized` checkout attempt. Session 5 payment adapters may consume that attempt; they cannot bypass it.
10. **Payment execution is single-shot and evidence-reconciled.** Fake and Razorpay test providers implement the same typed port. A PostgreSQL row lock and primary key claim the authorized attempt before the external call; retries return stored state, including an uncertain `creating` state, instead of creating another provider order. Standard Checkout receives public configuration only. Callback and exact-raw-body webhook signatures are verified server-side, webhook event IDs are unique, and the explicit payment state machine treats verified capture as authoritative while ignoring older evidence after `paid`. Every provider action and webhook outcome appends redacted audit evidence.
