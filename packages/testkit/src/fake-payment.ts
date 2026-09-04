import { createHmac } from "node:crypto";

import {
  createProviderOrderInputSchema,
  providerOrderSchema,
  type PaymentProvider,
} from "@shoppilot/domain";

export interface FakePaymentProvider extends PaymentProvider {
  createdOrders: Array<ReturnType<typeof createProviderOrderInputSchema.parse>>;
  checkoutSignature: (orderId: string, paymentId: string) => string;
  webhookSignature: (rawBody: Buffer) => string;
}

export const createFakePaymentProvider = (options?: {
  keySecret?: string;
  webhookSecret?: string;
  createOrder?: PaymentProvider["createOrder"];
}): FakePaymentProvider => {
  const keySecret = options?.keySecret ?? "fake-checkout-secret";
  const webhookSecret = options?.webhookSecret ?? "fake-webhook-secret";
  const createdOrders: FakePaymentProvider["createdOrders"] = [];
  return {
    name: "fake",
    publicKeyId: "rzp_test_fake_public",
    createdOrders,
    createOrder: async (rawInput) => {
      const input = createProviderOrderInputSchema.parse(rawInput);
      createdOrders.push(input);
      if (options?.createOrder !== undefined) {
        return options.createOrder(input);
      }
      return providerOrderSchema.parse({
        id: `order_fake_${input.receipt}`,
        amountPaise: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt,
        status: "created",
      });
    },
    checkoutSignature: (orderId, paymentId) =>
      createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex"),
    webhookSignature: (rawBody) =>
      createHmac("sha256", webhookSecret).update(rawBody).digest("hex"),
    verifyCheckoutSignature: ({ orderId, paymentId, signature }) =>
      signature ===
      createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex"),
    verifyWebhookSignature: (rawBody, signature) =>
      signature ===
      createHmac("sha256", webhookSecret).update(rawBody).digest("hex"),
  };
};
