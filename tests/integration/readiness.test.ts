import { afterAll, describe, expect, it } from "vitest";

import {
  createReadinessDependencies,
  createRedisRateLimiter,
} from "@shoppilot/db";

const readiness = createReadinessDependencies({
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6380",
});
const rateLimiter = createRedisRateLimiter(
  process.env.REDIS_URL ?? "redis://localhost:6380",
);

afterAll(() => Promise.all([readiness.close(), rateLimiter.close()]));

describe("infrastructure readiness", () => {
  it("connects to PostgreSQL and Redis", async () => {
    await expect(readiness.check()).resolves.toEqual([
      { name: "postgres", status: "up" },
      { name: "redis", status: "up" },
    ]);
  });

  it("atomically limits a correlation bucket without becoming a source of truth", async () => {
    const bucket = `integration-${String(Date.now())}`;
    await expect(rateLimiter.consume(bucket, 1, 60_000)).resolves.toMatchObject(
      {
        allowed: true,
        remaining: 0,
      },
    );
    await expect(rateLimiter.consume(bucket, 1, 60_000)).resolves.toMatchObject(
      {
        allowed: false,
        remaining: 0,
      },
    );
  });
});
