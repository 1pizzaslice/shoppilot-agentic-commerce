import { describe, expect, it } from "vitest";

import {
  createDeterministicIdGenerator,
  createFakeShoppingModel,
  fixedClock,
} from "./index.js";

describe("testkit", () => {
  it("creates repeatable identifiers", () => {
    const ids = createDeterministicIdGenerator("order");

    expect([ids.next(), ids.next()]).toEqual(["order-0001", "order-0002"]);
  });

  it("returns defensive date copies", () => {
    const now = fixedClock("2026-09-04T00:00:00.000Z");

    expect(now()).not.toBe(now());
    expect(now().toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("normalizes expanded shopper colour aliases for deterministic demos", async () => {
    const model = createFakeShoppingModel();
    const baseIntent = { merchantId: "stepup-shoes", currency: "INR" } as const;

    await expect(
      model.extractIntent("purple running shoes", baseIntent),
    ).resolves.toMatchObject({ colour: "Violet Purple" });
    await expect(
      model.extractIntent("tan walking shoes", baseIntent),
    ).resolves.toMatchObject({ colour: "Sandstone" });
    await expect(
      model.extractIntent("white trainers", baseIntent),
    ).resolves.toMatchObject({ colour: "Clean White" });
  });
});
