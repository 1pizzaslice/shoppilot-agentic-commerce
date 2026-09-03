import { describe, expect, it } from "vitest";

import { createDeterministicIdGenerator, fixedClock } from "./index.js";

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
});
