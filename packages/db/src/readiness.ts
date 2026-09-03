import { Redis } from "ioredis";
import { Pool } from "pg";

import type { DependencyStatus } from "@shoppilot/domain";

export interface ReadinessDependencies {
  check: () => Promise<readonly DependencyStatus[]>;
  close: () => Promise<void>;
}

export interface DependencyUrls {
  databaseUrl: string;
  redisUrl: string;
}

const statusAfter = async (
  name: DependencyStatus["name"],
  operation: () => Promise<unknown>,
): Promise<DependencyStatus> => {
  try {
    await operation();
    return { name, status: "up" };
  } catch {
    return { name, status: "down" };
  }
};

export const createReadinessDependencies = ({
  databaseUrl,
  redisUrl,
}: DependencyUrls): ReadinessDependencies => {
  const postgres = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 2,
  });
  const redis = new Redis(redisUrl, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });

  redis.on("error", () => {
    // Readiness calls expose dependency failures without logging connection data.
  });

  return {
    check: async () => {
      const [postgresStatus, redisStatus] = await Promise.all([
        statusAfter("postgres", async () => postgres.query("SELECT 1")),
        statusAfter("redis", async () => {
          if (redis.status === "wait") {
            await redis.connect();
          }
          await redis.ping();
        }),
      ]);

      return [postgresStatus, redisStatus];
    },
    close: async () => {
      redis.disconnect();
      await postgres.end();
    },
  };
};
