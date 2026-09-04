import { afterEach, describe, expect, it } from "vitest";

import type {
  CatalogueReader,
  DependencyStatus,
  ShoppingConversationHandler,
} from "@shoppilot/domain";

import { buildApi } from "./app.js";

const apps: ReturnType<typeof buildApi>[] = [];
const emptyCatalogue: CatalogueReader = {
  search: () => Promise.resolve({ products: [], nextCursor: null }),
  getProduct: () => Promise.resolve(null),
};
const emptyConversation: ShoppingConversationHandler = {
  start: () => Promise.reject(new Error("not used")),
  continue: () => Promise.reject(new Error("not used")),
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

const createApp = (statuses: readonly DependencyStatus[]) => {
  const app = buildApi({
    readiness: { check: () => Promise.resolve(statuses) },
    catalogue: emptyCatalogue,
    conversation: emptyConversation,
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

describe("catalogue contract", () => {
  it("publishes explicit subset discovery and OpenAPI documents", async () => {
    const app = createApp([]);
    const discovery = await app.inject({
      method: "GET",
      url: "/.well-known/ucp",
    });
    const openapi = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(discovery.statusCode).toBe(200);
    expect(discovery.json()).toMatchObject({
      protocol: "shoppilot-catalogue",
      ucpConformance: false,
    });
    const document: unknown = openapi.json();
    expect(document).toMatchObject({ openapi: "3.1.0" });
    expect(JSON.stringify(document)).toContain("/v1/catalog/search");
  });

  it("rejects malformed search input before calling the catalogue", async () => {
    const app = createApp([]);
    const response = await app.inject({
      method: "POST",
      url: "/v1/catalog/search",
      payload: { maxPricePaise: 3999.5, unknown: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_request",
      message: "Search filters are invalid.",
    });
  });
});
