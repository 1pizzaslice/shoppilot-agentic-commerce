import { AsyncLocalStorage } from "node:async_hooks";

import { Redis } from "ioredis";
import { Pool } from "pg";

const correlationStorage = new AsyncLocalStorage<string>();

export const enterCorrelationContext = (correlationId: string): void => {
  correlationStorage.enterWith(correlationId);
};

export const currentCorrelationId = (): string =>
  correlationStorage.getStore() ?? "system";

export const createRuntimePool = (databaseUrl: string, max = 10): Pool =>
  new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 10_000,
    max,
    query_timeout: 12_000,
    statement_timeout: 10_000,
  });

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume: (
    bucket: string,
    limit: number,
    windowMs: number,
  ) => Promise<RateLimitDecision>;
  close: () => Promise<void>;
}

const consumeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

export const createRedisRateLimiter = (redisUrl: string): RateLimiter => {
  const redis = new Redis(redisUrl, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  redis.on("error", () => {
    // Callers receive a rejected consume operation without leaking the URL.
  });

  return {
    consume: async (bucket, limit, windowMs) => {
      if (redis.status === "wait") await redis.connect();
      const raw: unknown = await redis.eval(
        consumeScript,
        1,
        `shoppilot:rate:${bucket}`,
        String(windowMs),
      );
      if (
        !Array.isArray(raw) ||
        typeof raw[0] !== "number" ||
        typeof raw[1] !== "number"
      ) {
        throw new Error("Redis returned an invalid rate-limit result");
      }
      const count = raw[0];
      const ttlMs = Math.max(raw[1], 0);
      return {
        allowed: count <= limit,
        remaining: Math.max(limit - count, 0),
        retryAfterSeconds: Math.max(Math.ceil(ttlMs / 1_000), 1),
      };
    },
    close: () => {
      redis.disconnect();
      return Promise.resolve();
    },
  };
};
