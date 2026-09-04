import { z } from "zod";

import {
  catalogueErrorSchema,
  catalogueProductSchema,
  catalogueSearchResponseSchema,
  catalogueSearchSchema,
  conversationIdParamsSchema,
  conversationMessageInputSchema,
  shoppingResponseSchema,
} from "@shoppilot/domain";

export const discoverySchema = z
  .object({
    protocol: z.literal("shoppilot-catalogue"),
    version: z.literal("1.0"),
    ucpConformance: z.literal(false),
    description: z.string(),
    merchant: z.object({ id: z.string(), name: z.string() }).strict(),
    capabilities: z
      .object({
        search: z
          .object({ method: z.literal("POST"), path: z.string() })
          .strict(),
        productLookup: z
          .object({ method: z.literal("GET"), pathTemplate: z.string() })
          .strict(),
        openapi: z
          .object({ method: z.literal("GET"), path: z.string() })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const discoveryDocument = discoverySchema.parse({
  protocol: "shoppilot-catalogue",
  version: "1.0",
  ucpConformance: false,
  description:
    "A standards-inspired subset for catalogue discovery; this implementation is not UCP-conformant.",
  merchant: { id: "stepup-shoes", name: "StepUp Shoes" },
  capabilities: {
    search: { method: "POST", path: "/v1/catalog/search" },
    productLookup: {
      method: "GET",
      pathTemplate: "/v1/catalog/products/{idOrSlug}",
    },
    openapi: { method: "GET", path: "/openapi.json" },
  },
});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "ShopPilot Catalogue API",
    version: "1.0.0",
    description:
      "Machine-readable catalogue subset inspired by UCP discovery concepts; not UCP-conformant.",
  },
  paths: {
    "/.well-known/ucp": {
      get: {
        operationId: "discoverCatalogue",
        responses: {
          "200": {
            description: "Implemented capabilities",
            content: {
              "application/json": { schema: z.toJSONSchema(discoverySchema) },
            },
          },
        },
      },
    },
    "/v1/catalog/search": {
      post: {
        operationId: "searchCatalogue",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(catalogueSearchSchema),
            },
          },
        },
        responses: {
          "200": {
            description: "Matching products and exact eligible variants",
            content: {
              "application/json": {
                schema: z.toJSONSchema(catalogueSearchResponseSchema),
              },
            },
          },
          "400": {
            description: "Invalid search request",
            content: {
              "application/json": {
                schema: z.toJSONSchema(catalogueErrorSchema),
              },
            },
          },
        },
      },
    },
    "/v1/catalog/products/{idOrSlug}": {
      get: {
        operationId: "getCatalogueProduct",
        parameters: [
          {
            in: "path",
            name: "idOrSlug",
            required: true,
            schema: { type: "string", minLength: 1 },
          },
        ],
        responses: {
          "200": {
            description:
              "Canonical product, variants, inventory, and compatible add-ons",
            content: {
              "application/json": {
                schema: z.toJSONSchema(catalogueProductSchema),
              },
            },
          },
          "404": {
            description: "Product not found",
            content: {
              "application/json": {
                schema: z.toJSONSchema(catalogueErrorSchema),
              },
            },
          },
        },
      },
    },
    "/v1/conversations": {
      post: {
        operationId: "startShoppingConversation",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(conversationMessageInputSchema),
            },
          },
        },
        responses: {
          "201": {
            description:
              "Clarification, grounded recommendations, or no result",
            content: {
              "application/json": {
                schema: z.toJSONSchema(shoppingResponseSchema),
              },
            },
          },
        },
      },
    },
    "/v1/conversations/{conversationId}/messages": {
      post: {
        operationId: "continueShoppingConversation",
        parameters: [
          {
            in: "path",
            name: "conversationId",
            required: true,
            schema: z.toJSONSchema(
              conversationIdParamsSchema.shape.conversationId,
            ),
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(conversationMessageInputSchema),
            },
          },
        },
        responses: {
          "200": {
            description: "Next deterministic conversation outcome",
            content: {
              "application/json": {
                schema: z.toJSONSchema(shoppingResponseSchema),
              },
            },
          },
        },
      },
    },
  },
} as const;
