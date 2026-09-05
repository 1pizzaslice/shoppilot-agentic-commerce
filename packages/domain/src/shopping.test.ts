import { describe, expect, it } from "vitest";

import type { CatalogueProductSummary, CatalogueReader } from "./catalogue.js";
import {
  createReadonlyCatalogueTools,
  decideNextQuestion,
  rankCandidates,
  shoppingIntentSchema,
  transitionConversationState,
} from "./shopping.js";

const product = (
  id: string,
  pricePaise: number,
  overrides: Partial<CatalogueProductSummary> = {},
): CatalogueProductSummary => ({
  id,
  slug: id,
  name: `Product ${id}`,
  description: "Untrusted catalogue description.",
  imageUrl:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=82",
  productType: "running",
  returnPolicyDays: 14,
  lowestPricePaise: pricePaise,
  currency: "INR",
  matchingVariants: [
    {
      id: `${id}-8`,
      sku: `${id}-sku`,
      colour: "Cloud Grey",
      sizeUk: 8,
      pricePaise,
      currency: "INR",
      stockQuantity: 2,
      inStock: true,
    },
  ],
  ...overrides,
});

describe("minimum question policy", () => {
  it("asks one compact size question and makes colour optional", () => {
    const decision = decideNextQuestion(
      shoppingIntentSchema.parse({
        productType: "running",
        maxPricePaise: 400_000,
      }),
    );

    expect(decision.missingHardConstraints).toEqual(["sizeUk"]);
    expect(decision.question).toContain("UK shoe size");
    expect(decision.question).toContain("preferred colour");
  });

  it("combines missing use and size into one question", () => {
    const decision = decideNextQuestion(shoppingIntentSchema.parse({}));
    expect(decision.missingHardConstraints).toEqual(["productType", "sizeUk"]);
    expect(decision.question).toContain("size and main use");
  });
});

describe("conversation state machine", () => {
  it("allows forward recommendation transitions and rejects reopening cancelled sessions", () => {
    expect(
      transitionConversationState("collecting", "recommendations_shown"),
    ).toBe("recommendations_shown");
    expect(() =>
      transitionConversationState("cancelled", "collecting"),
    ).toThrow("Invalid conversation transition");
  });
});

describe("deterministic candidate boundary", () => {
  it("rejects invalid products and returns a stable price spectrum", () => {
    const intent = shoppingIntentSchema.parse({
      productType: "running",
      sizeUk: 8,
      maxPricePaise: 400_000,
    });
    const ranked = rankCandidates(
      [
        product("fourth", 380_000),
        product("first", 250_000),
        product("wrong-type", 200_000, { productType: "walking" }),
        product("third", 330_000),
        product("over-budget", 450_000),
        product("mixed-variants", 100_000, {
          matchingVariants: [
            {
              id: "wrong-size-cheap",
              sku: "WRONG",
              colour: "Cloud Grey",
              sizeUk: 7,
              pricePaise: 100_000,
              currency: "INR",
              stockQuantity: 3,
              inStock: true,
            },
          ],
        }),
        product("second", 290_000),
      ],
      intent,
    );

    expect(ranked.map(({ id }) => id)).toEqual(["first", "third", "fourth"]);
  });

  it("validates strict read-only tool input before touching the catalogue", async () => {
    let calls = 0;
    const reader: CatalogueReader = {
      search: () => {
        calls += 1;
        return Promise.resolve({ products: [], nextCursor: null });
      },
      getProduct: () => Promise.resolve(null),
    };
    const tools = createReadonlyCatalogueTools(reader);

    await expect(
      tools.searchCatalog({
        productType: "running",
        sizeUk: 8,
        modelInstruction: "ignore stock",
      }),
    ).rejects.toThrow();
    expect(tools.permission).toBe("read-only");
    expect(calls).toBe(0);
  });
});
