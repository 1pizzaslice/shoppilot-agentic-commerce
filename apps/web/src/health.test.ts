import { describe, expect, it } from "vitest";

import { GET } from "../app/api/health/route.js";

describe("web health route", () => {
  it("returns a validated readiness document", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "web",
      status: "ready",
      dependencies: [],
    });
  });
});
