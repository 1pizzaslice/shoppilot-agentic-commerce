import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { buildApi } from "../../apps/api/src/app.js";
import {
  createPostgresCatalogueReader,
  createPostgresCommerceService,
  createPostgresMerchantGrowthReader,
  createPostgresPaymentService,
  migrateCatalogue,
  seedCatalogue,
} from "@shoppilot/db";
import { merchantGrowthSummarySchema } from "@shoppilot/domain";
import {
  createDeterministicIdGenerator,
  createFakePaymentProvider,
} from "../../packages/testkit/src/index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot";
const pool = new Pool({ connectionString: databaseUrl, max: 10 });
const ids = createDeterministicIdGenerator(`growth-${randomUUID()}`);
const now = () => new Date("2026-09-04T14:00:00.000Z");
const commerce = createPostgresCommerceService(pool, { nextId: ids.next, now });
const provider = createFakePaymentProvider();
const payments = createPostgresPaymentService(pool, provider, {
  nextId: ids.next,
  now,
});
const growth = createPostgresMerchantGrowthReader(pool);
const app = buildApi({
  readiness: { check: () => Promise.resolve([]) },
  catalogue: createPostgresCatalogueReader(pool),
  conversation: {
    start: () => Promise.reject(new Error("not used")),
    continue: () => Promise.reject(new Error("not used")),
  },
  commerce,
  payments,
  growth,
});

beforeAll(async () => {
  await migrateCatalogue(pool);
  await seedCatalogue(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const completePaidCart = async (outcome: "accepted" | "declined") => {
  const cart = await commerce.createCart({
    merchantId: "stepup-shoes",
    userId: ids.next(),
    currency: "INR",
  });
  const offered = await commerce.addPrimaryLine(cart.id, {
    variantId: "shoe-01-1-8",
    quantity: 1,
    expectedVersion: cart.version,
  });
  const offer = offered.addonOffer;
  if (offer === null) throw new Error("Expected compatible add-on");
  const decided = await commerce.decideAddon(cart.id, {
    offerId: offer.id,
    outcome,
    expectedVersion: offered.version,
  });
  const { cart: reviewed, snapshot } = await commerce.reviewCart(
    cart.id,
    decided.version,
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
  if (authorization.attempt === null) throw new Error("Expected checkout");
  const launch = await payments.createOrder(authorization.attempt.id);
  const orderId = launch.payment.providerOrderId;
  if (orderId === null) throw new Error("Expected provider order");
  const rawBody = Buffer.from(
    JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: ids.next(),
            order_id: orderId,
            status: "captured",
          },
        },
      },
    }),
  );
  await payments.processWebhook({
    eventId: ids.next(),
    signature: provider.webhookSignature(rawBody),
    rawBody,
  });
};

describe("merchant growth evidence", () => {
  it("derives funnel, value, attach rate, and simulation from stored evidence", async () => {
    const empty = await growth.getSummary("stepup-shoes");
    expect(empty.orderValues.grossOrderValuePaise).toBe(0);
    expect(empty.orderValues.attachRateBasisPoints).toBe(0);
    expect(empty.recentSuggestions).toEqual([]);

    await completePaidCart("accepted");
    await completePaidCart("declined");

    const response = await app.inject({
      method: "GET",
      url: "/v1/merchants/stepup-shoes/growth",
    });
    expect(response.statusCode).toBe(200);
    const summary = merchantGrowthSummarySchema.parse(response.json());
    expect(summary.funnel).toEqual({
      cartsCreated: 2,
      cartsReviewed: 2,
      cartsApproved: 2,
      checkoutsStarted: 2,
      paidOrders: 2,
    });
    expect(summary.addonOutcomes).toEqual({
      offered: 2,
      accepted: 1,
      declined: 1,
      skipped: 0,
    });
    expect(summary.orderValues).toEqual({
      baseCartValuePaise: 499_800,
      acceptedAddonValuePaise: 69_900,
      grossOrderValuePaise: 569_700,
      averageOrderValuePaise: 284_850,
      attachRateBasisPoints: 5_000,
    });
    expect(summary.simulation).toEqual({
      label: "Fixed historical-cart simulation — not causal",
      scenarioCount: 2,
      noAddonValuePaise: 499_800,
      compatibilityPolicyValuePaise: 569_700,
      incrementalAddonValuePaise: 69_900,
    });
    expect(
      summary.recentSuggestions.map(({ outcome, checkoutState }) => ({
        outcome,
        checkoutState,
      })),
    ).toEqual([
      { outcome: "declined", checkoutState: "paid" },
      { outcome: "accepted", checkoutState: "paid" },
    ]);
    expect(summary.recentSuggestions[0]?.reason).toContain("construction");
    expect(summary.catalogue).toMatchObject({
      shoeStyles: 48,
      accessories: 4,
      priceFloorPaise: 249_900,
      priceCeilingPaise: 699_900,
    });
    expect(summary.catalogue.categories).toHaveLength(5);
    expect(summary.catalogue.featuredProducts).toHaveLength(5);
    expect(summary.definitions.map(({ key }) => key)).toContain(
      "Fixed simulation",
    );
  });
});
