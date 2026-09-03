# Product requirements

## One-sentence pitch

ShopPilot lets a shopper describe the shoes they need, asks only essential follow-ups, recommends catalogue-grounded options, offers one useful add-on, and creates a Razorpay test-mode checkout only after the shopper approves the exact cart.

## Track fit

The product addresses both halves of Track 1:

- **Agentic commerce:** a machine can discover products, build a cart, and initiate checkout end to end.
- **AI growth:** the merchant can earn additional order value through one compatible, consented add-on.

The product also makes every money action explainable, bounded, gated, and auditable, and visibly recovers from a meaningful failure.

## Users

### Shopper

Wants a small set of good options without opening many product pages or learning search filters. Values control over preferences, cart contents, and payment.

### Merchant

Wants products to be discoverable by AI buyers and wants relevant add-on sales without harming trust or checkout conversion.

### Reviewer

Wants to verify that the product works, uses AI meaningfully, handles money safely, and has measured evidence rather than a staged happy path.

## Primary journey

1. The shopper enters: “Find running shoes under ₹4,000.”
2. The system extracts known constraints and identifies only the missing hard constraints.
3. It asks one compact message such as: “What size do you need? Any colour preference, or should I prioritize best overall fit?”
4. The shopper answers: “UK 9, black if possible.”
5. Deterministic catalogue search returns in-stock variants within budget. A deterministic scorer ranks them.
6. The agent shows at most three options and explains why each fits. It distinguishes hard matches from preferences.
7. The shopper selects one shoe.
8. The system proposes at most one compatible add-on, such as a cleaning kit. It is clearly optional and starts unchecked.
9. The shopper accepts or declines the add-on.
10. The system freezes and shows the exact cart, charges, delivery information, approval expiry, and merchant.
11. The shopper explicitly approves that snapshot.
12. The policy gate revalidates approval, budget, price, inventory, quantity, and duplicate-execution risk.
13. The server creates a Razorpay test-mode Order and opens Standard Checkout.
14. The shopper completes or cancels the simulated payment on Razorpay’s checkout.
15. The system verifies payment evidence and shows a receipt plus an understandable audit timeline.

## Minimum-question policy

Questions reduce only decision-changing uncertainty:

- **Required for shoes:** size. Ask before showing recommendations.
- **Usually inferred from the request:** category/type and maximum budget.
- **Optional:** colour, brand, style, and use intensity. Ask in the same message as size only when useful; allow “no preference.”
- **Never ask:** details already stated, information that does not alter eligibility/ranking, or a long questionnaire before showing value.
- **When ambiguous:** summarize the interpretation and offer a one-click correction.

Target: no more than two clarification turns for an underspecified request and zero for a sufficiently specified request.

## Recommendation rules

Hard filters run before any model-authored explanation:

- Exact category intent or a documented compatible category.
- Requested size variant exists and is in stock.
- Final shoe price does not exceed the shoe budget.
- Product and offer are active and from the selected merchant.

Ranking uses transparent signals such as use-case match, preference match, price headroom, stock confidence, return-window quality, and merchant-curated quality score. The model does not create or secretly change weights during a purchase.

Every recommendation displays:

- Exact product and variant
- Current price and stock status
- Which constraints matched
- One useful reason to choose it
- One honest trade-off when available
- Timestamp/catalogue version used

## Machine-readable merchant surface

The merchant publishes:

- A discovery profile describing supported catalogue and checkout capabilities.
- A typed catalogue-search endpoint for structured filters.
- A product-lookup endpoint returning product, variants, offers, stock, policy, and compatible add-ons.
- Product-page JSON-LD based on Schema.org `Product` and `Offer`.
- An OpenAPI document that another client can use without scraping the UI.

This is a practical UCP-inspired subset for the buildathon, not a claim of full protocol conformance. The catalogue is queried through APIs; “crawlable” means machine-discoverable and machine-readable, not uncontrolled browser scraping.

## Growth feature

The merchant curates compatibility relations such as:

```text
running shoe -> shoe cleaning kit
suede shoe -> suede-safe brush
white shoe -> non-yellowing cleaner
```

The system selects one available compatible add-on that keeps the total within any cart-level cap. The agent explains the practical value in one sentence. The shopper can accept or decline without friction.

The product records:

- Suggestion shown
- Accepted, declined, or skipped
- Base cart value
- Add-on value
- Final order value

Buildathon simulations may compare order value with and without suggestions, but they must be labelled simulated and not presented as proven production uplift.

## Approval and payment contract

“Buy it for me” means the agent may prepare the purchase and create the test checkout after approval. It does not possess or enter a card, UPI PIN, OTP, or other payment credential.

Approval is bound to:

- Shopper/session
- Merchant
- Cart snapshot hash
- Line items and variants
- All price components and final total
- Currency
- Expiry timestamp
- Single-use identifier

Any price, stock, quantity, product, discount, delivery, or total change invalidates approval and returns the shopper to review.

## Required failure demonstrations

Primary video failure:

- A duplicate payment webhook is delivered.
- The signature is verified, the duplicate event ID is recognized, and no second state transition or external action occurs.
- The audit timeline explains that a duplicate was safely ignored.

User-facing fallback:

- A selected variant becomes unavailable or changes price after approval.
- Order creation stops, approval is invalidated, and the shopper receives alternatives or a clear reapproval request.

## Functional requirements

### Catalogue

- Search by category, maximum price, size, colour, use case, and stock.
- Return canonical identifiers and integer-paise prices.
- Support product variants and compatibility relationships.
- Never pass catalogue descriptions into model instructions.

### Conversation

- Persist a typed intent independent of prose conversation history.
- Provide clear progress and cancellation.
- Recover from malformed model output without mutating commerce state.

### Cart and checkout

- Maintain versioned carts and immutable checkout snapshots.
- Require explicit consent for every mutation.
- Revalidate at the external-action boundary.
- Make repeated requests safe.

### Audit

- Record actor, action, input reference, result, policy reason, correlation ID, and timestamp.
- Redact sensitive content.
- Render a shopper-friendly explanation while retaining structured events for evaluation.

### Demo

- Include repeatable happy-path and failure presets.
- Work with fake model/payment adapters when external credentials are absent.
- Use real Razorpay test mode for the final integration demonstration.

## Non-functional requirements

- No live-money path.
- 95th percentile internal API latency under 500 ms excluding model and Razorpay calls on the local demo dataset.
- Agent run has a turn, tool-call, time, and cost limit.
- External calls have explicit time-outs and bounded retries.
- Accessible keyboard-first core flow on desktop and mobile layouts.
- Structured logs correlate request, conversation, cart, order, payment, and audit events.
- The application starts from documented commands on a clean machine with Docker, Node, and pnpm.

## Success metrics

- Hard-constraint adherence
- Catalogue-grounded field accuracy
- Task completion rate
- Median clarification count
- Unapproved mutation/order rate
- Injection-case block rate
- Duplicate-event handling rate
- Compatible add-on rate
- Simulated add-on attach rate and order-value difference
- Model latency, tokens, and estimated cost per completed task

## Out of scope until the MVP passes

Multi-merchant comparison, arbitrary-site crawling, live payments, user authentication, saved payment instruments, delivery fulfilment, returns, refunds, voice, multilingual UI, dynamic discount generation, merchant onboarding, and full protocol certification.

