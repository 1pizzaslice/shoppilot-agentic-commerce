import { afterAll, describe, expect, it } from "vitest";

import { createReadinessDependencies } from "@shoppilot/db";

const readiness = createReadinessDependencies({
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6380",
});

afterAll(() => readiness.close());

describe("infrastructure readiness", () => {
  it("connects to PostgreSQL and Redis", async () => {
    await expect(readiness.check()).resolves.toEqual([
      { name: "postgres", status: "up" },
      { name: "redis", status: "up" },
    ]);
  });
});
