import { createHmac } from "node:crypto";

import {
  createProviderOrderInputSchema,
  providerOrderSchema,
  providerPaymentSchema,
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
  fetchPayment?: PaymentProvider["fetchPayment"];
  paymentStatus?: "created" | "authorized" | "captured" | "failed";
}): FakePaymentProvider => {
  const keySecret = options?.keySecret ?? "fake-checkout-secret";
  const webhookSecret = options?.webhookSecret ?? "fake-webhook-secret";
  const createdOrders: FakePaymentProvider["createdOrders"] = [];
  const paymentOrderIds = new Map<string, string>();
  const providerOrders = new Map<
    string,
    Awaited<ReturnType<PaymentProvider["createOrder"]>>
  >();
  return {
    name: "fake",
    publicKeyId: "rzp_test_fake_public",
    createdOrders,
    createOrder: async (rawInput) => {
      const input = createProviderOrderInputSchema.parse(rawInput);
      createdOrders.push(input);
      const order =
        options?.createOrder === undefined
          ? providerOrderSchema.parse({
              id: `order_fake_${input.receipt}`,
              amountPaise: input.amountPaise,
              currency: input.currency,
              receipt: input.receipt,
              status: "created",
            })
          : await options.createOrder(input);
      providerOrders.set(order.id, order);
      return order;
    },
    fetchPayment: async (paymentId) => {
      if (options?.fetchPayment !== undefined) {
        return options.fetchPayment(paymentId);
      }
      const orderId = paymentOrderIds.get(paymentId);
      if (orderId === undefined) {
        throw new Error("Fake payment has no matching checkout signature.");
      }
      const order = providerOrders.get(orderId);
      if (order === undefined) throw new Error("Fake payment has no order.");
      return providerPaymentSchema.parse({
        id: paymentId,
        orderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        status: options?.paymentStatus ?? "captured",
      });
    },
    checkoutSignature: (orderId, paymentId) => {
      paymentOrderIds.set(paymentId, orderId);
      return createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
    },
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
