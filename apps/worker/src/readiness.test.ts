import { describe, expect, it } from "vitest";

import { checkWorkerReadiness } from "./readiness.js";

describe("worker readiness", () => {
  it("reports dependency failure without claiming readiness", async () => {
    const report = await checkWorkerReadiness({
      check: () =>
        Promise.resolve([
          { name: "postgres", status: "up" },
          { name: "redis", status: "down" },
        ]),
    });

    expect(report).toMatchObject({ service: "worker", status: "degraded" });
  });
});
