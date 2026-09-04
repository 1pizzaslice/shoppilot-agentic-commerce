import { createHash, randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { z } from "zod";

import {
  addonOfferSchema,
  approvalSchema,
  approveCartInputSchema,
  auditEventSchema,
  cartSchema,
  checkoutAttemptSchema,
  checkoutSnapshotSchema,
  CommerceConflictError,
  CommerceNotFoundError,
  CommercePolicyError,
  createCartInputSchema,
  createCheckoutInputSchema,
  policyDecisionSchema,
  redactAuditMetadata,
  type AddCartLineInput,
  type AddonDecisionInput,
  type AuditEvent,
  type Cart,
  type CheckoutSnapshot,
  type CommerceService,
  type CreateCartInput,
  type PolicyDecision,
  type PolicyReason,
} from "@shoppilot/domain";

const cartRowSchema = z.object({
  id: z.string(),
  merchant_id: z.string(),
  user_id: z.string(),
  state: z.string(),
  version: z.number().int(),
  budget_paise: z.number().int().nullable(),
  currency: z.string(),
});

const lineRowSchema = z.object({
  id: z.string(),
  variant_id: z.string(),
  kind: z.string(),
  quantity: z.number().int(),
});

const offerRowSchema = z.object({
  id: z.string(),
  source_product_id: z.string(),
  product_id: z.string(),
  variant_id: z.string(),
  name: z.string(),
  reason: z.string(),
  price_paise: z.number().int(),
  currency: z.string(),
  outcome: z.string().nullable(),
});

const canonicalLineRowSchema = z.object({
  variant_id: z.string(),
  product_id: z.string(),
  sku: z.string(),
  kind: z.string(),
  quantity: z.number().int(),
  price_paise: z.number().int(),
  currency: z.string(),
  stock_quantity: z.number().int(),
  product_active: z.boolean(),
  variant_active: z.boolean(),
});

const snapshotRowSchema = z.object({
  id: z.string(),
  cart_id: z.string(),
  cart_version: z.number().int(),
  hash: z.string(),
  document: z.unknown(),
  subtotal_paise: z.number().int(),
  discount_paise: z.number().int(),
  tax_paise: z.number().int(),
  delivery_paise: z.number().int(),
  total_paise: z.number().int(),
  currency: z.string(),
  created_at: z.date(),
});

const approvalRowSchema = z.object({
  id: z.string(),
  cart_id: z.string(),
  snapshot_id: z.string(),
  cart_hash: z.string(),
  user_id: z.string(),
  total_paise: z.number().int(),
  currency: z.string(),
  expires_at: z.date(),
  used_at: z.date().nullable(),
  invalidated_at: z.date().nullable(),
});

const decisionRowSchema = z.object({
  id: z.string(),
  cart_id: z.string(),
  approval_id: z.string(),
  outcome: z.string(),
  reason: z.string(),
  created_at: z.date(),
});

const attemptRowSchema = z.object({
  id: z.string(),
  cart_id: z.string(),
  approval_id: z.string(),
  policy_decision_id: z.string(),
  idempotency_key: z.string(),
  state: z.string(),
  created_at: z.date(),
});

const auditRowSchema = z.object({
  id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  event_type: z.string(),
  outcome: z.string(),
  metadata: z.unknown(),
  created_at: z.date(),
});

const withTransaction = async <T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const iso = (date: Date): string => date.toISOString();

const toSnapshot = (raw: unknown): CheckoutSnapshot => {
  const row = snapshotRowSchema.parse(raw);
  const document = checkoutSnapshotSchema.shape.lines.parse(row.document);
  return checkoutSnapshotSchema.parse({
    id: row.id,
    cartId: row.cart_id,
    cartVersion: row.cart_version,
    hash: row.hash,
    lines: document,
    subtotalPaise: row.subtotal_paise,
    discountPaise: row.discount_paise,
    taxPaise: row.tax_paise,
    deliveryPaise: row.delivery_paise,
    totalPaise: row.total_paise,
    currency: row.currency,
    createdAt: iso(row.created_at),
  });
};

const toApproval = (raw: unknown) => {
  const row = approvalRowSchema.parse(raw);
  return approvalSchema.parse({
    id: row.id,
    cartId: row.cart_id,
    snapshotId: row.snapshot_id,
    cartHash: row.cart_hash,
    userId: row.user_id,
    totalPaise: row.total_paise,
    currency: row.currency,
    expiresAt: iso(row.expires_at),
    usedAt: row.used_at === null ? null : iso(row.used_at),
    invalidatedAt: row.invalidated_at === null ? null : iso(row.invalidated_at),
  });
};

const toDecision = (raw: unknown): PolicyDecision => {
  const row = decisionRowSchema.parse(raw);
  return policyDecisionSchema.parse({
    id: row.id,
    cartId: row.cart_id,
    approvalId: row.approval_id,
    outcome: row.outcome,
    reason: row.reason,
    createdAt: iso(row.created_at),
  });
};

const toAttempt = (raw: unknown) => {
  const row = attemptRowSchema.parse(raw);
  return checkoutAttemptSchema.parse({
    id: row.id,
    cartId: row.cart_id,
    approvalId: row.approval_id,
    policyDecisionId: row.policy_decision_id,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    createdAt: iso(row.created_at),
  });
};

const appendAudit = async (
  client: PoolClient,
  nextId: () => string,
  event: {
    entityType: "cart" | "addon_offer" | "approval" | "checkout";
    entityId: string;
    eventType: string;
    outcome: "completed" | "allowed" | "rejected" | "invalidated";
    metadata: Readonly<Record<string, string | number | boolean | null>>;
  },
): Promise<void> => {
  await client.query(
    `INSERT INTO audit_events
       (id, entity_type, entity_id, event_type, outcome, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      nextId(),
      event.entityType,
      event.entityId,
      event.eventType,
      event.outcome,
      JSON.stringify(redactAuditMetadata(event.metadata)),
    ],
  );
};

const readCart = async (
  client: PoolClient,
  cartId: string,
  lock = false,
): Promise<Cart | null> => {
  const result = await client.query<Record<string, unknown>>(
    `SELECT id, merchant_id, user_id, state, version, budget_paise, currency
     FROM carts WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [cartId],
  );
  const rawCart = result.rows[0];
  if (rawCart === undefined) return null;
  const row = cartRowSchema.parse(rawCart);
  const linesResult = await client.query(
    `SELECT id, variant_id, kind, quantity
     FROM cart_lines WHERE cart_id = $1 ORDER BY kind DESC, id`,
    [cartId],
  );
  const offerResult = await client.query<Record<string, unknown>>(
    `SELECT id, source_product_id, product_id, variant_id, name, reason,
            price_paise, currency, outcome
     FROM addon_offers WHERE cart_id = $1
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [cartId],
  );
  const rawOffer = offerResult.rows[0];
  const offer =
    rawOffer === undefined
      ? null
      : (() => {
          const parsed = offerRowSchema.parse(rawOffer);
          return addonOfferSchema.parse({
            id: parsed.id,
            sourceProductId: parsed.source_product_id,
            productId: parsed.product_id,
            variantId: parsed.variant_id,
            name: parsed.name,
            reason: parsed.reason,
            pricePaise: parsed.price_paise,
            currency: parsed.currency,
            outcome: parsed.outcome,
          });
        })();
  return cartSchema.parse({
    id: row.id,
    merchantId: row.merchant_id,
    userId: row.user_id,
    state: row.state,
    version: row.version,
    budgetPaise: row.budget_paise,
    currency: row.currency,
    lines: linesResult.rows.map((rawLine) => {
      const line = lineRowSchema.parse(rawLine);
      return {
        id: line.id,
        variantId: line.variant_id,
        kind: line.kind,
        quantity: line.quantity,
      };
    }),
    addonOffer: offer,
  });
};

const requireCart = async (
  client: PoolClient,
  cartId: string,
  lock = false,
): Promise<Cart> => {
  const cart = await readCart(client, cartId, lock);
  if (cart === null) throw new CommerceNotFoundError("Cart not found.");
  return cart;
};

const assertVersion = (cart: Cart, expectedVersion: number): void => {
  if (cart.version !== expectedVersion) {
    throw new CommerceConflictError(
      `Cart version conflict: expected ${String(expectedVersion)}, current ${String(cart.version)}.`,
    );
  }
};

const invalidateApproval = async (
  client: PoolClient,
  cart: Cart,
  now: Date,
  nextId: () => string,
): Promise<void> => {
  const result = await client.query(
    `UPDATE approvals SET invalidated_at = $2
     WHERE cart_id = $1 AND used_at IS NULL AND invalidated_at IS NULL
     RETURNING id`,
    [cart.id, now],
  );
  for (const raw of result.rows) {
    const approvalId = z.object({ id: z.string() }).parse(raw).id;
    await appendAudit(client, nextId, {
      entityType: "approval",
      entityId: approvalId,
      eventType: "approval_invalidated_by_cart_mutation",
      outcome: "invalidated",
      metadata: { cartId: cart.id, priorCartVersion: cart.version },
    });
  }
};

const selectAddon = async (
  client: PoolClient,
  sourceProductId: string,
): Promise<z.infer<typeof offerRowSchema> | null> => {
  const result = await client.query(
    `SELECT p.id AS product_id, p.name, pr.reason, pv.id AS variant_id,
            pv.price_paise, pv.currency, $1::text AS source_product_id,
            ''::text AS id, NULL::text AS outcome
     FROM product_relations pr
     JOIN products p ON p.id = pr.target_product_id AND p.active = true
     JOIN product_variants pv ON pv.product_id = p.id AND pv.active = true
     JOIN inventory i ON i.variant_id = pv.id AND i.quantity > 0
     WHERE pr.source_product_id = $1 AND pr.relation_type = 'compatible_addon'
       AND p.product_type = 'accessory'
     ORDER BY pv.price_paise, p.id, pv.id LIMIT 1`,
    [sourceProductId],
  );
  return result.rows[0] === undefined
    ? null
    : offerRowSchema.parse(result.rows[0]);
};

const createRejectedDecision = async (
  client: PoolClient,
  nextId: () => string,
  now: Date,
  cartId: string,
  approvalId: string,
  reason: PolicyReason,
): Promise<PolicyDecision> => {
  const result = await client.query(
    `INSERT INTO policy_decisions
       (id, cart_id, approval_id, outcome, reason, created_at)
     VALUES ($1, $2, $3, 'rejected', $4, $5)
     RETURNING *`,
    [nextId(), cartId, approvalId, reason, now],
  );
  const decision = toDecision(result.rows[0]);
  await appendAudit(client, nextId, {
    entityType: "checkout",
    entityId: cartId,
    eventType: "checkout_policy_decided",
    outcome: "rejected",
    metadata: { cartId, approvalId, reason },
  });
  return decision;
};

export interface CommerceRepositoryOptions {
  nextId?: () => string;
  now?: () => Date;
  approvalTtlMs?: number;
}

export const createPostgresCommerceService = (
  pool: Pool,
  options: CommerceRepositoryOptions = {},
): CommerceService => {
  const nextId = options.nextId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const approvalTtlMs = options.approvalTtlMs ?? 10 * 60 * 1_000;

  return {
    createCart: async (rawInput: CreateCartInput): Promise<Cart> => {
      const input = createCartInputSchema.parse(rawInput);
      return withTransaction(pool, async (client) => {
        const cartId = nextId();
        await client.query(
          `INSERT INTO carts
             (id, merchant_id, user_id, state, version, budget_paise, currency)
           VALUES ($1, $2, $3, 'draft', 1, $4, $5)`,
          [
            cartId,
            input.merchantId,
            input.userId,
            input.budgetPaise ?? null,
            input.currency,
          ],
        );
        await appendAudit(client, nextId, {
          entityType: "cart",
          entityId: cartId,
          eventType: "cart_created",
          outcome: "completed",
          metadata: {
            cartId,
            cartVersion: 1,
            budgetPaise: input.budgetPaise ?? null,
          },
        });
        return requireCart(client, cartId);
      });
    },

    getCart: async (cartId): Promise<Cart | null> =>
      withTransaction(pool, (client) => readCart(client, cartId)),

    addPrimaryLine: async (
      cartId: string,
      input: AddCartLineInput,
    ): Promise<Cart> =>
      withTransaction(pool, async (client) => {
        const cart = await requireCart(client, cartId, true);
        assertVersion(cart, input.expectedVersion);
        if (["checkout_started", "terminal"].includes(cart.state)) {
          throw new CommerceConflictError("Cart can no longer be changed.");
        }
        const variantResult = await client.query<Record<string, unknown>>(
          `SELECT pv.id AS variant_id, pv.product_id, pv.active AS variant_active,
                  p.active AS product_active, p.product_type, i.quantity
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
           JOIN inventory i ON i.variant_id = pv.id
           WHERE pv.id = $1 AND p.merchant_id = $2`,
          [input.variantId, cart.merchantId],
        );
        const variantSchema = z.object({
          variant_id: z.string(),
          product_id: z.string(),
          variant_active: z.boolean(),
          product_active: z.boolean(),
          product_type: z.string(),
          quantity: z.number().int(),
        });
        const rawVariant = variantResult.rows[0];
        if (rawVariant === undefined) {
          throw new CommerceNotFoundError("Variant not found.");
        }
        const variant = variantSchema.parse(rawVariant);
        if (
          !variant.variant_active ||
          !variant.product_active ||
          variant.product_type === "accessory" ||
          variant.quantity < input.quantity
        ) {
          throw new CommerceConflictError(
            "The selected primary variant is unavailable.",
          );
        }
        await invalidateApproval(client, cart, now(), nextId);
        const unresolved = await client.query(
          `UPDATE addon_offers SET outcome = 'skipped', decided_at = $2
           WHERE cart_id = $1 AND outcome IS NULL RETURNING id`,
          [cartId, now()],
        );
        for (const raw of unresolved.rows) {
          const offerId = z.object({ id: z.string() }).parse(raw).id;
          await appendAudit(client, nextId, {
            entityType: "addon_offer",
            entityId: offerId,
            eventType: "addon_outcome_recorded",
            outcome: "completed",
            metadata: { cartId, outcome: "skipped" },
          });
        }
        await client.query(`DELETE FROM cart_lines WHERE cart_id = $1`, [
          cartId,
        ]);
        await client.query(
          `INSERT INTO cart_lines (id, cart_id, variant_id, kind, quantity)
           VALUES ($1, $2, $3, 'primary', $4)`,
          [nextId(), cartId, input.variantId, input.quantity],
        );
        const nextVersion = cart.version + 1;
        await client.query(
          `UPDATE carts SET state = 'draft', version = $2, updated_at = $3
           WHERE id = $1`,
          [cartId, nextVersion, now()],
        );
        const addon = await selectAddon(client, variant.product_id);
        if (addon !== null) {
          const offerId = nextId();
          await client.query(
            `INSERT INTO addon_offers
               (id, cart_id, cart_version, source_product_id, product_id,
                variant_id, name, reason, price_paise, currency)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              offerId,
              cartId,
              nextVersion,
              addon.source_product_id,
              addon.product_id,
              addon.variant_id,
              addon.name,
              addon.reason,
              addon.price_paise,
              addon.currency,
            ],
          );
          await appendAudit(client, nextId, {
            entityType: "addon_offer",
            entityId: offerId,
            eventType: "addon_offered",
            outcome: "completed",
            metadata: {
              cartId,
              sourceProductId: addon.source_product_id,
              productId: addon.product_id,
              variantId: addon.variant_id,
            },
          });
        }
        await appendAudit(client, nextId, {
          entityType: "cart",
          entityId: cartId,
          eventType: "cart_primary_line_set",
          outcome: "completed",
          metadata: {
            cartId,
            cartVersion: nextVersion,
            variantId: input.variantId,
            quantity: input.quantity,
          },
        });
        return requireCart(client, cartId);
      }),

    decideAddon: async (
      cartId: string,
      input: AddonDecisionInput,
    ): Promise<Cart> =>
      withTransaction(pool, async (client) => {
        const cart = await requireCart(client, cartId, true);
        assertVersion(cart, input.expectedVersion);
        if (["checkout_started", "terminal"].includes(cart.state)) {
          throw new CommerceConflictError("Cart can no longer be changed.");
        }
        const result = await client.query<Record<string, unknown>>(
          `SELECT id, source_product_id, product_id, variant_id, name, reason,
                  price_paise, currency, outcome
           FROM addon_offers WHERE id = $1 AND cart_id = $2 FOR UPDATE`,
          [input.offerId, cartId],
        );
        const rawOffer = result.rows[0];
        if (rawOffer === undefined) {
          throw new CommerceNotFoundError("Add-on offer not found.");
        }
        const offer = offerRowSchema.parse(rawOffer);
        if (offer.outcome !== null) {
          throw new CommerceConflictError(
            "Add-on decision is already recorded.",
          );
        }
        if (input.outcome === "accepted") {
          const live = await client.query(
            `SELECT pv.active AS variant_active, p.active AS product_active,
                    p.product_type, i.quantity
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
             JOIN inventory i ON i.variant_id = pv.id
             WHERE pv.id = $1`,
            [offer.variant_id],
          );
          const row = z
            .object({
              variant_active: z.boolean(),
              product_active: z.boolean(),
              product_type: z.string(),
              quantity: z.number().int(),
            })
            .parse(live.rows[0]);
          if (
            !row.variant_active ||
            !row.product_active ||
            row.product_type !== "accessory" ||
            row.quantity < 1
          ) {
            throw new CommerceConflictError(
              "The offered add-on is unavailable.",
            );
          }
          await client.query(
            `INSERT INTO cart_lines (id, cart_id, variant_id, kind, quantity)
             VALUES ($1, $2, $3, 'addon', 1)`,
            [nextId(), cartId, offer.variant_id],
          );
        }
        await client.query(
          `UPDATE addon_offers SET outcome = $2, decided_at = $3 WHERE id = $1`,
          [offer.id, input.outcome, now()],
        );
        await invalidateApproval(client, cart, now(), nextId);
        const nextVersion = cart.version + 1;
        await client.query(
          `UPDATE carts SET state = 'draft', version = $2, updated_at = $3
           WHERE id = $1`,
          [cartId, nextVersion, now()],
        );
        await appendAudit(client, nextId, {
          entityType: "addon_offer",
          entityId: offer.id,
          eventType: "addon_outcome_recorded",
          outcome: "completed",
          metadata: {
            cartId,
            outcome: input.outcome,
            cartVersion: nextVersion,
          },
        });
        if (input.outcome === "accepted") {
          await appendAudit(client, nextId, {
            entityType: "cart",
            entityId: cartId,
            eventType: "cart_addon_line_added",
            outcome: "completed",
            metadata: {
              cartId,
              cartVersion: nextVersion,
              variantId: offer.variant_id,
              explicitConsent: true,
            },
          });
        }
        return requireCart(client, cartId);
      }),

    reviewCart: async (cartId, expectedVersion) =>
      withTransaction(pool, async (client) => {
        let cart = await requireCart(client, cartId, true);
        assertVersion(cart, expectedVersion);
        if (!["draft", "review"].includes(cart.state)) {
          throw new CommerceConflictError("Cart is not available for review.");
        }
        const unresolved = await client.query(
          `UPDATE addon_offers SET outcome = 'skipped', decided_at = $2
           WHERE cart_id = $1 AND outcome IS NULL RETURNING id`,
          [cartId, now()],
        );
        if (unresolved.rows.length > 0) {
          const nextVersion = cart.version + 1;
          await client.query(
            `UPDATE carts SET version = $2, updated_at = $3 WHERE id = $1`,
            [cartId, nextVersion, now()],
          );
          for (const raw of unresolved.rows) {
            const offerId = z.object({ id: z.string() }).parse(raw).id;
            await appendAudit(client, nextId, {
              entityType: "addon_offer",
              entityId: offerId,
              eventType: "addon_outcome_recorded",
              outcome: "completed",
              metadata: { cartId, outcome: "skipped" },
            });
          }
          cart = await requireCart(client, cartId);
        }
        const liveResult = await client.query(
          `SELECT cl.variant_id, pv.product_id, pv.sku, cl.kind, cl.quantity,
                  pv.price_paise, pv.currency, i.quantity AS stock_quantity,
                  p.active AS product_active, pv.active AS variant_active
           FROM cart_lines cl
           JOIN product_variants pv ON pv.id = cl.variant_id
           JOIN products p ON p.id = pv.product_id
           JOIN inventory i ON i.variant_id = pv.id
           WHERE cl.cart_id = $1 ORDER BY cl.kind DESC, cl.id`,
          [cartId],
        );
        const liveLines = liveResult.rows.map((raw) =>
          canonicalLineRowSchema.parse(raw),
        );
        if (
          liveLines.length === 0 ||
          liveLines.filter((line) => line.kind === "primary").length !== 1 ||
          liveLines.some(
            (line) =>
              !line.product_active ||
              !line.variant_active ||
              line.stock_quantity < line.quantity,
          )
        ) {
          throw new CommerceConflictError(
            "Cart contains an unavailable or invalid selection.",
          );
        }
        const lines = liveLines.map((line) => {
          const lineTotalPaise = line.price_paise * line.quantity;
          return {
            variantId: line.variant_id,
            productId: line.product_id,
            sku: line.sku,
            kind: line.kind,
            quantity: line.quantity,
            unitPricePaise: line.price_paise,
            discountPaise: 0,
            taxPaise: 0,
            lineTotalPaise,
            currency: line.currency,
          };
        });
        const parsedLines = checkoutSnapshotSchema.shape.lines.parse(lines);
        const subtotalPaise = parsedLines.reduce(
          (sum, line) => sum + line.lineTotalPaise,
          0,
        );
        const snapshotId = nextId();
        const createdAt = now();
        const hashPayload = {
          cartId,
          cartVersion: cart.version,
          lines: parsedLines,
          subtotalPaise,
          discountPaise: 0,
          taxPaise: 0,
          deliveryPaise: 0,
          totalPaise: subtotalPaise,
          currency: cart.currency,
        };
        const hash = createHash("sha256")
          .update(JSON.stringify(hashPayload))
          .digest("hex");
        const result = await client.query<Record<string, unknown>>(
          `INSERT INTO checkout_snapshots
             (id, cart_id, cart_version, hash, document, subtotal_paise,
              discount_paise, tax_paise, delivery_paise, total_paise, currency,
              created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, 0, 0, 0, $6, $7, $8)
           ON CONFLICT (cart_id, cart_version) DO NOTHING
           RETURNING *`,
          [
            snapshotId,
            cartId,
            cart.version,
            hash,
            JSON.stringify(parsedLines),
            subtotalPaise,
            cart.currency,
            createdAt,
          ],
        );
        await client.query(
          `UPDATE carts SET state = 'review', updated_at = $2 WHERE id = $1`,
          [cartId, createdAt],
        );
        const existingSnapshot =
          result.rows[0] ??
          (
            await client.query<Record<string, unknown>>(
              `SELECT * FROM checkout_snapshots
               WHERE cart_id = $1 AND cart_version = $2`,
              [cartId, cart.version],
            )
          ).rows[0];
        const snapshot = toSnapshot(existingSnapshot);
        await appendAudit(client, nextId, {
          entityType: "cart",
          entityId: cartId,
          eventType: "cart_snapshot_created",
          outcome: "completed",
          metadata: {
            cartId,
            cartVersion: cart.version,
            snapshotId: snapshot.id,
            cartHash: snapshot.hash,
            totalPaise: snapshot.totalPaise,
          },
        });
        return { cart: await requireCart(client, cartId), snapshot };
      }),

    approveCart: async (cartId, rawInput) => {
      const input = approveCartInputSchema.parse(rawInput);
      return withTransaction(pool, async (client) => {
        const cart = await requireCart(client, cartId, true);
        assertVersion(cart, input.expectedVersion);
        if (cart.state !== "review") {
          throw new CommerceConflictError(
            "Cart must be reviewed before approval.",
          );
        }
        if (cart.userId !== input.userId) {
          throw new CommerceConflictError(
            "Approval user does not match the cart.",
          );
        }
        const snapshotResult = await client.query<Record<string, unknown>>(
          `SELECT * FROM checkout_snapshots WHERE id = $1 AND cart_id = $2`,
          [input.snapshotId, cartId],
        );
        const rawSnapshot = snapshotResult.rows[0];
        if (rawSnapshot === undefined) {
          throw new CommerceNotFoundError("Checkout snapshot not found.");
        }
        const snapshot = toSnapshot(rawSnapshot);
        if (
          snapshot.cartVersion !== cart.version ||
          snapshot.hash !== input.cartHash
        ) {
          throw new CommerceConflictError(
            "Snapshot no longer matches the cart.",
          );
        }
        const approvedAt = now();
        const expiresAt = new Date(approvedAt.valueOf() + approvalTtlMs);
        const result = await client.query(
          `INSERT INTO approvals
             (id, cart_id, snapshot_id, cart_hash, user_id, total_paise,
              currency, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            nextId(),
            cartId,
            snapshot.id,
            snapshot.hash,
            cart.userId,
            snapshot.totalPaise,
            snapshot.currency,
            expiresAt,
            approvedAt,
          ],
        );
        const approval = toApproval(result.rows[0]);
        await client.query(
          `UPDATE carts SET state = 'approved', updated_at = $2 WHERE id = $1`,
          [cartId, approvedAt],
        );
        await appendAudit(client, nextId, {
          entityType: "approval",
          entityId: approval.id,
          eventType: "cart_approved",
          outcome: "completed",
          metadata: {
            cartId,
            userId: cart.userId,
            cartHash: snapshot.hash,
            totalPaise: snapshot.totalPaise,
            expiresAt: iso(expiresAt),
          },
        });
        return { cart: await requireCart(client, cartId), approval };
      });
    },

    authorizeCheckout: async (rawInput) => {
      const input = createCheckoutInputSchema.parse(rawInput);
      const result = await withTransaction(pool, async (client) => {
        const checkedAt = now();
        const cart = await readCart(client, input.cartId, true);
        const reject = (reason: PolicyReason) =>
          createRejectedDecision(
            client,
            nextId,
            checkedAt,
            input.cartId,
            input.approvalId,
            reason,
          );
        const existing = await client.query(
          `SELECT * FROM checkout_attempts WHERE approval_id = $1`,
          [input.approvalId],
        );
        if (existing.rows[0] !== undefined) {
          return {
            attempt: null,
            decision: await reject("duplicate_execution"),
          };
        }
        if (cart === null) {
          return { attempt: null, decision: await reject("cart_not_approved") };
        }
        const approvalResult = await client.query<Record<string, unknown>>(
          `SELECT * FROM approvals WHERE id = $1 AND cart_id = $2 FOR UPDATE`,
          [input.approvalId, input.cartId],
        );
        const rawApproval = approvalResult.rows[0];
        if (rawApproval === undefined) {
          return { attempt: null, decision: await reject("approval_missing") };
        }
        const approval = toApproval(rawApproval);
        if (approval.invalidatedAt !== null) {
          return { attempt: null, decision: await reject("cart_mutated") };
        }
        if (cart.state !== "approved") {
          return { attempt: null, decision: await reject("cart_not_approved") };
        }
        if (approval.usedAt !== null) {
          return { attempt: null, decision: await reject("approval_used") };
        }
        if (new Date(approval.expiresAt).valueOf() <= checkedAt.valueOf()) {
          return { attempt: null, decision: await reject("approval_expired") };
        }
        const snapshotResult = await client.query<Record<string, unknown>>(
          `SELECT * FROM checkout_snapshots WHERE id = $1 AND cart_id = $2`,
          [approval.snapshotId, input.cartId],
        );
        const rawSnapshot = snapshotResult.rows[0];
        if (rawSnapshot === undefined) {
          return { attempt: null, decision: await reject("approval_mismatch") };
        }
        const snapshot = toSnapshot(rawSnapshot);
        if (
          approval.userId !== cart.userId ||
          approval.cartHash !== snapshot.hash ||
          approval.totalPaise !== snapshot.totalPaise ||
          approval.currency !== snapshot.currency
        ) {
          return { attempt: null, decision: await reject("approval_mismatch") };
        }
        if (snapshot.cartVersion !== cart.version) {
          return { attempt: null, decision: await reject("cart_mutated") };
        }
        if (
          cart.budgetPaise !== null &&
          snapshot.totalPaise > cart.budgetPaise
        ) {
          return { attempt: null, decision: await reject("budget_exceeded") };
        }
        if (
          snapshot.lines.some((line) => line.quantity < 1 || line.quantity > 3)
        ) {
          return { attempt: null, decision: await reject("invalid_quantity") };
        }
        const liveResult = await client.query(
          `SELECT cl.variant_id, pv.product_id, pv.sku, cl.kind, cl.quantity,
                  pv.price_paise, pv.currency, i.quantity AS stock_quantity,
                  p.active AS product_active, pv.active AS variant_active
           FROM cart_lines cl
           JOIN product_variants pv ON pv.id = cl.variant_id
           JOIN products p ON p.id = pv.product_id
           JOIN inventory i ON i.variant_id = pv.id
           WHERE cl.cart_id = $1 ORDER BY cl.kind DESC, cl.id`,
          [input.cartId],
        );
        const live = liveResult.rows.map((raw) =>
          canonicalLineRowSchema.parse(raw),
        );
        if (
          live.length !== snapshot.lines.length ||
          live.some(
            (line) =>
              !line.product_active ||
              !line.variant_active ||
              line.stock_quantity < line.quantity,
          )
        ) {
          return { attempt: null, decision: await reject("stock_changed") };
        }
        const liveByVariant = new Map(
          live.map((line) => [line.variant_id, line]),
        );
        if (
          snapshot.lines.some((line) => {
            const current = liveByVariant.get(line.variantId);
            return (
              current === undefined ||
              current.price_paise !== line.unitPricePaise ||
              current.currency !== line.currency ||
              current.quantity !== line.quantity ||
              current.kind !== line.kind
            );
          })
        ) {
          return { attempt: null, decision: await reject("price_changed") };
        }
        const decisionResult = await client.query(
          `INSERT INTO policy_decisions
             (id, cart_id, approval_id, outcome, reason, created_at)
           VALUES ($1, $2, $3, 'allowed', 'allowed', $4)
           RETURNING *`,
          [nextId(), input.cartId, input.approvalId, checkedAt],
        );
        const decision = toDecision(decisionResult.rows[0]);
        const idempotencyKey = `checkout:${snapshot.hash}`;
        const attemptResult = await client.query(
          `INSERT INTO checkout_attempts
             (id, cart_id, approval_id, policy_decision_id, idempotency_key,
              state, created_at)
           VALUES ($1, $2, $3, $4, $5, 'authorized', $6)
           RETURNING *`,
          [
            nextId(),
            input.cartId,
            input.approvalId,
            decision.id,
            idempotencyKey,
            checkedAt,
          ],
        );
        const attempt = toAttempt(attemptResult.rows[0]);
        await client.query(`UPDATE approvals SET used_at = $2 WHERE id = $1`, [
          input.approvalId,
          checkedAt,
        ]);
        await client.query(
          `UPDATE carts SET state = 'checkout_started', updated_at = $2 WHERE id = $1`,
          [input.cartId, checkedAt],
        );
        await appendAudit(client, nextId, {
          entityType: "checkout",
          entityId: attempt.id,
          eventType: "checkout_policy_decided",
          outcome: "allowed",
          metadata: {
            cartId: input.cartId,
            approvalId: input.approvalId,
            policyDecisionId: decision.id,
            idempotencyKey,
          },
        });
        await appendAudit(client, nextId, {
          entityType: "checkout",
          entityId: attempt.id,
          eventType: "checkout_authorized",
          outcome: "completed",
          metadata: {
            cartId: input.cartId,
            approvalId: input.approvalId,
            externalOrderCreated: false,
          },
        });
        return { attempt, decision };
      });
      if (result.attempt === null) {
        throw new CommercePolicyError(
          `Checkout rejected: ${result.decision.reason}.`,
          result.decision,
        );
      }
      return result;
    },

    getAuditTimeline: async (cartId): Promise<readonly AuditEvent[]> => {
      const result = await pool.query(
        `SELECT id, entity_type, entity_id, event_type, outcome, metadata, created_at
         FROM audit_events
         WHERE entity_id = $1 OR metadata->>'cartId' = $1
         ORDER BY created_at, id`,
        [cartId],
      );
      return result.rows.map((raw) => {
        const row = auditRowSchema.parse(raw);
        return auditEventSchema.parse({
          id: row.id,
          entityType: row.entity_type,
          entityId: row.entity_id,
          eventType: row.event_type,
          outcome: row.outcome,
          metadata: row.metadata,
          createdAt: iso(row.created_at),
        });
      });
    },
  };
};

export interface CommerceDependencies {
  service: CommerceService;
  close: () => Promise<void>;
}

export const createCommerceDependencies = (
  databaseUrl: string,
): CommerceDependencies => {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 10,
  });
  return {
    service: createPostgresCommerceService(pool),
    close: async () => pool.end(),
  };
};
