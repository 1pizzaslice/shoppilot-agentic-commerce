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
  cancelPaymentInputSchema,
  checkoutAttemptParamsSchema,
  checkoutCallbackInputSchema,
  checkoutLaunchSchema,
  createPaymentOrderInputSchema,
  demoPaymentInputSchema,
  paymentErrorSchema,
  paymentOrderSchema,
  paymentWebhookHeadersSchema,
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentProviderError,
  PaymentSignatureError,
  type PaymentService,
  type DemoPaymentInput,
  type PaymentOrder,
  merchantGrowthParamsSchema,
  merchantGrowthSummarySchema,
  type MerchantGrowthReader,
} from "@shoppilot/domain";
import type { ReadinessDependencies } from "@shoppilot/db";
import { enterCorrelationContext, type RateLimiter } from "@shoppilot/db";

import {
  discoveryDocument,
  discoverySchema,
  openApiDocument,
} from "./catalogue-contract.js";
import {
  correlationIdFor,
  rateBucketFor,
  ratePolicyFor,
  silentLogger,
  type OperationalLogger,
  type RequestOperationalState,
} from "./operations.js";

export interface ApiDependencies {
  readiness: Pick<ReadinessDependencies, "check">;
  catalogue: CatalogueReader;
  conversation: ShoppingConversationHandler;
  commerce: CommerceService;
  payments: PaymentService;
  growth: MerchantGrowthReader;
  demoPayments?: {
    settle: (input: DemoPaymentInput) => Promise<PaymentOrder>;
  };
  operations?: {
    logger?: OperationalLogger;
    rateLimiter?: RateLimiter;
    nextCorrelationId?: () => string;
    now?: () => number;
  };
}

const productParamsSchema = z
  .object({ idOrSlug: z.string().min(1).max(160) })
  .strict();

