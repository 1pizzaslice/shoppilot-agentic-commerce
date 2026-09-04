import { createReadinessDependencies } from "@shoppilot/db";
import { parseWorkerEnvironment } from "@shoppilot/domain";

import { checkWorkerReadiness } from "./readiness.js";

const environment = parseWorkerEnvironment(process.env);
const correlationId = randomUUID();
const readiness = createReadinessDependencies({
  databaseUrl: environment.DATABASE_URL,
  redisUrl: environment.REDIS_URL,
});

const report = await checkWorkerReadiness(readiness);
process.stdout.write(
  `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: report.status === "ready" ? "info" : "error",
    service: "worker",
    event: "worker_readiness_checked",
    correlationId,
    report,
  })}\n`,
);

if (process.argv.includes("--health-check")) {
  await readiness.close();
  process.exitCode = report.status === "ready" ? 0 : 1;
} else if (report.status !== "ready") {
  await readiness.close();
  process.exitCode = 1;
} else {
  const heartbeat = setInterval(() => undefined, 60_000);
  const shutdown = async (): Promise<void> => {
    clearInterval(heartbeat);
    await readiness.close();
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
import { randomUUID } from "node:crypto";
