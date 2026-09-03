import { afterEach, describe, expect, it } from "vitest";

import type { DependencyStatus } from "@shoppilot/domain";

import { buildApi } from "./app.js";

const apps: ReturnType<typeof buildApi>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

const createApp = (statuses: readonly DependencyStatus[]) => {
  const app = buildApi({
    readiness: { check: () => Promise.resolve(statuses) },
  });
  apps.push(app);
  return app;
};

describe("API health", () => {
  it("separates liveness from dependency readiness", async () => {
    const app = createApp([
      { name: "postgres", status: "down" },
      { name: "redis", status: "down" },
    ]);

    expect(
      (await app.inject({ method: "GET", url: "/health/live" })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/health" })).statusCode,
    ).toBe(503);
  });

  it("reports ready only when PostgreSQL and Redis respond", async () => {
    const response = await createApp([
      { name: "postgres", status: "up" },
      { name: "redis", status: "up" },
    ]).inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "api",
      status: "ready",
      dependencies: [
        { name: "postgres", status: "up" },
        { name: "redis", status: "up" },
      ],
    });
  });
});
