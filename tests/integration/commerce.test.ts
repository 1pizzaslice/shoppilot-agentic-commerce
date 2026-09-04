import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { buildApi } from "../../apps/api/src/app.js";
import {
  createPostgresCatalogueReader,
  createPostgresCommerceService,
  migrateCatalogue,
  seedCatalogue,
} from "@shoppilot/db";
import {
  approvalSchema,
  cartSchema,
  cartWithApprovalSchema,
  cartWithSnapshotSchema,
  checkoutAuthorizationSchema,
  commerceErrorSchema,
} from "@shoppilot/domain";
import {
  createDeterministicIdGenerator,
  createUnavailablePaymentService,
} from "../../packages/testkit/src/index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot";
const pool = new Pool({ connectionString: databaseUrl, max: 12 });
const ids = createDeterministicIdGenerator(`commerce-${randomUUID()}`);
let currentTime = new Date("2026-09-04T10:00:00.000Z");
const commerce = createPostgresCommerceService(pool, {
  nextId: ids.next,
  now: () => new Date(currentTime),
  approvalTtlMs: 60_000,
});
const app = buildApi({
  readiness: { check: () => Promise.resolve([]) },
  catalogue: createPostgresCatalogueReader(pool),
  conversation: {
    start: () => Promise.reject(new Error("not used")),
    continue: () => Promise.reject(new Error("not used")),
  },
  commerce,
  payments: createUnavailablePaymentService(),
});

