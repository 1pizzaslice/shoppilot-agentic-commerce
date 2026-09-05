import { createHmac, timingSafeEqual } from "node:crypto";

import {
  createProviderOrderInputSchema,
  PaymentProviderError,
  providerOrderSchema,
  providerPaymentSchema,
  type PaymentProvider,
} from "@shoppilot/domain";
import { z } from "zod";

const razorpayOrderResponseSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
  receipt: z.string().min(1).max(40),
  status: z.enum(["created", "attempted", "paid"]),
});

const razorpayPaymentResponseSchema = z.object({
  id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
  status: z.enum(["created", "authorized", "captured", "failed", "refunded"]),
});

const signatureMatches = (
  secret: string,
  value: string | Buffer,
  signature: string,
): boolean => {
  const expected = createHmac("sha256", secret).update(value).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export interface RazorpayPaymentProviderOptions {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
}

export const createRazorpayPaymentProvider = (
  options: RazorpayPaymentProviderOptions,
): PaymentProvider => {
  if (!options.keyId.startsWith("rzp_test_")) {
    throw new Error("Razorpay adapter accepts test key IDs only.");
  }
  const request = options.fetch ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? "https://api.razorpay.com/v1";
  const authorization = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString("base64")}`;
  return {
    name: "razorpay",
    publicKeyId: options.keyId,
    createOrder: async (rawInput) => {
      const input = createProviderOrderInputSchema.parse(rawInput);
      let response: Response;
      try {
        response = await request(`${apiBaseUrl}/orders`, {
          method: "POST",
          headers: {
            authorization,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            amount: input.amountPaise,
            currency: input.currency,
            receipt: input.receipt,
            notes: input.notes,
          }),
          signal: AbortSignal.timeout(8_000),
        });
      } catch (error: unknown) {
        throw new PaymentProviderError(
          error instanceof Error
            ? `Razorpay order request failed: ${error.message}`
            : "Razorpay order request failed.",
        );
      }
      if (!response.ok) {
        throw new PaymentProviderError(
          `Razorpay order request returned HTTP ${String(response.status)}.`,
        );
      }
      const body = razorpayOrderResponseSchema.parse(await response.json());
      return providerOrderSchema.parse({
        id: body.id,
        amountPaise: body.amount,
        currency: body.currency,
        receipt: body.receipt,
        status: body.status,
      });
    },
    fetchPayment: async (paymentId) => {
      let response: Response;
      try {
        response = await request(
          `${apiBaseUrl}/payments/${encodeURIComponent(paymentId)}`,
          {
            method: "GET",
            headers: { authorization },
            signal: AbortSignal.timeout(8_000),
          },
        );
      } catch (error: unknown) {
        throw new PaymentProviderError(
          error instanceof Error
            ? `Razorpay payment verification failed: ${error.message}`
            : "Razorpay payment verification failed.",
        );
      }
      if (!response.ok) {
        throw new PaymentProviderError(
          `Razorpay payment verification returned HTTP ${String(response.status)}.`,
        );
      }
      let body: z.infer<typeof razorpayPaymentResponseSchema>;
      try {
        body = razorpayPaymentResponseSchema.parse(await response.json());
      } catch {
        throw new PaymentProviderError(
          "Razorpay returned an invalid payment verification response.",
        );
      }
      if (body.status === "refunded") {
        throw new PaymentProviderError(
          "Razorpay returned an unsupported refunded payment during checkout.",
        );
      }
      return providerPaymentSchema.parse({
        id: body.id,
        orderId: body.order_id,
        amountPaise: body.amount,
        currency: body.currency,
        status: body.status,
      });
    },
    verifyCheckoutSignature: ({ orderId, paymentId, signature }) =>
      signatureMatches(options.keySecret, `${orderId}|${paymentId}`, signature),
    verifyWebhookSignature: (rawBody, signature) =>
      signatureMatches(options.webhookSecret, rawBody, signature),
  };
};
