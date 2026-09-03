import Fastify, { type FastifyInstance } from "fastify";

import { makeHealthReport } from "@shoppilot/domain";
import type { ReadinessDependencies } from "@shoppilot/db";

export interface ApiDependencies {
  readiness: Pick<ReadinessDependencies, "check">;
}

export const buildApi = ({ readiness }: ApiDependencies): FastifyInstance => {
  const app = Fastify({ logger: false });

  app.get("/health/live", () => ({ status: "alive" }));
  app.get("/health", async (_request, reply) => {
    const report = makeHealthReport("api", await readiness.check());
    if (report.status === "degraded") {
      return reply.code(503).send(report);
    }

    return report;
  });

  return app;
};
