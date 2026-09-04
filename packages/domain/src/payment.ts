import { z } from "zod";

import { checkoutStateSchema } from "./commerce.js";
import { currencySchema } from "./catalogue.js";

export const providerOrderSchema = z
  .object({
    id: z.string().min(1),
    amountPaise: z.number().int().positive(),
    currency: currencySchema,
    receipt: z.string().min(1).max(40),
    status: z.enum(["created", "attempted", "paid"]),
  })
  .strict();

export const createProviderOrderInputSchema = z
  .object({
    amountPaise: z.number().int().positive(),
    currency: currencySchema,
    receipt: z.string().min(1).max(40),
    notes: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export const paymentOrderSchema = z
  .object({
    checkoutAttemptId: z.string().min(1),
    state: checkoutStateSchema.exclude(["not_created", "authorized"]),
    provider: z.enum(["fake", "razorpay"]),
    providerOrderId: z.string().min(1).nullable(),
    providerPaymentId: z.string().min(1).nullable(),
    amountPaise: z.number().int().positive(),
    currency: currencySchema,
    failureCode: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const checkoutLaunchSchema = z
  .object({
    payment: paymentOrderSchema,
    checkout: z
      .object({
        keyId: z.string().min(1),
        orderId: z.string().min(1),
        amountPaise: z.number().int().positive(),
        currency: currencySchema,
        merchantName: z.string().min(1),
        description: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const createPaymentOrderInputSchema = z
  .object({ checkoutAttemptId: z.string().min(1).max(160) })
  .strict();

export const checkoutAttemptParamsSchema = z
  .object({ checkoutAttemptId: z.string().min(1).max(160) })
  .strict();

export const checkoutCallbackInputSchema = z
  .object({
    checkoutAttemptId: z.string().min(1).max(160),
    razorpayOrderId: z.string().min(1).max(160),
    razorpayPaymentId: z.string().min(1).max(160),
    razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export const cancelPaymentInputSchema = z
  .object({ checkoutAttemptId: z.string().min(1).max(160) })
  .strict();

export const demoPaymentInputSchema = z
  .object({
    checkoutAttemptId: z.string().min(1).max(160),
    outcome: z.enum(["paid", "declined"]),
  })
  .strict();

export const paymentWebhookHeadersSchema = z
  .object({
    "x-razorpay-event-id": z.string().min(1).max(160),
    "x-razorpay-signature": z.string().min(1).max(256),
  })
  .passthrough();

export const razorpayWebhookSchema = z
  .object({
    event: z.enum([
      "order.paid",
      "payment.authorized",
      "payment.captured",
      "payment.failed",
    ]),
    payload: z
      .object({
        payment: z
          .object({
            entity: z
              .object({
                id: z.string().min(1),
                order_id: z.string().min(1),
                status: z.string().min(1),
                error_code: z.string().nullable().optional(),
              })
              .passthrough(),
          })
          .optional(),
        order: z
          .object({
            entity: z.object({ id: z.string().min(1) }).passthrough(),
          })
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const paymentErrorSchema = z
  .object({
    error: z.enum([
      "invalid_request",
      "not_found",
      "conflict",
      "invalid_signature",
      "provider_error",
    ]),
    message: z.string().min(1),
  })
  .strict();

export type ProviderOrder = z.infer<typeof providerOrderSchema>;
export type CreateProviderOrderInput = z.infer<
  typeof createProviderOrderInputSchema
>;
export type PaymentOrder = z.infer<typeof paymentOrderSchema>;
export type CheckoutLaunch = z.infer<typeof checkoutLaunchSchema>;
export type CheckoutCallbackInput = z.infer<typeof checkoutCallbackInputSchema>;
export type DemoPaymentInput = z.infer<typeof demoPaymentInputSchema>;

export interface PaymentProvider {
  readonly name: "fake" | "razorpay";
  readonly publicKeyId: string;
  createOrder: (input: CreateProviderOrderInput) => Promise<ProviderOrder>;
  verifyCheckoutSignature: (input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }) => boolean;
  verifyWebhookSignature: (rawBody: Buffer, signature: string) => boolean;
}

export interface PaymentService {
  createOrder: (checkoutAttemptId: string) => Promise<CheckoutLaunch>;
  getPayment: (checkoutAttemptId: string) => Promise<PaymentOrder | null>;
  recordCallback: (input: CheckoutCallbackInput) => Promise<PaymentOrder>;
  cancel: (checkoutAttemptId: string) => Promise<PaymentOrder>;
  expireTimedOut: () => Promise<number>;
  processWebhook: (input: {
    eventId: string;
    signature: string;
    rawBody: Buffer;
  }) => Promise<{ duplicate: boolean; payment: PaymentOrder | null }>;
}

export class PaymentNotFoundError extends Error {}
export class PaymentConflictError extends Error {}
export class PaymentSignatureError extends Error {}
export class PaymentProviderError extends Error {}