export const buildApi = ({
  readiness,
  catalogue,
  conversation,
  commerce,
  payments,
  growth,
  demoPayments,
  operations,
}: ApiDependencies): FastifyInstance => {
  const app = Fastify({
    bodyLimit: 64 * 1_024,
    connectionTimeout: 5_000,
    keepAliveTimeout: 5_000,
    logger: false,
    requestTimeout: 15_000,
  });
  const logger = operations?.logger ?? silentLogger;
  const now = operations?.now ?? Date.now;
  const requestState = new WeakMap<object, RequestOperationalState>();

  app.addHook("onRequest", async (request, reply) => {
    const correlationId = correlationIdFor(
      request,
      operations?.nextCorrelationId,
    );
    enterCorrelationContext(correlationId);
    requestState.set(request, { correlationId, startedAt: now() });
    void reply.header("x-request-id", correlationId);

    const route = request.routeOptions.url ?? request.url.replace(/\?.*$/u, "");
    const policy = ratePolicyFor(request.method, route);
    if (policy !== null && operations?.rateLimiter !== undefined) {
      try {
        const decision = await operations.rateLimiter.consume(
          rateBucketFor(policy.name, request),
          policy.limit,
          policy.windowMs,
        );
        void reply.header("x-ratelimit-limit", policy.limit);
        void reply.header("x-ratelimit-remaining", decision.remaining);
        if (!decision.allowed) {
          void reply.header("retry-after", decision.retryAfterSeconds);
          logger.log("warn", "request_rate_limited", {
            correlationId,
            method: request.method,
            route,
            policy: policy.name,
          });
          return reply.code(429).send({
            error: "rate_limited",
            message: "Too many requests. Please retry later.",
          });
        }
      } catch {
        logger.log("error", "rate_limiter_unavailable", {
          correlationId,
          method: request.method,
          route,
          policy: policy.name,
        });
        return reply.code(503).send({
          error: "temporarily_unavailable",
          message: "Request protection is temporarily unavailable.",
        });
      }
    }

    logger.log("info", "request_started", {
      correlationId,
      method: request.method,
      route,
    });
  });

  app.addHook("onResponse", (request, reply, done) => {
    const state = requestState.get(request);
    logger.log("info", "request_completed", {
      correlationId: state?.correlationId ?? "unknown",
      durationMs:
        state === undefined ? 0 : Math.max(now() - state.startedAt, 0),
      method: request.method,
      route: request.routeOptions.url ?? request.url.replace(/\?.*$/u, ""),
      statusCode: reply.statusCode,
    });
    done();
  });

  app.setErrorHandler((error, request, reply) => {
    logger.log("error", "request_failed", {
      correlationId: requestState.get(request)?.correlationId ?? "unknown",
      errorType:
        error instanceof Error ? error.constructor.name : "UnknownError",
      method: request.method,
      route: request.routeOptions.url ?? request.url.replace(/\?.*$/u, ""),
    });
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
    if (error instanceof PaymentNotFoundError) {
      return reply.code(404).send(
        paymentErrorSchema.parse({
          error: "not_found",
          message: error.message,
        }),
      );
    }
    if (error instanceof PaymentConflictError) {
      return reply.code(409).send(
        paymentErrorSchema.parse({
          error: "conflict",
          message: error.message,
        }),
      );
    }
    if (error instanceof PaymentSignatureError) {
      return reply.code(401).send(
        paymentErrorSchema.parse({
          error: "invalid_signature",
          message: error.message,
        }),
      );
    }
    if (error instanceof PaymentProviderError) {
      return reply.code(502).send(
        paymentErrorSchema.parse({
          error: "provider_error",
          message: error.message,
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

  app.post("/v1/payment-orders", async (request, reply) => {
    const body = createPaymentOrderInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(
        paymentErrorSchema.parse({
          error: "invalid_request",
          message: "Payment order request is invalid.",
        }),
      );
    }
    return reply
      .code(201)
      .send(
        checkoutLaunchSchema.parse(
          await payments.createOrder(body.data.checkoutAttemptId),
        ),
      );
  });

  app.get("/v1/checkouts/:checkoutAttemptId", async (request, reply) => {
    const params = checkoutAttemptParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(
        paymentErrorSchema.parse({
          error: "invalid_request",
          message: "Checkout identifier is invalid.",
        }),
      );
    }
    await payments.expireTimedOut();
    const payment = await payments.getPayment(params.data.checkoutAttemptId);
    if (payment === null) throw new PaymentNotFoundError("Payment not found.");
    return paymentOrderSchema.parse(payment);
  });

  app.post("/v1/payments/callback", async (request, reply) => {
    const body = checkoutCallbackInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(
        paymentErrorSchema.parse({
          error: "invalid_request",
          message: "Checkout callback is invalid.",
        }),
      );
    }
    return paymentOrderSchema.parse(await payments.recordCallback(body.data));
  });

  app.post("/v1/payments/cancel", async (request, reply) => {
    const body = cancelPaymentInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(
        paymentErrorSchema.parse({
          error: "invalid_request",
          message: "Payment cancellation request is invalid.",
        }),
      );
    }
    return paymentOrderSchema.parse(
      await payments.cancel(body.data.checkoutAttemptId),
    );
  });

  if (demoPayments !== undefined) {
    app.post("/v1/demo/payments/settle", async (request, reply) => {
      const body = demoPaymentInputSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(
          paymentErrorSchema.parse({
            error: "invalid_request",
            message: "Demo payment request is invalid.",
          }),
        );
      }
      return paymentOrderSchema.parse(await demoPayments.settle(body.data));
    });
  }

  void app.register((webhookApp, _options, done) => {
    webhookApp.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );
    webhookApp.post("/v1/webhooks/razorpay", async (request, reply) => {
      const headers = paymentWebhookHeadersSchema.safeParse(request.headers);
      if (!headers.success || !Buffer.isBuffer(request.body)) {
        return reply.code(400).send(
          paymentErrorSchema.parse({
            error: "invalid_request",
            message: "Webhook request is invalid.",
          }),
        );
      }
      const result = await payments.processWebhook({
        eventId: headers.data["x-razorpay-event-id"],
        signature: headers.data["x-razorpay-signature"],
        rawBody: request.body,
      });
      return reply
        .code(200)
        .send({ accepted: true, duplicate: result.duplicate });
    });
    done();
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

  app.get("/v1/merchants/:merchantId/growth", async (request, reply) => {
    const params = merchantGrowthParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(
        catalogueErrorSchema.parse({
          error: "invalid_request",
          message: "Merchant identifier is invalid.",
        }),
      );
    }
    return merchantGrowthSummarySchema.parse(
      await growth.getSummary(params.data.merchantId),
    );
  });

  return app;
};
