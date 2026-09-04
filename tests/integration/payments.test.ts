import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { buildApi } from "../../apps/api/src/app.js";
import {
  createPostgresCatalogueReader,
  createPostgresCommerceService,
  createPostgresPaymentService,
  migrateCatalogue,
  seedCatalogue,
} from "@shoppilot/db";
import {
  checkoutLaunchSchema,
  paymentOrderSchema,
  PaymentProviderError,
  PaymentSignatureError,
} from "@shoppilot/domain";
import {
  createDeterministicIdGenerator,
  createFakePaymentProvider,
  createUnavailableGrowthReader,
} from "../../packages/testkit/src/index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot";
const pool = new Pool({ connectionString: databaseUrl, max: 12 });
const ids = createDeterministicIdGenerator(`payments-${randomUUID()}`);
let currentTime = new Date("2026-09-04T12:00:00.000Z");
const commerce = createPostgresCommerceService(pool, {
  nextId: ids.next,
  now: () => new Date(currentTime),
});

beforeAll(async () => {
  await migrateCatalogue(pool);
  await seedCatalogue(pool);
});

afterAll(async () => {
  await pool.end();
});

const authorize = async () => {
  const cart = await commerce.createCart({
    merchantId: "stepup-shoes",
    userId: ids.next(),
    currency: "INR",
  });
  const withLine = await commerce.addPrimaryLine(cart.id, {
    variantId: "shoe-01-2-8",
    quantity: 1,
    expectedVersion: cart.version,
  });
  const { cart: reviewed, snapshot } = await commerce.reviewCart(
    cart.id,
    withLine.version,
  );
  const { approval } = await commerce.approveCart(cart.id, {
    expectedVersion: reviewed.version,
    snapshotId: snapshot.id,
    cartHash: snapshot.hash,
    userId: reviewed.userId,
  });
  const authorization = await commerce.authorizeCheckout({
    cartId: cart.id,
    approvalId: approval.id,
  });
  expect(authorization.attempt).not.toBeNull();
  if (authorization.attempt === null) throw new Error("Expected authorization");
  return authorization.attempt;
};

const webhookBody = (
  event: "payment.authorized" | "payment.captured" | "payment.failed",
  orderId: string,
  paymentId: string,
) =>
  Buffer.from(
    JSON.stringify({
      event,
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            status:
              event === "payment.failed"
                ? "failed"
                : event === "payment.captured"
                  ? "captured"
                  : "authorized",
            ...(event === "payment.failed"
              ? { error_code: "BAD_REQUEST_ERROR" }
              : {}),
          },
        },
      },
    }),
  );

