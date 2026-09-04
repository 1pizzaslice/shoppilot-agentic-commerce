import { afterEach, describe, expect, it } from "vitest";

import {
  createShoppingConversationHandler,
  shoppingResponseSchema,
  type CatalogueReader,
} from "@shoppilot/domain";
import {
  createDeterministicIdGenerator,
  createFakeShoppingModel,
  createMemoryConversationStore,
  createUnavailableCommerceService,
} from "@shoppilot/testkit";

import { buildApi } from "./app.js";

const catalogue: CatalogueReader = {
  search: (input) =>
    Promise.resolve({
      products:
        input.maxPricePaise !== undefined && input.maxPricePaise < 300_000
          ? []
          : [1, 2, 3, 4].map((number) => ({
              id: `shoe-${String(number)}`,
              slug: `shoe-${String(number)}`,
              name: `Shoe ${String(number)}`,
              description: "Canonical catalogue data.",
              productType: "running" as const,
              returnPolicyDays: 14,
              lowestPricePaise: 300_000 + number * 10_000,
              currency: "INR" as const,
              matchingVariants: [
                {
                  id: `variant-${String(number)}`,
                  sku: `SKU-${String(number)}`,
                  colour: "Cloud Grey",
                  sizeUk: 8,
                  pricePaise: 300_000 + number * 10_000,
                  currency: "INR" as const,
                  stockQuantity: 3,
                  inStock: true,
                },
              ],
            })),
      nextCursor: null,
    }),
  getProduct: () => Promise.resolve(null),
};

const apps: ReturnType<typeof buildApi>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

const setup = () => {
  const store = createMemoryConversationStore();
  const ids = createDeterministicIdGenerator("conversation");
  const app = buildApi({
    readiness: { check: () => Promise.resolve([]) },
    catalogue,
    conversation: createShoppingConversationHandler({
      model: createFakeShoppingModel(),
      catalogue,
      store,
      nextId: ids.next,
    }),
    commerce: createUnavailableCommerceService(),
  });
  apps.push(app);
  return { app, store };
};

describe("recorded shopping conversation", () => {
  it("asks once for size, then returns at most three grounded choices", async () => {
    const { app, store } = setup();
    const first = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      payload: { message: "Running shoes under ₹4,000" },
    });
    expect(first.statusCode).toBe(201);
    const question = shoppingResponseSchema.parse(first.json());
    expect(question.kind).toBe("question");
    expect(question.message).toContain("UK shoe size");

    const second = await app.inject({
      method: "POST",
      url: `/v1/conversations/${question.conversationId}/messages`,
      payload: { message: "8" },
    });
    const recommendations = shoppingResponseSchema.parse(second.json());
    expect(recommendations.kind).toBe("recommendations");
    expect(recommendations.recommendations).toHaveLength(3);
    expect(
      recommendations.recommendations.every(
        ({ productId, variant }) =>
          productId.startsWith("shoe-") &&
          variant.sizeUk === 8 &&
          variant.pricePaise <= 400_000 &&
          variant.inStock,
      ),
    ).toBe(true);
    expect(store.turns).toHaveLength(2);
    expect(
      store.turns.flatMap(({ events }) => events).map(({ name }) => name),
    ).toContain("searchCatalog");
  });

  it("admits when no catalogue product satisfies all constraints", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      payload: { message: "Running shoes under ₹2,000 size 8" },
    });
    const body = shoppingResponseSchema.parse(response.json());
    expect(body.kind).toBe("no_results");
    expect(body.notice).toContain("No valid catalogue products");
  });

  it("admits when fewer than three valid products exist", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      payload: { message: "Running shoes under ₹3,250 size 8" },
    });
    const body = shoppingResponseSchema.parse(response.json());
    expect(body.kind).toBe("recommendations");
    expect(body.recommendations).toHaveLength(2);
    expect(body.notice).toBe("Only 2 valid products matched all constraints.");
  });
});
