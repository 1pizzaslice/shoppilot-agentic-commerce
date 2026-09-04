import { randomUUID } from "node:crypto";

import {
  createCatalogueDependencies,
  createCommerceDependencies,
  createConversationDependencies,
  createReadinessDependencies,
  createPaymentDependencies,
  createGrowthDependencies,
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
import { createOpenAIShoppingModel } from "./openai-model.js";
import { createRazorpayPaymentProvider } from "./razorpay-payment.js";

const environment = parseApiEnvironment(process.env);
const model = (() => {
  if (environment.MODEL_PROVIDER === "fake") {
    return createFakeShoppingModel();
  }
  if (environment.OPENAI_API_KEY === undefined) {
    throw new Error("OPENAI_API_KEY is required for the OpenAI model provider");
  }
  return createOpenAIShoppingModel({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
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
});

const shutdown = async (): Promise<void> => {
  await app.close();
  await catalogue.close();
  await conversationDependencies.close();
  await commerceDependencies.close();
  await paymentDependencies.close();
  await growthDependencies.close();
  await readiness.close();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error: unknown) {
  await catalogue.close();
  await conversationDependencies.close();
  await commerceDependencies.close();
  await paymentDependencies.close();
  await growthDependencies.close();
  await readiness.close();
  throw error;
}