beforeAll(async () => {
  await migrateCatalogue(pool);
  await seedCatalogue(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const createCartWithPrimary = async (budgetPaise?: number) => {
  const createdResponse = await app.inject({
    method: "POST",
    url: "/v1/carts",
    payload: {
      userId: `shopper-${ids.next()}`,
      ...(budgetPaise === undefined ? {} : { budgetPaise }),
    },
  });
  expect(createdResponse.statusCode).toBe(201);
  const created = cartSchema.parse(createdResponse.json());
  const lineResponse = await app.inject({
    method: "POST",
    url: `/v1/carts/${created.id}/lines`,
    payload: {
      variantId: "shoe-01-2-8",
      quantity: 1,
      expectedVersion: created.version,
    },
  });
  expect(lineResponse.statusCode).toBe(200);
  return cartSchema.parse(lineResponse.json());
};

const reviewAndApprove = async (
  cart: Awaited<ReturnType<typeof createCartWithPrimary>>,
) => {
  const reviewResponse = await app.inject({
    method: "POST",
    url: `/v1/carts/${cart.id}/review`,
    payload: { expectedVersion: cart.version },
  });
  expect(reviewResponse.statusCode).toBe(200);
  const review = cartWithSnapshotSchema.parse(reviewResponse.json());
  const approvalResponse = await app.inject({
    method: "POST",
    url: `/v1/carts/${cart.id}/approve`,
    payload: {
      expectedVersion: review.cart.version,
      snapshotId: review.snapshot.id,
      cartHash: review.snapshot.hash,
      userId: review.cart.userId,
    },
  });
  expect(approvalResponse.statusCode).toBe(200);
  return {
    review,
    approval: cartWithApprovalSchema.parse(approvalResponse.json()),
  };
};

describe("cart, add-on, approval, and checkout policy", () => {
  it("adds the single deterministic add-on only after explicit acceptance", async () => {
    const cart = await createCartWithPrimary();
    expect(cart.lines).toHaveLength(1);
    expect(cart.addonOffer).toMatchObject({
      productId: "addon-comfort-insoles",
      variantId: "addon-comfort-insoles-standard",
      outcome: null,
    });
    const offer = cart.addonOffer;
    expect(offer).not.toBeNull();
    if (offer === null) return;

    const decisionResponse = await app.inject({
      method: "POST",
      url: `/v1/carts/${cart.id}/addon-decision`,
      payload: {
        offerId: offer.id,
        outcome: "accepted",
        expectedVersion: cart.version,
      },
    });
    const accepted = cartSchema.parse(decisionResponse.json());
    expect(accepted.lines.map((line) => line.kind).sort()).toEqual([
      "addon",
      "primary",
    ]);
    expect(accepted.addonOffer?.outcome).toBe("accepted");

    const review = await reviewAndApprove(accepted);
    expect(review.review.snapshot.lines).toHaveLength(2);
    expect(review.review.snapshot.totalPaise).toBe(304_800);
    expect(approvalSchema.parse(review.approval.approval).cartHash).toBe(
      review.review.snapshot.hash,
    );
    await expect(
      pool.query(
        "UPDATE checkout_snapshots SET total_paise = total_paise + 1 WHERE id = $1",
        [review.review.snapshot.id],
      ),
    ).rejects.toThrow("immutable");
  });

  it("records declined and skipped outcomes without mutating the cart", async () => {
    const declinedCart = await createCartWithPrimary();
    const declinedOffer = declinedCart.addonOffer;
    expect(declinedOffer).not.toBeNull();
    if (declinedOffer === null) return;
    const declinedResponse = await app.inject({
      method: "POST",
      url: `/v1/carts/${declinedCart.id}/addon-decision`,
      payload: {
        offerId: declinedOffer.id,
        outcome: "declined",
        expectedVersion: declinedCart.version,
      },
    });
    const declined = cartSchema.parse(declinedResponse.json());
    expect(declined.lines).toHaveLength(1);
    expect(declined.addonOffer?.outcome).toBe("declined");

    const skippedCart = await createCartWithPrimary();
    const reviewResponse = await app.inject({
      method: "POST",
      url: `/v1/carts/${skippedCart.id}/review`,
      payload: { expectedVersion: skippedCart.version },
    });
    const skipped = cartWithSnapshotSchema.parse(reviewResponse.json());
    expect(skipped.cart.lines).toHaveLength(1);
    expect(skipped.cart.addonOffer?.outcome).toBe("skipped");
  });

  it("rejects direct accessory insertion and stale optimistic versions", async () => {
    const cart = await createCartWithPrimary();
    const accessory = await app.inject({
      method: "POST",
      url: `/v1/carts/${cart.id}/lines`,
      payload: {
        variantId: "addon-comfort-insoles-standard",
        quantity: 1,
        expectedVersion: cart.version,
      },
    });
    expect(accessory.statusCode).toBe(409);

    const stale = await app.inject({
      method: "POST",
      url: `/v1/carts/${cart.id}/lines`,
      payload: {
        variantId: "shoe-02-2-8",
        quantity: 1,
        expectedVersion: cart.version - 1,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(commerceErrorSchema.parse(stale.json()).error).toBe("conflict");
  });

  it("serializes concurrent cart mutations and approval submissions", async () => {
    const cart = await createCartWithPrimary();
    const mutations = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/carts/${cart.id}/lines`,
        payload: {
          variantId: "shoe-02-2-8",
          quantity: 1,
          expectedVersion: cart.version,
        },
      }),
      app.inject({
        method: "POST",
        url: `/v1/carts/${cart.id}/lines`,
        payload: {
          variantId: "shoe-03-2-8",
          quantity: 1,
          expectedVersion: cart.version,
        },
      }),
    ]);
    expect(mutations.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 409,
    ]);

    const latestResponse = await app.inject({
      method: "GET",
      url: `/v1/carts/${cart.id}`,
    });
    const latest = cartSchema.parse(latestResponse.json());
    const reviewResponse = await app.inject({
      method: "POST",
      url: `/v1/carts/${cart.id}/review`,
      payload: { expectedVersion: latest.version },
    });
    const review = cartWithSnapshotSchema.parse(reviewResponse.json());
    const approvalRequest = {
      method: "POST" as const,
      url: `/v1/carts/${cart.id}/approve`,
      payload: {
        expectedVersion: review.cart.version,
        snapshotId: review.snapshot.id,
        cartHash: review.snapshot.hash,
        userId: review.cart.userId,
      },
    };
    const approvals = await Promise.all([
      app.inject(approvalRequest),
      app.inject(approvalRequest),
    ]);
    expect(approvals.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 409,
    ]);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM approvals WHERE cart_id = $1",
      [cart.id],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("invalidates approval after a cart mutation", async () => {
    const cart = await createCartWithPrimary();
    const { approval } = await reviewAndApprove(cart);
    const mutation = await app.inject({
      method: "POST",
      url: `/v1/carts/${cart.id}/lines`,
      payload: {
        variantId: "shoe-02-2-8",
        quantity: 1,
        expectedVersion: approval.cart.version,
      },
    });
    expect(mutation.statusCode).toBe(200);

    const checkout = await app.inject({
      method: "POST",
      url: "/v1/checkouts",
      payload: { cartId: cart.id, approvalId: approval.approval.id },
    });
    expect(checkout.statusCode).toBe(409);
    expect(commerceErrorSchema.parse(checkout.json()).decision?.reason).toBe(
      "cart_mutated",
    );
  });

  it("permits only one checkout attempt under concurrent execution", async () => {
    const cart = await createCartWithPrimary();
    const { approval } = await reviewAndApprove(cart);
    const request = {
      method: "POST" as const,
      url: "/v1/checkouts",
      payload: { cartId: cart.id, approvalId: approval.approval.id },
    };
    const responses = await Promise.all([
      app.inject(request),
      app.inject(request),
    ]);
    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
      201, 409,
    ]);
    const success = responses.find(({ statusCode }) => statusCode === 201);
    expect(success).toBeDefined();
    if (success === undefined) return;
    expect(
      checkoutAuthorizationSchema.parse(success.json()).decision.reason,
    ).toBe("allowed");
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM checkout_attempts WHERE cart_id = $1",
      [cart.id],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("rejects over-budget, expired, stale-price, and stale-stock checkouts", async () => {
    const overBudget = await createCartWithPrimary(200_000);
    const overBudgetApproval = await reviewAndApprove(overBudget);
    const budgetResponse = await app.inject({
      method: "POST",
      url: "/v1/checkouts",
      payload: {
        cartId: overBudget.id,
        approvalId: overBudgetApproval.approval.approval.id,
      },
    });
    expect(
      commerceErrorSchema.parse(budgetResponse.json()).decision?.reason,
    ).toBe("budget_exceeded");

    const expiring = await createCartWithPrimary();
    const expiringApproval = await reviewAndApprove(expiring);
    currentTime = new Date(currentTime.valueOf() + 60_001);
    const expiredResponse = await app.inject({
      method: "POST",
      url: "/v1/checkouts",
      payload: {
        cartId: expiring.id,
        approvalId: expiringApproval.approval.approval.id,
      },
    });
    expect(
      commerceErrorSchema.parse(expiredResponse.json()).decision?.reason,
    ).toBe("approval_expired");

    const priceCart = await createCartWithPrimary();
    const priceApproval = await reviewAndApprove(priceCart);
    await pool.query(
      "UPDATE product_variants SET price_paise = price_paise + 100 WHERE id = 'shoe-01-2-8'",
    );
    try {
      const priceResponse = await app.inject({
        method: "POST",
        url: "/v1/checkouts",
        payload: {
          cartId: priceCart.id,
          approvalId: priceApproval.approval.approval.id,
        },
      });
      expect(
        commerceErrorSchema.parse(priceResponse.json()).decision?.reason,
      ).toBe("price_changed");
    } finally {
      await pool.query(
        "UPDATE product_variants SET price_paise = price_paise - 100 WHERE id = 'shoe-01-2-8'",
      );
    }

    const stockCart = await createCartWithPrimary();
    const stockApproval = await reviewAndApprove(stockCart);
    const stock = await pool.query<{ quantity: number }>(
      "UPDATE inventory SET quantity = 0 WHERE variant_id = 'shoe-01-2-8' RETURNING quantity",
    );
    expect(stock.rows[0]?.quantity).toBe(0);
    try {
      const stockResponse = await app.inject({
        method: "POST",
        url: "/v1/checkouts",
        payload: {
          cartId: stockCart.id,
          approvalId: stockApproval.approval.approval.id,
        },
      });
      expect(
        commerceErrorSchema.parse(stockResponse.json()).decision?.reason,
      ).toBe("stock_changed");
    } finally {
      await pool.query(
        "UPDATE inventory SET quantity = 10 WHERE variant_id = 'shoe-01-2-8'",
      );
    }
  });

  it("returns a redacted append-only audit timeline", async () => {
    const cart = await createCartWithPrimary();
    const timelineResponse = await app.inject({
      method: "GET",
      url: `/v1/carts/${cart.id}/audit`,
    });
    expect(timelineResponse.statusCode).toBe(200);
    const timeline = timelineResponse.json<unknown[]>();
    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(timeline)).not.toContain("paymentToken");

    const event = await pool.query<{ id: string }>(
      "SELECT id FROM audit_events WHERE entity_id = $1 LIMIT 1",
      [cart.id],
    );
    await expect(
      pool.query("UPDATE audit_events SET outcome = 'rejected' WHERE id = $1", [
        event.rows[0]?.id,
      ]),
    ).rejects.toThrow("append-only");
  });
});
import { randomUUID } from "node:crypto";
