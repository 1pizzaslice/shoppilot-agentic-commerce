import { describe, expect, it } from "vitest";

import { makeHealthReport } from "./health.js";

describe("makeHealthReport", () => {
  it("reports ready when every dependency is up", () => {
    expect(
      makeHealthReport("api", [
        { name: "postgres", status: "up" },
        { name: "redis", status: "up" },
      ]).status,
    ).toBe("ready");
  });

  it("reports degraded when a dependency is down", () => {
    expect(
      makeHealthReport("worker", [{ name: "redis", status: "down" }]).status,
    ).toBe("degraded");
  });
});
