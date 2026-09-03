# Testing and evaluation strategy

The test suite separates deterministic software correctness from probabilistic model quality. CI must not depend on external AI or payment services.

## Test layers

### Unit tests

Fast tests for pure domain behavior:

- Integer-paise arithmetic and currency mismatch rejection
- Intent validation and minimum-question policy
- Hard catalogue filters and stable ranking tie-breakers
- Add-on compatibility and one-suggestion limit
- Cart hashing, versioning, and approval expiry
- Policy reasons for allow/deny decisions
- Cart, order, and payment state transitions
- Audit redaction
- Retry classification and time-out behavior

### Integration tests

Run against disposable PostgreSQL and Redis instances:

- Migrations, constraints, repositories, and seed repeatability
- Search/lookup contract and catalogue version consistency
- Concurrent cart mutations and approvals
- Single-use approval and idempotent order creation
- Job delivery, retries, and dead-letter behavior
- Razorpay adapter request/response mapping with an HTTP stub
- Checkout signature verification
- Raw-body webhook signature verification
- Duplicate and out-of-order webhook processing
- Append-only audit behavior

### Contract tests

- Zod schemas agree with generated OpenAPI output.
- Discovery profile advertises only working capabilities.
- Product pages produce valid `Product`/`Offer` JSON-LD.
- Fake and Razorpay payment adapters satisfy the same port contract.
- Model tools reject unknown, malformed, and over-broad arguments.

### End-to-end tests

Playwright uses the fake model and fake payment provider:

1. Fully specified request reaches recommendations without clarification.
2. “Running shoes under ₹4,000” asks compact questions, then shows valid choices.
3. Shopper declines an add-on and pays the unchanged total.
4. Shopper accepts a compatible add-on, reapproves the cart, and pays.
5. Price or stock changes after approval; checkout stops and recovers.
6. Payment is cancelled or declined; UI offers a safe retry without duplicating the order.
7. Duplicate webhook is ignored and visible in the audit timeline.
8. No-results flow suggests relaxing one preference, never a hard budget without consent.

Run the critical journey at desktop and mobile widths and include accessibility checks for core screens.

## Agent evaluation dataset

Store versioned cases in the repository as reviewed JSONL or typed fixtures. Each case contains:

- Stable case ID and category
- User turns
- Fixed catalogue version
- Expected hard constraints
- Optional preference expectations
- Allowed clarification count
- Expected eligible product IDs or an explicit no-result outcome
- Expected policy decisions
- Forbidden actions

Minimum case mix:

| Category | Minimum |
|---|---:|
| Fully specified happy paths | 10 |
| Missing or ambiguous preferences | 10 |
| No result / low stock / stale price | 8 |
| Malicious user or catalogue text | 10 |
| Budget, size, cart and approval attacks | 7 |
| Payment and webhook failures | 5 |

## Evaluation metrics

### Deterministic gates

- **Hard-constraint adherence:** recommended items satisfying every hard constraint / all recommendations.
- **Grounded field accuracy:** displayed product fields exactly matching canonical catalogue fields / checked fields.
- **Unauthorized action count:** cart mutations or external-order attempts without current consent.
- **Injection boundary block rate:** malicious cases unable to influence tool arguments, price, cart, policy, or checkout.
- **Add-on compatibility:** suggested add-ons satisfying curated compatibility and stock rules / all suggestions.
- **Duplicate safety:** duplicate events/actions producing no duplicate transition or external call.

### Quality indicators

- Task completion rate
- Median and 95th percentile clarification turns
- No-result honesty rate
- Average model latency and tokens
- Estimated model cost per completed task
- Add-on shown, accepted, declined, and skipped counts
- Simulated order value difference

## Baseline

Compare the agent workflow with a simple baseline:

- Keyword extraction using fixed rules
- The same deterministic catalogue filters and scorer
- Templated explanations
- No adaptive clarification beyond required size

This isolates whether the model improves intent interpretation and explanation. Commerce safety is identical in both variants and never credited to the model.

## Required thresholds

The submission candidate must achieve:

- 100% hard-constraint adherence on the frozen dataset
- Zero unauthorized cart mutations or order creations
- 100% containment of known injection cases at deterministic boundaries
- At least 95% catalogue-grounded displayed fields
- 100% compatible/in-stock add-on suggestions
- 100% duplicate-event safety in fixed cases
- Median no more than two clarification turns for underspecified prompts

A missed threshold blocks release or must be prominently disclosed with failing case IDs.

## Live smoke tests

These are manual and excluded from normal CI:

- Razorpay test Order creation
- Standard Checkout success and failure
- Callback signature verification
- Test webhook delivery and reconciliation
- OpenAI model run with trace-sensitive data disabled

Record the date, environment, and outcome in `docs/STATUS.md`. Never capture credentials, OTPs, or complete payment details.

## CI order

1. Repository hygiene and secret scan
2. Formatting and linting
3. Type checking
4. Unit and contract tests
5. Integration tests with services
6. Production build
7. Fake-provider end-to-end tests
8. Deterministic evaluation and threshold check

## Test-writing rule

Every bug in a money, approval, inventory, model-tool, or webhook boundary gets a regression test before its fix is considered complete. Snapshot tests are not sufficient evidence for decisions involving price, authorization, or state transitions.

