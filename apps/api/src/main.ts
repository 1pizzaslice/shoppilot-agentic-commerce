import { randomUUID } from "node:crypto";

import {
  createCatalogueDependencies,
  createCommerceDependencies,
  createConversationDependencies,
  createReadinessDependencies,
  createPaymentDependencies,
  createGrowthDependencies,
  createRedisRateLimiter,
} from "@shoppilot/db";
import {
  createShoppingConversationHandler,
  parseApiEnvironment,
  PaymentConflictError,
  PaymentNotFoundError,
} from "@shoppilot/domain";
import {
  createFakePaymentProvider,
  createFakeShoppingModel,
} from "@shoppilot/testkit";

import { buildApi } from "./app.js";
import { createAnthropicShoppingModel } from "./anthropic-model.js";
import { createJsonLogger } from "./operations.js";
import { createRazorpayPaymentProvider } from "./razorpay-payment.js";

const environment = parseApiEnvironment(process.env);
const logger = createJsonLogger();
const rateLimiter = createRedisRateLimiter(environment.REDIS_URL);
const model = (() => {
  if (environment.MODEL_PROVIDER === "fake") {
    return createFakeShoppingModel();
  }
  if (environment.ANTHROPIC_API_KEY === undefined) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for the Anthropic model provider",
    );
  }
  return createAnthropicShoppingModel({
    apiKey: environment.ANTHROPIC_API_KEY,
    model: environment.ANTHROPIC_MODEL,
  });
})();
const readiness = createReadinessDependencies({
  databaseUrl: environment.DATABASE_URL,
  redisUrl: environment.REDIS_URL,
});
const catalogue = createCatalogueDependencies(environment.DATABASE_URL);
const conversationDependencies = createConversationDependencies(
  environment.DATABASE_URL,
);
const commerceDependencies = createCommerceDependencies(
  environment.DATABASE_URL,
);
const fakePaymentProvider =
  environment.PAYMENT_PROVIDER === "fake" ? createFakePaymentProvider() : null;
const paymentProvider = (() => {
  if (fakePaymentProvider !== null) return fakePaymentProvider;
  if (
    environment.RAZORPAY_KEY_ID === undefined ||
    environment.RAZORPAY_KEY_SECRET === undefined ||
    environment.RAZORPAY_WEBHOOK_SECRET === undefined
  ) {
    throw new Error("Razorpay test credentials are required.");
  }
  return createRazorpayPaymentProvider({
    keyId: environment.RAZORPAY_KEY_ID,
    keySecret: environment.RAZORPAY_KEY_SECRET,
    webhookSecret: environment.RAZORPAY_WEBHOOK_SECRET,
  });
})();
const paymentDependencies = createPaymentDependencies(
  environment.DATABASE_URL,
  paymentProvider,
);
const demoPayments =
  fakePaymentProvider === null
    ? undefined
    : {
        settle: async (input: {
          checkoutAttemptId: string;
          outcome: "paid" | "declined";
        }) => {
          const payment = await paymentDependencies.service.getPayment(
            input.checkoutAttemptId,
          );
          if (payment === null)
            throw new PaymentNotFoundError("Payment not found.");
          if (payment.providerOrderId === null) {
            throw new PaymentConflictError("Payment order is not ready.");
          }
          const event =
            input.outcome === "paid" ? "payment.captured" : "payment.failed";
          const rawBody = Buffer.from(
            JSON.stringify({
              event,
              payload: {
                payment: {
                  entity: {
                    id: `pay_fake_${input.checkoutAttemptId}`,
                    order_id: payment.providerOrderId,
                    status: input.outcome === "paid" ? "captured" : "failed",
                    error_code:
                      input.outcome === "declined"
                        ? "demo_card_declined"
                        : null,
                  },
                },
              },
            }),
          );
          const result = await paymentDependencies.service.processWebhook({
            eventId: `evt_demo_${randomUUID()}`,
            signature: fakePaymentProvider.webhookSignature(rawBody),
            rawBody,
          });
          if (result.payment === null) {
            throw new PaymentConflictError(
              "Demo payment could not be settled.",
            );
          }
          return result.payment;
        },
      };
const growthDependencies = createGrowthDependencies(environment.DATABASE_URL);
const conversation = createShoppingConversationHandler({
  model,
  catalogue,
  store: conversationDependencies.store,
  nextId: randomUUID,
});
const app = buildApi({
  readiness,
  catalogue,
  conversation,
  commerce: commerceDependencies.service,
  payments: paymentDependencies.service,
  growth: growthDependencies.reader,
  ...(demoPayments === undefined ? {} : { demoPayments }),
  operations: { logger, rateLimiter },
});

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.log("info", "shutdown_started");
  const closeDependencies = async () => {
    await app.close();
    await Promise.all([
      catalogue.close(),
      conversationDependencies.close(),
      commerceDependencies.close(),
      paymentDependencies.close(),
      growthDependencies.close(),
      rateLimiter.close(),
      readiness.close(),
    ]);
  };
  await Promise.race([
    closeDependencies(),
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error("Shutdown exceeded 10 seconds")),
        10_000,
      ),
    ),
  ]);
  logger.log("info", "shutdown_completed");
};

const handleSignal = (): void => {
  void shutdown().catch(() => {
    logger.log("error", "shutdown_failed");
    process.exitCode = 1;
  });
};
process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error: unknown) {
  await catalogue.close();
  await conversationDependencies.close();
  await commerceDependencies.close();
  await paymentDependencies.close();
  await growthDependencies.close();
  await rateLimiter.close();
  await readiness.close();
  throw error;
}
