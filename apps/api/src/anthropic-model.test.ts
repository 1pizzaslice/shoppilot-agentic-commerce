import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createAnthropicShoppingModel } from "./anthropic-model.js";

const responseWith = (value: unknown): Response =>
  new Response(
    JSON.stringify({
      type: "message",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(value) }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("Anthropic shopping model adapter", () => {
  it("uses Messages structured output and validates intent", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        responseWith({
          productType: "running",
          maxPricePaise: 400_000,
          sizeUk: null,
          colour: null,
        }),
      ),
    );
    const model = createAnthropicShoppingModel({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    });

    await expect(
      model.extractIntent("running shoes under 4000", {
        merchantId: "stepup-shoes",
        currency: "INR",
      }),
    ).resolves.toEqual({
      productType: "running",
      maxPricePaise: 400_000,
    });
    const request = fetchImpl.mock.calls[0];
    expect(request?.[0]).toBe("https://api.anthropic.com/v1/messages");
    const init = request?.[1];
    expect(init?.headers).toMatchObject({
      authorization: "Bearer test-key",
      "anthropic-version": "2023-06-01",
    });
    if (typeof init?.body !== "string") {
      throw new Error("Expected a JSON string request body");
    }
    const payload: unknown = JSON.parse(init.body);
    expect(payload).toMatchObject({
      model: "test-model",
      output_config: { format: { type: "json_schema" } },
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /\$(?:schema)|minimum|maximum|minLength|maxLength/,
    );
  });

  it("rejects malformed external output", async () => {
    const model = createAnthropicShoppingModel({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: () => Promise.resolve(responseWith({ productType: "boots" })),
    });

    await expect(
      model.extractIntent("boots", {
        merchantId: "stepup-shoes",
        currency: "INR",
      }),
    ).rejects.toThrow();
  });

  it("keeps only known product explanations and bounds model wording", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        responseWith({
          explanations: [
            {
              productId: "unknown-product",
              fit: "Unknown",
              tradeoff: "Unknown",
            },
            {
              productId: "shoe-01",
              fit: "x".repeat(220),
              tradeoff: "It costs ₹2,299 and has 5 units in stock.",
            },
            {
              productId: "shoe-01",
              fit: "Duplicate",
              tradeoff: "Duplicate",
            },
          ],
        }),
      ),
    );
    const model = createAnthropicShoppingModel({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    });

    const explanations = await model.explainRecommendations(
      [
        {
          id: "shoe-01",
          slug: "aero-pace",
          name: "Aero Pace",
          description: "Catalogue description",
          imageUrl:
            "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=82",
          productType: "running",
          returnPolicyDays: 14,
          lowestPricePaise: 229_900,
          currency: "INR",
          matchingVariants: [
            {
              id: "variant-01",
              sku: "STEP-01-8",
              colour: "Midnight Blue",
              sizeUk: 8,
              pricePaise: 229_900,
              currency: "INR",
              stockQuantity: 5,
              inStock: true,
            },
          ],
        },
      ],
      {
        merchantId: "stepup-shoes",
        productType: "running",
        maxPricePaise: 400_000,
        currency: "INR",
        sizeUk: 8,
      },
    );

    expect(explanations).toHaveLength(1);
    expect(explanations[0]?.productId).toBe("shoe-01");
    expect(explanations[0]?.fit).toHaveLength(180);
    expect(explanations[0]?.fit.endsWith("…")).toBe(true);
    const request = fetchImpl.mock.calls[0]?.[1];
    if (typeof request?.body !== "string") {
      throw new Error("Expected a JSON string request body");
    }
    const payload = z
      .object({ system: z.string() })
      .passthrough()
      .parse(JSON.parse(request.body));
    expect(payload.system).toContain("Do not compare it with another product");
  });

  it("rejects truncated model output", async () => {
    const model = createAnthropicShoppingModel({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              type: "message",
              stop_reason: "max_tokens",
              content: [{ type: "text", text: "{}" }],
            }),
            { status: 200 },
          ),
        ),
    });

    await expect(
      model.extractIntent("running shoes", {
        merchantId: "stepup-shoes",
        currency: "INR",
      }),
    ).rejects.toThrow(/output limit/);
  });
});
