import { describe, expect, it, vi } from "vitest";

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
