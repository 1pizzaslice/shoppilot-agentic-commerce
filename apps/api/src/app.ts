import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import {
  addCartLineInputSchema,
  addonDecisionInputSchema,
  approveCartInputSchema,
  auditEventSchema,
  catalogueErrorSchema,
  catalogueProductSchema,
  catalogueSearchResponseSchema,
  catalogueSearchSchema,
  cartIdParamsSchema,
  cartSchema,
  cartWithApprovalSchema,
  cartWithSnapshotSchema,
  checkoutAuthorizationSchema,
  commerceErrorSchema,
  CommerceConflictError,
  CommerceNotFoundError,
  CommercePolicyError,
  createCartInputSchema,
  createCheckoutInputSchema,
  conversationIdParamsSchema,
  conversationMessageInputSchema,
  makeHealthReport,
  shoppingResponseSchema,
  versionedCartInputSchema,
  type CatalogueReader,
  type CommerceService,
  type ShoppingConversationHandler,
} from "@shoppilot/domain";
import type { ReadinessDependencies } from "@shoppilot/db";

import {
  discoveryDocument,
  discoverySchema,
  openApiDocument,
} from "./catalogue-contract.js";

export interface ApiDependencies {
  readiness: Pick<ReadinessDependencies, "check">;
  catalogue: CatalogueReader;
  conversation: ShoppingConversationHandler;
  commerce: CommerceService;
}

const productParamsSchema = z
  .object({ idOrSlug: z.string().min(1).max(160) })
  .strict();

export const buildApi = ({
  readiness,
  catalogue,
  conversation,
  commerce,
}: ApiDependencies): FastifyInstance => {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof CommerceNotFoundError) {
      return reply.code(404).send(
        commerceErrorSchema.parse({
          error: "not_found",
          message: error.message,
        }),
      );
    }
    if (error instanceof CommerceConflictError) {
      return reply.code(409).send(
        commerceErrorSchema.parse({
          error: "conflict",
          message: error.message,
        }),
      );
    }
    if (error instanceof CommercePolicyError) {
      return reply.code(409).send(
        commerceErrorSchema.parse({
          error: "policy_rejected",
          message: error.message,
          decision: error.decision,
        }),
      );
    }
    return reply.code(500).send({
      error: "internal_error",
      message: "An internal error occurred.",
    });
  });

  app.get("/health/live", () => ({ status: "alive" }));
  app.get("/health", async (_request, reply) => {
    const report = makeHealthReport("api", await readiness.check());
    if (report.status === "degraded") {
      return reply.code(503).send(report);
    }

    return report;
  });

  app.get("/.well-known/ucp", () => discoverySchema.parse(discoveryDocument));
  app.get("/openapi.json", () => openApiDocument);

  app.post("/v1/catalog/search", async (request, reply) => {
    const parsed = catalogueSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(
        catalogueErrorSchema.parse({
          error: "invalid_request",
          message: "Search filters are invalid.",
        }),
      );
    }

    const response = await catalogue.search(parsed.data);
    return catalogueSearchResponseSchema.parse(response);
  });

  app.get("/v1/catalog/products/:idOrSlug", async (request, reply) => {
    const parsed = productParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send(
        catalogueErrorSchema.parse({
          error: "invalid_request",
          message: "Product identifier is invalid.",
        }),
      );
    }

    const product = await catalogue.getProduct(parsed.data.idOrSlug);
    if (product === null) {
      return reply.code(404).send(
        catalogueErrorSchema.parse({
          error: "not_found",
          message: "Product not found.",
        }),
      );
    }

    return catalogueProductSchema.parse(product);
  });

  app.post("/v1/conversations", async (request, reply) => {
    const parsed = conversationMessageInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(
        catalogueErrorSchema.parse({
          error: "invalid_request",
          message: "Conversation message is invalid.",
        }),
      );
    }

    const response = await conversation.start(parsed.data.message);
    return reply.code(201).send(shoppingResponseSchema.parse(response));
  });

  app.post(
    "/v1/conversations/:conversationId/messages",
    async (request, reply) => {
      const params = conversationIdParamsSchema.safeParse(request.params);
      const body = conversationMessageInputSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.code(400).send(
          catalogueErrorSchema.parse({
            error: "invalid_request",
            message: "Conversation request is invalid.",
          }),
        );
      }

      const response = await conversation.continue(
        params.data.conversationId,
        body.data.message,
      );
      if (response === null) {
        return reply.code(404).send(
          catalogueErrorSchema.parse({
            error: "not_found",
            message: "Conversation not found.",
          }),
        );
      }
      return shoppingResponseSchema.parse(response);
    },
  );

  app.post("/v1/carts", async (request, reply) => {
    const input = createCartInputSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Cart request is invalid.",
        }),
      );
    }
    return reply
      .code(201)
      .send(cartSchema.parse(await commerce.createCart(input.data)));
  });

  app.get("/v1/carts/:cartId", async (request, reply) => {
    const params = cartIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Cart identifier is invalid.",
        }),
      );
    }
    const cart = await commerce.getCart(params.data.cartId);
    if (cart === null) {
      throw new CommerceNotFoundError("Cart not found.");
    }
    return cartSchema.parse(cart);
  });

  app.post("/v1/carts/:cartId/lines", async (request, reply) => {
    const params = cartIdParamsSchema.safeParse(request.params);
    const body = addCartLineInputSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Cart line request is invalid.",
        }),
      );
    }
    return cartSchema.parse(
      await commerce.addPrimaryLine(params.data.cartId, body.data),
    );
  });

  app.post("/v1/carts/:cartId/addon-decision", async (request, reply) => {
    const params = cartIdParamsSchema.safeParse(request.params);
    const body = addonDecisionInputSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Add-on decision is invalid.",
        }),
      );
    }
    return cartSchema.parse(
      await commerce.decideAddon(params.data.cartId, body.data),
    );
  });

  app.post("/v1/carts/:cartId/review", async (request, reply) => {
    const params = cartIdParamsSchema.safeParse(request.params);
    const body = versionedCartInputSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Cart review request is invalid.",
        }),
      );
    }
    return cartWithSnapshotSchema.parse(
      await commerce.reviewCart(params.data.cartId, body.data.expectedVersion),
    );
  });

  app.post("/v1/carts/:cartId/approve", async (request, reply) => {
    const params = cartIdParamsSchema.safeParse(request.params);
    const body = approveCartInputSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Cart approval request is invalid.",
        }),
      );
    }
    return cartWithApprovalSchema.parse(
      await commerce.approveCart(params.data.cartId, body.data),
    );
  });

  app.post("/v1/checkouts", async (request, reply) => {
    const body = createCheckoutInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Checkout request is invalid.",
        }),
      );
    }
    return reply
      .code(201)
      .send(
        checkoutAuthorizationSchema.parse(
          await commerce.authorizeCheckout(body.data),
        ),
      );
  });

  app.get("/v1/carts/:cartId/audit", async (request, reply) => {
    const params = cartIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(
        commerceErrorSchema.parse({
          error: "invalid_request",
          message: "Cart identifier is invalid.",
        }),
      );
    }
    const cart = await commerce.getCart(params.data.cartId);
    if (cart === null) throw new CommerceNotFoundError("Cart not found.");
    return z
      .array(auditEventSchema)
      .parse(await commerce.getAuditTimeline(params.data.cartId));
  });

  return app;
};
