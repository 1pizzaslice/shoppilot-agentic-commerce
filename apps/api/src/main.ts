import {
  createCatalogueDependencies,
  createReadinessDependencies,
} from "@shoppilot/db";
import { parseApiEnvironment } from "@shoppilot/domain";

import { buildApi } from "./app.js";

const environment = parseApiEnvironment(process.env);
const readiness = createReadinessDependencies({
  databaseUrl: environment.DATABASE_URL,
  redisUrl: environment.REDIS_URL,
});
const catalogue = createCatalogueDependencies(environment.DATABASE_URL);
const app = buildApi({ readiness, catalogue });

const shutdown = async (): Promise<void> => {
  await app.close();
  await catalogue.close();
  await readiness.close();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error: unknown) {
  await catalogue.close();
  await readiness.close();
  throw error;
}
