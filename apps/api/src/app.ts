import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import {
  catalogueErrorSchema,
  catalogueProductSchema,
  catalogueSearchResponseSchema,
  catalogueSearchSchema,
  makeHealthReport,
  type CatalogueReader,
} from "@shoppilot/domain";
import type { ReadinessDependencies } from "@shoppilot/db";

import {
  discoveryDocument,
  discoverySchema,
  openApiDocument,
} from "./catalogue-contract.js";

export interface ApiDependencies {
  readiness: Pick<ReadinessDependencies, "check">;
  catalogue: CatalogueReader;
}

const productParamsSchema = z
  .object({ idOrSlug: z.string().min(1).max(160) })
  .strict();

export const buildApi = ({
  readiness,
  catalogue,
}: ApiDependencies): FastifyInstance => {
  const app = Fastify({ logger: false });

  app.get("/health/live", () => ({ status: "alive" }));
  app.get("/health", async (_request, reply) => {
    const report = makeHealthReport("api", await readiness.check());
    if (report.status === "degraded") {
      return reply.code(503).send(report);
    }

    return report;
  });

  app.get("/.well-known/ucp", () => discoverySchema.parse(discoveryDocument));
  app.get("/openapi.json", () => openApiDocument);

  app.post("/v1/catalog/search", async (request, reply) => {
    const parsed = catalogueSearchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(
        catalogueErrorSchema.parse({
          error: "invalid_request",
          message: "Search filters are invalid.",
        }),
      );
    }

    const response = await catalogue.search(parsed.data);
    return catalogueSearchResponseSchema.parse(response);
  });

  app.get("/v1/catalog/products/:idOrSlug", async (request, reply) => {
    const parsed = productParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send(
        catalogueErrorSchema.parse({
          error: "invalid_request",
          message: "Product identifier is invalid.",
        }),
      );
    }

    const product = await catalogue.getProduct(parsed.data.idOrSlug);
    if (product === null) {
      return reply.code(404).send(
        catalogueErrorSchema.parse({
          error: "not_found",
          message: "Product not found.",
        }),
      );
    }

    return catalogueProductSchema.parse(product);
  });

  return app;
};
