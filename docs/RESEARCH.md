# Research and design basis

Research checked on 2026-09-03. Prefer the linked primary specifications and official product documentation when implementation details change.

## Buildathon requirements

The official Track 1 wording asks for an agent that grows merchant revenue on Razorpay test-mode APIs or makes the merchant transactable by an AI buyer end to end. The stated bar is that every money action is explainable, bounded, and gated, with an audit trail and one failure handled gracefully.

Design consequence:

- The MVP implements both merchant transactability and a restrained growth feature.
- Test mode, approval, policy, audit, and failure recovery are release requirements rather than polish.

Source: [Razorpay AI Buildathon](https://razorpay.com/buildathon/)

## Machine-readable commerce

The Universal Commerce Protocol describes merchant capability discovery, catalogue/cart/checkout primitives, REST/MCP/A2A transports, and secure checkout with or without human intervention. Its discovery model uses a machine-readable well-known profile. The project borrows these ideas but intentionally avoids a full-conformance claim.

Design consequence:

- Publish capability discovery, structured catalogue search/lookup, and OpenAPI contracts.
- Version our own small contract and say “UCP-inspired subset.”
- Keep the merchant backend in control of stock, pricing, cart, and order decisions.

Sources:

- [Universal Commerce Protocol repository](https://github.com/Universal-Commerce-Protocol/ucp)
- [UCP core concepts](https://github.com/Universal-Commerce-Protocol/ucp/blob/main/docs/documentation/core-concepts.md)
- [UCP Node.js samples](https://github.com/Universal-Commerce-Protocol/samples)

Schema.org defines machine-readable `Product` and `Offer` structures including identifiers, price, currency, availability, and seller relationships.

Design consequence:

- Add JSON-LD to human product pages as a second discovery surface.
- Keep richer variant, compatibility, policy, and checkout data in typed APIs.

Source: [Schema.org Offer](https://schema.org/Offer)

## Delegated payment intent

Google’s Agent Payments Protocol separates checkout and payment mandates and links them to receipts, so an agent-performed transaction can preserve intent and evidence. The MVP does not implement AP2 cryptography, but it applies the same core principle by binding a short-lived, single-use approval to an immutable cart snapshot.

Design consequence:

- Exact cart first, explicit approval second, external order third.
- Any cart or total change requires new approval.
- Preserve structured evidence in the audit timeline.

Sources:

- [AP2 specification](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md)
- [Google’s AP2 announcement](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)

## Razorpay integration

Razorpay’s Node integration requires a server-created Order for each payment, passing the resulting order ID to checkout, and server-side verification of the checkout signature. Test mode uses simulated payment pages and does not move real money.

Razorpay webhook documentation requires validation of the HMAC-SHA256 signature over the raw body. It warns that duplicate events and out-of-order delivery can occur and provides a unique `x-razorpay-event-id` for deduplication.

Design consequence:

- Razorpay keys remain server-side and test mode is enforced by configuration.
- Checkout callback is verified; webhook/API state reconciles the durable result.
- Raw webhook bodies, unique event IDs, idempotency, and forward-only state transitions are tested.

Sources:

- [Razorpay Node.js integration](https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/)
- [Razorpay Standard Checkout test mode](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Razorpay webhook validation and idempotency](https://razorpay.com/docs/webhooks/validate-test/)
- [Razorpay Orders API](https://razorpay.com/docs/api/orders/create/)

Razorpay also publishes an official MCP server for agentic payment tooling. It is useful prior art, but the MVP should use a narrow application-owned checkout adapter instead of exposing a broad payment toolset directly to the shopping model.

Source: [Official Razorpay MCP server](https://github.com/razorpay/razorpay-mcp-server)

## Agent runtime

Anthropic's Messages API supports stateless model calls, and structured outputs
constrain Claude's response to a supplied JSON Schema. ShopPilot uses that
narrow HTTP boundary directly instead of adopting a broad agent SDK: Claude
extracts typed intent and writes grounded explanations, while application code
owns catalogue tools and every commerce decision.

Design consequence:

- Use a single agent with a small read/propose-only tool surface.
- Put deterministic validation inside each tool and again at the commerce boundary.
- Store application state in PostgreSQL rather than treating model conversation history as truth.
- Keep prompts out of logs and ensure test runs never call paid APIs.

Sources:

- [Anthropic Messages API](https://platform.claude.com/docs/en/api/http/messages/create)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic prompt-injection mitigations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)

## Codex project harness

Official OpenAI documentation recommends durable repository guidance in `AGENTS.md`, with repository layout, commands, conventions, constraints, and verification expectations. It also recommends a plan/status pattern for long-running work and requiring tests and review before accepting changes.

Design consequence:

- `AGENTS.md` contains durable rules and a session-start protocol.
- `docs/ROADMAP.md` is the measurable work queue.
- `docs/STATUS.md` is the compact cross-session handoff.
- We do not add a custom skill, hook, or project-level Codex configuration until repeated friction demonstrates a need.

Source: [OpenAI Codex AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## Assumptions to validate during implementation

- The selected runtime model and account support the planned structured tool flow.
- Razorpay test credentials and webhook configuration are available before Session 5’s live smoke test.
- A locally reachable webhook can be exposed safely for test events, or a staging URL is available.
- The final hosting platform supports Node, PostgreSQL, Redis, and raw webhook bodies.
- Submission timing and form requirements remain unchanged; recheck the official page before release.
