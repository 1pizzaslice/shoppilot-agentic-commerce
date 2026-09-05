import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import {
  checkoutCallbackInputSchema,
  checkoutLaunchSchema,
  paymentOrderSchema,
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentProviderError,
  PaymentSignatureError,
  razorpayWebhookSchema,
  redactAuditMetadata,
  transitionCheckoutState,
  type CheckoutCallbackInput,
  type CheckoutLaunch,
  type CheckoutState,
  type PaymentOrder,
  type PaymentProvider,
  type ProviderPayment,
  type PaymentService,
} from "@shoppilot/domain";
import { createRuntimePool, currentCorrelationId } from "./runtime.js";

const rowSchema = z.object({
  checkout_attempt_id: z.string(),
  provider: z.string(),
  provider_order_id: z.string().nullable(),
  provider_payment_id: z.string().nullable(),
  amount_paise: z.number().int(),
  currency: z.literal("INR"),
  state: z.string(),
  failure_code: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

const claimSchema = z.object({
  attempt_id: z.string(),
  cart_id: z.string(),
  state: z.string(),
  total_paise: z.number().int().positive(),
  currency: z.literal("INR"),
});

const eventIdentitySchema = z.object({
  orderId: z.string(),
  paymentId: z.string().nullable(),
  failureCode: z.string().nullable(),
});

const toPayment = (raw: unknown): PaymentOrder => {
  const row = rowSchema.parse(raw);
  return paymentOrderSchema.parse({
    checkoutAttemptId: row.checkout_attempt_id,
    state: row.state,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    providerPaymentId: row.provider_payment_id,
    amountPaise: row.amount_paise,
    currency: row.currency,
    failureCode: row.failure_code,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
};

const withTransaction = async <T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const appendAudit = async (
  client: PoolClient,
  nextId: () => string,
  attemptId: string,
  eventType: string,
  outcome: "completed" | "allowed" | "rejected" | "invalidated",
  metadata: Readonly<Record<string, string | number | boolean | null>>,
): Promise<void> => {
  await client.query(
    `INSERT INTO audit_events
       (id, entity_type, entity_id, event_type, outcome, metadata, correlation_id)
     VALUES ($1, 'checkout', $2, $3, $4, $5::jsonb, $6)`,
    [
      nextId(),
      attemptId,
      eventType,
      outcome,
      JSON.stringify(redactAuditMetadata(metadata)),
      currentCorrelationId(),
    ],
  );
};

const appendWebhookAudit = (
  client: PoolClient,
  nextId: () => string,
  eventId: string,
  eventType: string,
  outcome: "completed" | "rejected",
  metadata: Readonly<Record<string, string | number | boolean | null>>,
): Promise<void> =>
  client
    .query(
      `INSERT INTO audit_events
         (id, entity_type, entity_id, event_type, outcome, metadata, correlation_id)
       VALUES ($1, 'webhook', $2, $3, $4, $5::jsonb, $6)`,
      [
        nextId(),
        eventId,
        eventType,
        outcome,
        JSON.stringify(redactAuditMetadata(metadata)),
        currentCorrelationId(),
      ],
    )
    .then(() => undefined);

const readPayment = async (
  client: PoolClient,
  attemptId: string,
  lock = false,
): Promise<PaymentOrder | null> => {
  const result = await client.query(
    `SELECT * FROM payment_orders WHERE checkout_attempt_id = $1${lock ? " FOR UPDATE" : ""}`,
    [attemptId],
  );
  return result.rows[0] === undefined ? null : toPayment(result.rows[0]);
};

const eventIdentity = (event: z.infer<typeof razorpayWebhookSchema>) => {
  const payment = event.payload.payment?.entity;
  const order = event.payload.order?.entity;
  return eventIdentitySchema.parse({
    orderId: payment?.order_id ?? order?.id,
    paymentId: payment?.id ?? null,
    failureCode: payment?.error_code ?? null,
  });
};

const webhookState = (
  eventType: z.infer<typeof razorpayWebhookSchema>["event"],
): CheckoutState => {
  if (eventType === "payment.failed") return "failed";
  if (eventType === "payment.authorized") return "payment_pending";
  return "paid";
};

export interface PaymentRepositoryOptions {
  nextId?: () => string;
  now?: () => Date;
  creationTimeoutMs?: number;
}

export const createPostgresPaymentService = (
  pool: Pool,
  provider: PaymentProvider,
  options: PaymentRepositoryOptions = {},
): PaymentService => {
  const nextId = options.nextId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const creationTimeoutMs = options.creationTimeoutMs ?? 30_000;
  const checkoutFor = (payment: PaymentOrder) =>
    payment.providerOrderId !== null &&
    ["created", "payment_pending"].includes(payment.state)
      ? {
          keyId: provider.publicKeyId,
          orderId: payment.providerOrderId,
          amountPaise: payment.amountPaise,
          currency: payment.currency,
          merchantName: "StepUp Shoes",
          description: "ShopPilot approved cart",
        }
      : null;

  const reconcileProviderPayment = async (
    attemptId: string,
    evidence: ProviderPayment,
    source: "checkout_callback" | "status_poll",
  ): Promise<PaymentOrder> =>
    withTransaction(pool, async (client) => {
      await client.query(
        "SELECT id FROM checkout_attempts WHERE id = $1 FOR UPDATE",
        [attemptId],
      );
      const payment = await readPayment(client, attemptId, true);
      if (payment === null)
        throw new PaymentNotFoundError("Payment not found.");
      if (
        payment.providerOrderId !== evidence.orderId ||
        evidence.id !== payment.providerPaymentId ||
        payment.amountPaise !== evidence.amountPaise ||
        payment.currency !== evidence.currency
      ) {
        await appendAudit(
          client,
          nextId,
          attemptId,
          "provider_payment_status_rejected",
          "rejected",
          { source, providerStatus: evidence.status },
        );
        throw new PaymentConflictError(
          "Razorpay payment evidence does not match the approved order.",
        );
      }
      const nextState: CheckoutState =
        evidence.status === "captured"
          ? "paid"
          : evidence.status === "failed"
            ? "failed"
            : "payment_pending";
      if (payment.state === "paid") return payment;
      if (payment.state === nextState) return payment;
      if (
        ["failed", "expired", "cancelled"].includes(payment.state) &&
        nextState !== "paid"
      ) {
        return payment;
      }
      transitionCheckoutState(payment.state, nextState);
      const updated = await client.query(
        `UPDATE payment_orders SET state = $2, failure_code = $3, updated_at = $4
         WHERE checkout_attempt_id = $1 RETURNING *`,
        [
          attemptId,
          nextState,
          nextState === "failed" ? "provider_reported_failed" : null,
          now(),
        ],
      );
      await client.query(
        "UPDATE checkout_attempts SET state = $2 WHERE id = $1",
        [attemptId, nextState],
      );
      await appendAudit(
        client,
        nextId,
        attemptId,
        "provider_payment_status_verified",
        "completed",
        { source, providerStatus: evidence.status, nextState },
      );
      return toPayment(updated.rows[0]);
    });

  return {
    createOrder: async (attemptId): Promise<CheckoutLaunch> => {
      const claim = await withTransaction(pool, async (client) => {
        const attemptResult = await client.query(
          `SELECT ca.id AS attempt_id, ca.cart_id, ca.state,
                  cs.total_paise, cs.currency
           FROM checkout_attempts ca
           JOIN approvals a ON a.id = ca.approval_id
           JOIN checkout_snapshots cs ON cs.id = a.snapshot_id
           WHERE ca.id = $1 FOR UPDATE OF ca`,
          [attemptId],
        );
        if (attemptResult.rows[0] === undefined) {
          throw new PaymentNotFoundError("Checkout authorization not found.");
        }
        const attempt = claimSchema.parse(attemptResult.rows[0]);
        const existing = await readPayment(client, attemptId, true);
        if (existing !== null) return { existing, attempt: null };
        if (attempt.state !== "authorized") {
          throw new PaymentConflictError(
            "Checkout authorization has already been consumed.",
          );
        }
        transitionCheckoutState("authorized", "creating");
        const claimedAt = now();
        const inserted = await client.query(
          `INSERT INTO payment_orders
             (checkout_attempt_id, provider, amount_paise, currency, state,
              created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'creating', $5, $5)
           RETURNING *`,
          [
            attemptId,
            provider.name,
            attempt.total_paise,
            attempt.currency,
            claimedAt,
          ],
        );
        await client.query(
          "UPDATE checkout_attempts SET state = 'creating' WHERE id = $1",
          [attemptId],
        );
        await appendAudit(
          client,
          nextId,
          attemptId,
          "provider_order_creation_started",
          "allowed",
          {
            cartId: attempt.cart_id,
            amountPaise: attempt.total_paise,
            provider: provider.name,
          },
        );
        return {
          existing: null,
          attempt,
          payment: toPayment(inserted.rows[0]),
        };
      });

      if (claim.existing !== null) {
        return checkoutLaunchSchema.parse({
          payment: claim.existing,
          checkout: checkoutFor(claim.existing),
        });
      }
      if (claim.attempt === null) {
        throw new PaymentConflictError("Payment order claim was not created.");
      }
      let providerOrder;
      try {
        providerOrder = await provider.createOrder({
          amountPaise: claim.attempt.total_paise,
          currency: claim.attempt.currency,
          receipt: `sp_${createHash("sha256")
            .update(claim.attempt.attempt_id)
            .digest("hex")
            .slice(0, 32)}`,
          notes: { checkoutAttemptId: claim.attempt.attempt_id },
        });
      } catch (error: unknown) {
        await withTransaction(pool, async (client) => {
          await appendAudit(
            client,
            nextId,
            attemptId,
            "provider_order_creation_uncertain",
            "rejected",
            { provider: provider.name, retrySuppressed: true },
          );
        });
        if (error instanceof PaymentProviderError) throw error;
        throw new PaymentProviderError(
          "Payment provider order creation failed.",
        );
      }
      if (
        providerOrder.amountPaise !== claim.attempt.total_paise ||
        providerOrder.currency !== claim.attempt.currency
      ) {
        throw new PaymentProviderError(
          "Payment provider returned an order with mismatched money fields.",
        );
      }
      const payment = await withTransaction(pool, async (client) => {
        await client.query(
          "SELECT id FROM checkout_attempts WHERE id = $1 FOR UPDATE",
          [attemptId],
        );
        transitionCheckoutState("creating", "created");
        const result = await client.query(
          `UPDATE payment_orders
           SET provider_order_id = $2, state = 'created', updated_at = $3
           WHERE checkout_attempt_id = $1 AND state = 'creating'
           RETURNING *`,
          [attemptId, providerOrder.id, now()],
        );
        if (result.rows[0] === undefined) {
          throw new PaymentConflictError(
            "Payment order state changed concurrently.",
          );
        }
        await client.query(
          "UPDATE checkout_attempts SET state = 'created' WHERE id = $1",
          [attemptId],
        );
        await appendAudit(
          client,
          nextId,
          attemptId,
          "provider_order_created",
          "completed",
          { provider: provider.name, providerOrderId: providerOrder.id },
        );
        return toPayment(result.rows[0]);
      });
      return checkoutLaunchSchema.parse({
        payment,
        checkout: {
          keyId: provider.publicKeyId,
          orderId: providerOrder.id,
          amountPaise: providerOrder.amountPaise,
          currency: providerOrder.currency,
          merchantName: "StepUp Shoes",
          description: "ShopPilot approved cart",
        },
      });
    },

    getPayment: async (attemptId) => {
      const payment = await withTransaction(pool, (client) =>
        readPayment(client, attemptId),
      );
      if (
        payment?.state !== "payment_pending" ||
        payment.providerPaymentId === null
      ) {
        return payment;
      }
      try {
        const evidence = await provider.fetchPayment(payment.providerPaymentId);
        return reconcileProviderPayment(attemptId, evidence, "status_poll");
      } catch (error: unknown) {
        if (error instanceof PaymentProviderError) return payment;
        throw error;
      }
    },

    recordCallback: async (rawInput: CheckoutCallbackInput) => {
      const input = checkoutCallbackInputSchema.parse(rawInput);
      const current = await withTransaction(pool, (client) =>
        readPayment(client, input.checkoutAttemptId),
      );
      if (current === null)
        throw new PaymentNotFoundError("Payment not found.");
      if (current.providerOrderId !== input.razorpayOrderId) {
        throw new PaymentConflictError("Checkout order does not match.");
      }
      if (
        !provider.verifyCheckoutSignature({
          orderId: input.razorpayOrderId,
          paymentId: input.razorpayPaymentId,
          signature: input.razorpaySignature,
        })
      ) {
        await withTransaction(pool, (client) =>
          appendAudit(
            client,
            nextId,
            current.checkoutAttemptId,
            "checkout_signature_rejected",
            "rejected",
            { providerOrderId: input.razorpayOrderId },
          ),
        );
        throw new PaymentSignatureError("Checkout signature is invalid.");
      }
      const pending = await withTransaction(pool, async (client) => {
        const payment = await readPayment(
          client,
          input.checkoutAttemptId,
          true,
        );
        if (payment === null)
          throw new PaymentNotFoundError("Payment not found.");
        if (payment.providerOrderId !== input.razorpayOrderId) {
          throw new PaymentConflictError("Checkout order does not match.");
        }
        if (["failed", "expired", "cancelled"].includes(payment.state)) {
          throw new PaymentConflictError("Payment is already terminal.");
        }
        if (payment.state === "paid") return payment;
        if (payment.state === "payment_pending") {
          if (payment.providerPaymentId === input.razorpayPaymentId) {
            return payment;
          }
          throw new PaymentConflictError(
            "Checkout callback does not match recorded payment evidence.",
          );
        }
        transitionCheckoutState(payment.state, "payment_pending");
        const updated = await client.query(
          `UPDATE payment_orders SET state = 'payment_pending',
             provider_payment_id = $2, updated_at = $3
           WHERE checkout_attempt_id = $1 RETURNING *`,
          [payment.checkoutAttemptId, input.razorpayPaymentId, now()],
        );
        await client.query(
          "UPDATE checkout_attempts SET state = 'payment_pending' WHERE id = $1",
          [payment.checkoutAttemptId],
        );
        await appendAudit(
          client,
          nextId,
          payment.checkoutAttemptId,
          "checkout_signature_verified",
          "completed",
          { providerOrderId: input.razorpayOrderId },
        );
        return toPayment(updated.rows[0]);
      });
      if (pending.state === "paid") return pending;
      try {
        const evidence = await provider.fetchPayment(input.razorpayPaymentId);
        return await reconcileProviderPayment(
          input.checkoutAttemptId,
          evidence,
          "checkout_callback",
        );
      } catch (error: unknown) {
        if (error instanceof PaymentProviderError) return pending;
        throw error;
      }
    },

    cancel: (attemptId) =>
      withTransaction(pool, async (client) => {
        const payment = await readPayment(client, attemptId, true);
        if (payment === null)
          throw new PaymentNotFoundError("Payment not found.");
        if (["paid", "failed", "expired"].includes(payment.state)) {
          throw new PaymentConflictError("Payment is already terminal.");
        }
        if (payment.state === "cancelled") return payment;
        transitionCheckoutState(payment.state, "cancelled");
        const updated = await client.query(
          "UPDATE payment_orders SET state = 'cancelled', updated_at = $2 WHERE checkout_attempt_id = $1 RETURNING *",
          [attemptId, now()],
        );
        await client.query(
          "UPDATE checkout_attempts SET state = 'cancelled' WHERE id = $1",
          [attemptId],
        );
        await appendAudit(
          client,
          nextId,
          attemptId,
          "checkout_cancelled",
          "completed",
          {},
        );
        return toPayment(updated.rows[0]);
      }),

    expireTimedOut: () =>
      withTransaction(pool, async (client) => {
        transitionCheckoutState("creating", "expired");
        const cutoff = new Date(now().valueOf() - creationTimeoutMs);
        const result = await client.query<{ checkout_attempt_id: string }>(
          `UPDATE payment_orders SET state = 'expired', failure_code = 'provider_timeout', updated_at = $1
           WHERE state = 'creating' AND updated_at <= $2 RETURNING checkout_attempt_id`,
          [now(), cutoff],
        );
        for (const row of result.rows) {
          await client.query(
            "UPDATE checkout_attempts SET state = 'expired' WHERE id = $1",
            [row.checkout_attempt_id],
          );
          await appendAudit(
            client,
            nextId,
            row.checkout_attempt_id,
            "provider_order_timed_out",
            "completed",
            { retrySuppressed: true },
          );
        }
        return result.rowCount ?? 0;
      }),

    processWebhook: async ({ eventId, signature, rawBody }) => {
      if (!provider.verifyWebhookSignature(rawBody, signature)) {
        await withTransaction(pool, (client) =>
          appendWebhookAudit(
            client,
            nextId,
            eventId,
            "payment_webhook_signature_rejected",
            "rejected",
            { signatureVerified: false },
          ),
        );
        throw new PaymentSignatureError("Webhook signature is invalid.");
      }
      let rawEvent: unknown;
      try {
        rawEvent = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new PaymentConflictError("Webhook body is not valid JSON.");
      }
      const event = razorpayWebhookSchema.parse(rawEvent);
      const identity = eventIdentity(event);
      return withTransaction(pool, async (client) => {
        const inserted = await client.query(
          `INSERT INTO payment_webhook_events
             (event_id, event_type, provider_order_id, signature_verified, outcome)
           VALUES ($1, $2, $3, true, 'processed')
           ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
          [eventId, event.event, identity.orderId],
        );
        if (inserted.rows[0] === undefined) {
          await appendWebhookAudit(
            client,
            nextId,
            eventId,
            "payment_webhook_duplicate",
            "completed",
            { duplicate: true },
          );
          return { duplicate: true, payment: null };
        }
        const existingResult = await client.query(
          "SELECT * FROM payment_orders WHERE provider_order_id = $1 FOR UPDATE",
          [identity.orderId],
        );
        if (existingResult.rows[0] === undefined) {
          await client.query(
            "UPDATE payment_webhook_events SET outcome = 'ignored', processed_at = $2 WHERE event_id = $1",
            [eventId, now()],
          );
          await appendWebhookAudit(
            client,
            nextId,
            eventId,
            "payment_webhook_ignored",
            "completed",
            { eventType: event.event, reason: "unknown_order" },
          );
          return { duplicate: false, payment: null };
        }
        const payment = toPayment(existingResult.rows[0]);
        const nextState = webhookState(event.event);
        const shouldIgnore =
          payment.state === "paid" ||
          (["failed", "expired", "cancelled"].includes(payment.state) &&
            nextState !== "paid");
        if (shouldIgnore) {
          await client.query(
            "UPDATE payment_webhook_events SET outcome = 'ignored', processed_at = $2 WHERE event_id = $1",
            [eventId, now()],
          );
          await appendAudit(
            client,
            nextId,
            payment.checkoutAttemptId,
            "payment_webhook_ignored",
            "completed",
            { eventId, eventType: event.event, currentState: payment.state },
          );
          await appendWebhookAudit(
            client,
            nextId,
            eventId,
            "payment_webhook_ignored",
            "completed",
            { eventType: event.event, currentState: payment.state },
          );
          return { duplicate: false, payment };
        }
        transitionCheckoutState(payment.state, nextState);
        const updated = await client.query(
          `UPDATE payment_orders SET state = $2,
             provider_payment_id = COALESCE($3, provider_payment_id),
             failure_code = $4, updated_at = $5
           WHERE checkout_attempt_id = $1 RETURNING *`,
          [
            payment.checkoutAttemptId,
            nextState,
            identity.paymentId,
            identity.failureCode,
            now(),
          ],
        );
        await client.query(
          "UPDATE checkout_attempts SET state = $2 WHERE id = $1",
          [payment.checkoutAttemptId, nextState],
        );
        await client.query(
          "UPDATE payment_webhook_events SET processed_at = $2 WHERE event_id = $1",
          [eventId, now()],
        );
        await appendAudit(
          client,
          nextId,
          payment.checkoutAttemptId,
          "payment_webhook_processed",
          "completed",
          { eventId, eventType: event.event, nextState },
        );
        await appendWebhookAudit(
          client,
          nextId,
          eventId,
          "payment_webhook_processed",
          "completed",
          { eventType: event.event, nextState },
        );
        return { duplicate: false, payment: toPayment(updated.rows[0]) };
      });
    },
  };
};

export interface PaymentDependencies {
  service: PaymentService;
  close: () => Promise<void>;
}

export const createPaymentDependencies = (
  databaseUrl: string,
  provider: PaymentProvider,
): PaymentDependencies => {
  const pool = createRuntimePool(databaseUrl);
  return {
    service: createPostgresPaymentService(pool, provider),
    close: () => pool.end(),
  };
};
