# ShopPilot

ShopPilot is a safe agentic-commerce demo for Razorpay Buildathon Track 1. A
shopper can ask for something such as “running shoes under ₹4,000,” answer only
the missing questions, compare grounded recommendations, approve an optional
add-on, and complete a Razorpay test-mode purchase.

The merchant exposes a machine-readable catalogue so the agent works from
current product, variant, stock, price, and policy data instead of inventing
details. Every money-related action is deterministic, bounded, explicitly
approved, and recorded.

## MVP promise

- One fictional shoe merchant with a polished storefront and 30–50 realistic
  products.
- Machine-readable discovery, catalogue search, and product lookup endpoints.
- Product pages containing Schema.org `Product`/`Offer` JSON-LD.
- Conversational shopping with minimal clarification.
- Three ranked, explainable, catalogue-grounded choices.
- One relevant, compatible, optional checkout add-on.
- A frozen order summary and explicit human approval before order creation.
- Razorpay Standard Checkout in test mode.
- Signed webhook processing, duplicate-event protection, and an audit timeline.
- A repeatable evaluation suite covering normal, ambiguous, malicious, and
  failure cases.

## Deliberate non-goals

- Crawling arbitrary websites or comparing multiple real merchants.
- Live payments, stored cards, or an agent entering payment credentials.
- Full compliance with ACP, AP2, UCP, or every ecommerce workflow.
- Training a model, voice shopping, returns, fulfilment, user accounts, or a
  merchant admin suite.
- Automatically adding an upsell or changing the approved cart.

## Stack

- TypeScript on Node.js 22+
- Next.js for the shopper and demo experience
- Fastify for the API and Razorpay webhook boundary
- OpenAI Agents SDK with Zod-validated tools and outputs
- PostgreSQL with Drizzle ORM
- Redis and BullMQ only for durable agent/evaluation jobs
- Razorpay Node SDK and Standard Checkout, test mode only
- Vitest, Testcontainers, Playwright, and an offline evaluation runner
- pnpm workspaces, Docker Compose, GitHub Actions

The runtime model remains replaceable behind an internal interface.
Deterministic application code—not the model—owns prices, ranking constraints,
cart totals, authorization, order creation, and payment state.

## Repository map

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

## Local setup

Prerequisites are Node.js 22 or newer, Corepack/pnpm, and Docker with the
Compose plugin. All local payment configuration is test mode only.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm build
```

Start the processes in separate terminals:

```bash
set -a && source .env && set +a
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

Readiness endpoints:

- Web: `http://localhost:3000/api/health`
- API liveness: `http://localhost:3001/health/live`
- API dependency readiness: `http://localhost:3001/health`
- Worker: `pnpm --filter @shoppilot/worker start -- --health-check` after a
  build

Run the Session 1 quality suite with `pnpm quality`. It checks repository
hygiene, formatting, lint, strict types, offline unit tests, PostgreSQL/Redis
integration, and production builds. Stop local infrastructure with
`docker compose down`; named volumes preserve data unless explicitly removed.

Copying `.env.example` is safe because it contains only local development values
and blank credential slots. Never commit `.env`, real model keys, or Razorpay
credentials. Razorpay key IDs are rejected unless they use the `rzp_test_`
prefix. If a default database port is already occupied, change `POSTGRES_PORT`
or `REDIS_PORT` and the matching connection URL in `.env` before starting
Compose.

## Current state

Repository foundation is implemented on the Session 1 branch. See
[current project state](docs/STATUS.md) for verified commands and the exact next
action.
