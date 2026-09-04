import { describe, expect, it, vi } from "vitest";

import { createOpenAIShoppingModel } from "./openai-model.js";

const responseWith = (value: unknown): Response =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(value) }],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("OpenAI shopping model adapter", () => {
  it("uses non-stored Responses structured output and validates intent", async () => {
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
    const model = createOpenAIShoppingModel({
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
    expect(request?.[0]).toBe("https://api.openai.com/v1/responses");
    const init = request?.[1];
    if (typeof init?.body !== "string") {
      throw new Error("Expected a JSON string request body");
    }
    const payload: unknown = JSON.parse(init.body);
    expect(payload).toMatchObject({
      model: "test-model",
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
  });

  it("rejects malformed external output", async () => {
    const model = createOpenAIShoppingModel({
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
});
