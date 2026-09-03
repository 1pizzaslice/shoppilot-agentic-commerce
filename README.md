# ShopPilot

ShopPilot is a safe agentic-commerce demo for Razorpay Buildathon Track 1. A shopper can ask for something such as “running shoes under ₹4,000,” answer only the missing questions, compare grounded recommendations, approve an optional add-on, and complete a Razorpay test-mode purchase.

The merchant exposes a machine-readable catalogue so the agent works from current product, variant, stock, price, and policy data instead of inventing details. Every money-related action is deterministic, bounded, explicitly approved, and recorded.

## MVP promise

- One fictional shoe merchant with a polished storefront and 30–50 realistic products.
- Machine-readable discovery, catalogue search, and product lookup endpoints.
- Product pages containing Schema.org `Product`/`Offer` JSON-LD.
- Conversational shopping with minimal clarification.
- Three ranked, explainable, catalogue-grounded choices.
- One relevant, compatible, optional checkout add-on.
- A frozen order summary and explicit human approval before order creation.
- Razorpay Standard Checkout in test mode.
- Signed webhook processing, duplicate-event protection, and an audit timeline.
- A repeatable evaluation suite covering normal, ambiguous, malicious, and failure cases.

## Deliberate non-goals

- Crawling arbitrary websites or comparing multiple real merchants.
- Live payments, stored cards, or an agent entering payment credentials.
- Full compliance with ACP, AP2, UCP, or every ecommerce workflow.
- Training a model, voice shopping, returns, fulfilment, user accounts, or a merchant admin suite.
- Automatically adding an upsell or changing the approved cart.

## Planned stack

- TypeScript on Node.js 22+
- Next.js for the shopper and demo experience
- Fastify for the API and Razorpay webhook boundary
- OpenAI Agents SDK with Zod-validated tools and outputs
- PostgreSQL with Drizzle ORM
- Redis and BullMQ only for durable agent/evaluation jobs
- Razorpay Node SDK and Standard Checkout, test mode only
- Vitest, Testcontainers, Playwright, and an offline evaluation runner
- pnpm workspaces, Docker Compose, GitHub Actions

The runtime model remains replaceable behind an internal interface. Deterministic application code—not the model—owns prices, ranking constraints, cart totals, authorization, order creation, and payment state.

## Repository map

The implementation folders will be created during Session 1:

```text
apps/web        Shopper UI and demo dashboard
apps/api        HTTP API, agent orchestration, checkout and webhooks
apps/worker     Durable background and evaluation jobs
packages/domain Shared schemas, money types and state machines
packages/db     PostgreSQL schema and repositories
packages/testkit Fixtures, fake adapters and evaluation cases
docs/           Product, architecture, delivery and submission truth
```

## Project documents

- [Product requirements](docs/PRODUCT.md)
- [Architecture and security](docs/ARCHITECTURE.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Testing and evaluation](docs/TESTING.md)
- [Research and decisions](docs/RESEARCH.md)
- [Submission plan](docs/SUBMISSION.md)
- [Current project state](docs/STATUS.md)

## Current state

Planning is complete; implementation has not started. The next session is Session 1 in [docs/ROADMAP.md](docs/ROADMAP.md).

