# Project status

Last updated: 2026-09-04

## Current position

- Active session: Session 2 — catalogue and merchant surface (complete and merged)
- Overall state: catalogue acceptance criteria pass; Session 3 has not started
- Current branch: `main`

## Completed

- Added Drizzle models and an idempotent SQL migration for merchants, catalogue versions, products, variants, inventory, and compatible add-on relations, with money, currency, size, stock, uniqueness, and lookup constraints.
- Seeded fictional merchant StepUp Shoes with 32 shoes, four add-ons, 388 total variants, deterministic inventory, return policies, and one compatible add-on per shoe.
- Added shared strict Zod contracts and a parameterized PostgreSQL catalogue reader for query, budget, UK size, product type, stock, colour, stable cursor pagination, and exact ID/slug lookup.
- Added `/.well-known/ucp`, `/openapi.json`, `POST /v1/catalog/search`, and `GET /v1/catalog/products/:idOrSlug`; discovery explicitly says the implementation is inspired by UCP concepts and is not UCP-conformant.
- Added database-backed product pages with safely serialized Schema.org `Product`, `Offer`, availability, variant, return-policy, and related-product JSON-LD.
- Added unit and PostgreSQL integration coverage for contracts, exact filters, invalid products, out-of-stock variants, pagination, add-ons, and injection-like descriptions treated only as data.
- Added migration, seed, catalogue endpoint, example search, subset disclaimer, and product-page instructions to `README.md`; recorded the catalogue query boundary in `docs/ARCHITECTURE.md`.

## Verification

Passed on 2026-09-04:

- `corepack pnpm install --offline`
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:migrate`
- `DATABASE_URL=postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot corepack pnpm db:seed`
- `corepack pnpm repo:check` — 72 candidate files clean
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck` — root integration/config sources and all six packages pass
- `corepack pnpm test` — 18 tests in eight files pass without network access
- `corepack pnpm test:integration` — seven PostgreSQL/Redis tests pass
- `corepack pnpm build` — all packages and the production Next.js application pass
- Built API/web smoke check: discovery, sub-₹4,000 size/type search, exact product lookup, out-of-stock inventory, compatible add-on data, and rendered Schema.org JSON-LD all returned successfully.

`test:e2e` and `eval` scripts do not exist yet; their roadmap implementations begin in later sessions, so they are not applicable to Session 2.

## Blockers

- None for the completed Session 2.
- Later live test-mode integration will require `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` supplied locally, never committed.
- Runtime AI calls will require an API key supplied locally. The planned fake-model mode remains the test default.

## Exact next action

Create `session/03-grounded-shopping-conversation` from the updated local `main`, update this status to Session 3, and begin the first unchecked Session 3 task in `docs/ROADMAP.md` using the agent boundaries in `docs/ARCHITECTURE.md`.