describe("fake-provider payment lifecycle", () => {
  it("runs an authorized checkout to paid through the HTTP boundary", async () => {
    const provider = createFakePaymentProvider({
      paymentStatus: "authorized",
    });
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const app = buildApi({
      readiness: { check: () => Promise.resolve([]) },
      catalogue: createPostgresCatalogueReader(pool),
      conversation: {
        start: () => Promise.reject(new Error("not used")),
        continue: () => Promise.reject(new Error("not used")),
      },
      commerce,
      payments,
      growth: createUnavailableGrowthReader(),
    });
    try {
      const attempt = await authorize();
      const launchResponse = await app.inject({
        method: "POST",
        url: "/v1/payment-orders",
        payload: { checkoutAttemptId: attempt.id },
      });
      expect(launchResponse.statusCode).toBe(201);
      const launch = checkoutLaunchSchema.parse(launchResponse.json());
      const orderId = launch.payment.providerOrderId;
      if (orderId === null) throw new Error("Expected provider order");
      const paymentId = ids.next();
      const callback = await app.inject({
        method: "POST",
        url: "/v1/payments/callback",
        payload: {
          checkoutAttemptId: attempt.id,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: provider.checkoutSignature(orderId, paymentId),
        },
      });
      expect(paymentOrderSchema.parse(callback.json()).state).toBe(
        "payment_pending",
      );
      const captured = webhookBody("payment.captured", orderId, paymentId);
      const webhook = await app.inject({
        method: "POST",
        url: "/v1/webhooks/razorpay",
        headers: {
          "content-type": "application/json",
          "x-razorpay-event-id": ids.next(),
          "x-razorpay-signature": provider.webhookSignature(captured),
        },
        payload: captured,
      });
      expect(webhook.statusCode).toBe(200);
      const status = await app.inject({
        method: "GET",
        url: `/v1/checkouts/${attempt.id}`,
      });
      expect(paymentOrderSchema.parse(status.json()).state).toBe("paid");
      const timeline = await app.inject({
        method: "GET",
        url: `/v1/carts/${attempt.cartId}/audit`,
      });
      expect(timeline.statusCode).toBe(200);
      expect(JSON.stringify(timeline.json())).toContain(
        "provider_order_created",
      );
      expect(JSON.stringify(timeline.json())).toContain(
        "checkout_signature_verified",
      );
      expect(JSON.stringify(timeline.json())).toContain(
        "payment_webhook_processed",
      );
    } finally {
      await app.close();
    }
  });

  it("creates one order, verifies callback evidence, and reaches paid", async () => {
    const provider = createFakePaymentProvider({
      paymentStatus: "authorized",
    });
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const attempt = await authorize();
    const launch = await payments.createOrder(attempt.id);
    expect(launch.checkout).toMatchObject({
      amountPaise: 234_900,
      currency: "INR",
    });
    expect(provider.createdOrders).toHaveLength(1);

    const retried = await payments.createOrder(attempt.id);
    expect(retried.checkout?.orderId).toBe(launch.checkout?.orderId);
    expect(provider.createdOrders).toHaveLength(1);

    const orderId = launch.payment.providerOrderId;
    expect(orderId).not.toBeNull();
    if (orderId === null) return;
    const paymentId = `pay_${ids.next()}`;
    const callback = await payments.recordCallback({
      checkoutAttemptId: attempt.id,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: provider.checkoutSignature(orderId, paymentId),
    });
    expect(callback.state).toBe("payment_pending");

    const captured = webhookBody("payment.captured", orderId, paymentId);
    const result = await payments.processWebhook({
      eventId: ids.next(),
      signature: provider.webhookSignature(captured),
      rawBody: captured,
    });
    expect(result.payment?.state).toBe("paid");
  });

  it("confirms a captured callback through the provider status API", async () => {
    const provider = createFakePaymentProvider();
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const attempt = await authorize();
    const launch = await payments.createOrder(attempt.id);
    const orderId = launch.payment.providerOrderId;
    if (orderId === null) throw new Error("Expected provider order");
    const paymentId = `pay_${ids.next()}`;

    const payment = await payments.recordCallback({
      checkoutAttemptId: attempt.id,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: provider.checkoutSignature(orderId, paymentId),
    });

    expect(payment).toMatchObject({
      state: "paid",
      providerPaymentId: paymentId,
    });
    const audit = await pool.query<{ count: string }>(
      `SELECT count(*) FROM audit_events
       WHERE entity_id = $1 AND event_type = 'provider_payment_status_verified'`,
      [attempt.id],
    );
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("serializes concurrent order creation without a second provider call", async () => {
    const provider = createFakePaymentProvider();
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const attempt = await authorize();
    const launches = await Promise.all([
      payments.createOrder(attempt.id),
      payments.createOrder(attempt.id),
    ]);
    expect(provider.createdOrders).toHaveLength(1);
    const launchedOrderIds = new Set(
      launches.flatMap(({ checkout }) =>
        checkout === null ? [] : [checkout.orderId],
      ),
    );
    expect(launchedOrderIds.size).toBe(1);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM payment_orders WHERE checkout_attempt_id = $1",
      [attempt.id],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("deduplicates webhooks and ignores older evidence delivered after paid", async () => {
    const provider = createFakePaymentProvider();
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const attempt = await authorize();
    const launch = await payments.createOrder(attempt.id);
    const orderId = launch.payment.providerOrderId;
    if (orderId === null) throw new Error("Expected provider order");
    const captured = webhookBody("payment.captured", orderId, ids.next());
    const eventId = ids.next();
    const signature = provider.webhookSignature(captured);
    expect(
      (await payments.processWebhook({ eventId, signature, rawBody: captured }))
        .payment?.state,
    ).toBe("paid");
    expect(
      await payments.processWebhook({ eventId, signature, rawBody: captured }),
    ).toEqual({ duplicate: true, payment: null });

    const authorized = webhookBody("payment.authorized", orderId, ids.next());
    const oldEvidence = await payments.processWebhook({
      eventId: ids.next(),
      signature: provider.webhookSignature(authorized),
      rawBody: authorized,
    });
    expect(oldEvidence.payment?.state).toBe("paid");
  });

  it("records a decline as failed", async () => {
    const provider = createFakePaymentProvider();
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const attempt = await authorize();
    const launch = await payments.createOrder(attempt.id);
    const orderId = launch.payment.providerOrderId;
    if (orderId === null) throw new Error("Expected provider order");
    const declined = webhookBody("payment.failed", orderId, ids.next());
    const result = await payments.processWebhook({
      eventId: ids.next(),
      signature: provider.webhookSignature(declined),
      rawBody: declined,
    });
    expect(result.payment).toMatchObject({
      state: "failed",
      failureCode: "BAD_REQUEST_ERROR",
    });
  });

  it("records checkout dismissal as cancellation", async () => {
    const provider = createFakePaymentProvider();
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const attempt = await authorize();
    await payments.createOrder(attempt.id);
    expect((await payments.cancel(attempt.id)).state).toBe("cancelled");
  });

  it("keeps an uncertain provider call single-shot and expires it", async () => {
    const provider = createFakePaymentProvider({
      createOrder: () => Promise.reject(new Error("timed out")),
    });
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
      creationTimeoutMs: 1_000,
    });
    const attempt = await authorize();
    await expect(payments.createOrder(attempt.id)).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
    expect((await payments.createOrder(attempt.id)).checkout).toBeNull();
    expect(provider.createdOrders).toHaveLength(1);
    currentTime = new Date(currentTime.valueOf() + 1_001);
    expect(await payments.expireTimedOut()).toBe(1);
    expect((await payments.getPayment(attempt.id))?.state).toBe("expired");
  });

  it("rejects invalid callback and webhook signatures", async () => {
    const provider = createFakePaymentProvider();
    const payments = createPostgresPaymentService(pool, provider, {
      nextId: ids.next,
      now: () => new Date(currentTime),
    });
    const attempt = await authorize();
    const launch = await payments.createOrder(attempt.id);
    const orderId = launch.payment.providerOrderId;
    if (orderId === null) throw new Error("Expected provider order");
    await expect(
      payments.recordCallback({
        checkoutAttemptId: attempt.id,
        razorpayOrderId: orderId,
        razorpayPaymentId: ids.next(),
        razorpaySignature: "0".repeat(64),
      }),
    ).rejects.toBeInstanceOf(PaymentSignatureError);
    const callbackAudit = await pool.query<{ count: string }>(
      `SELECT count(*) FROM audit_events
       WHERE entity_id = $1 AND event_type = 'checkout_signature_rejected'`,
      [attempt.id],
    );
    expect(callbackAudit.rows[0]?.count).toBe("1");
    const captured = webhookBody("payment.captured", orderId, ids.next());
    await expect(
      payments.processWebhook({
        eventId: ids.next(),
        signature: "0".repeat(64),
        rawBody: captured,
      }),
    ).rejects.toBeInstanceOf(PaymentSignatureError);
  });
});
