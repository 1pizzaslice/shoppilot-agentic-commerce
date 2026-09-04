import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { PaymentProviderError } from "@shoppilot/domain";

import { createRazorpayPaymentProvider } from "./razorpay-payment.js";

describe("Razorpay payment adapter", () => {
  it("maps a test-mode order and signs only on the server", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "order_test_1",
            amount: 123_400,
            currency: "INR",
            receipt: "receipt-1",
            status: "created",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pay_test_1",
            order_id: "order_test_1",
            amount: 123_400,
            currency: "INR",
            status: "captured",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const provider = createRazorpayPaymentProvider({
      keyId: "rzp_test_public",
      keySecret: "checkout-secret",
      webhookSecret: "webhook-secret",
      fetch: request,
    });
    await expect(
      provider.createOrder({
        amountPaise: 123_400,
        currency: "INR",
        receipt: "receipt-1",
        notes: { checkoutAttemptId: "attempt-1" },
      }),
    ).resolves.toEqual({
      id: "order_test_1",
      amountPaise: 123_400,
      currency: "INR",
      receipt: "receipt-1",
      status: "created",
    });
    expect(request).toHaveBeenCalledOnce();
    const [, init] = request.mock.calls[0] ?? [];
    expect(init?.body).toContain('"amount":123400');
    expect(init?.body).not.toContain("checkout-secret");

    const checkoutSignature = createHmac("sha256", "checkout-secret")
      .update("order_test_1|pay_test_1")
      .digest("hex");
    expect(
      provider.verifyCheckoutSignature({
        orderId: "order_test_1",
        paymentId: "pay_test_1",
        signature: checkoutSignature,
      }),
    ).toBe(true);
    await expect(provider.fetchPayment("pay_test_1")).resolves.toEqual({
      id: "pay_test_1",
      orderId: "order_test_1",
      amountPaise: 123_400,
      currency: "INR",
      status: "captured",
    });
    expect(request).toHaveBeenCalledTimes(2);
    const rawBody = Buffer.from('{"event":"payment.captured"}');
    const webhookSignature = createHmac("sha256", "webhook-secret")
      .update(rawBody)
      .digest("hex");
    expect(provider.verifyWebhookSignature(rawBody, webhookSignature)).toBe(
      true,
    );
  });

  it("rejects live keys and surfaces provider failures", async () => {
    expect(() =>
      createRazorpayPaymentProvider({
        keyId: ["rzp", "live", "forbidden"].join("_"),
        keySecret: "secret",
        webhookSecret: "secret",
      }),
    ).toThrow("test key IDs only");
    const provider = createRazorpayPaymentProvider({
      keyId: "rzp_test_public",
      keySecret: "secret",
      webhookSecret: "secret",
      fetch: () => Promise.resolve(new Response("no", { status: 503 })),
    });
    await expect(
      provider.createOrder({
        amountPaise: 100,
        currency: "INR",
        receipt: "receipt",
        notes: {},
      }),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});
