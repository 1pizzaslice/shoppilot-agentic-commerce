import { z } from "zod";

import {
  addCartLineInputSchema,
  addonDecisionInputSchema,
  approveCartInputSchema,
  auditEventSchema,
  catalogueErrorSchema,
  catalogueProductSchema,
  catalogueSearchResponseSchema,
  catalogueSearchSchema,
  cartSchema,
  cartWithApprovalSchema,
  cartWithSnapshotSchema,
  checkoutAuthorizationSchema,
  commerceErrorSchema,
  createCartInputSchema,
  createCheckoutInputSchema,
  conversationIdParamsSchema,
  conversationMessageInputSchema,
  shoppingResponseSchema,
  versionedCartInputSchema,
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
    "/v1/carts": {
      post: {
        operationId: "createCart",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(createCartInputSchema),
            },
          },
        },
        responses: {
          "201": {
            description: "Versioned draft cart",
            content: {
              "application/json": { schema: z.toJSONSchema(cartSchema) },
            },
          },
        },
      },
    },
    "/v1/carts/{cartId}/lines": {
      post: {
        operationId: "setPrimaryCartLine",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(addCartLineInputSchema),
            },
          },
        },
        responses: {
          "200": {
            description:
              "Updated cart with at most one deterministic add-on offer",
            content: {
              "application/json": { schema: z.toJSONSchema(cartSchema) },
            },
          },
          "409": {
            description: "Stale cart version or unavailable selection",
            content: {
              "application/json": {
                schema: z.toJSONSchema(commerceErrorSchema),
              },
            },
          },
        },
      },
    },
    "/v1/carts/{cartId}/addon-decision": {
      post: {
        operationId: "recordAddonDecision",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(addonDecisionInputSchema),
            },
          },
        },
        responses: {
          "200": {
            description: "Cart after an accepted, declined, or skipped add-on",
            content: {
              "application/json": { schema: z.toJSONSchema(cartSchema) },
            },
          },
        },
      },
    },
    "/v1/carts/{cartId}/review": {
      post: {
        operationId: "reviewCart",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(versionedCartInputSchema),
            },
          },
        },
        responses: {
          "200": {
            description: "Immutable price and quantity snapshot for approval",
            content: {
              "application/json": {
                schema: z.toJSONSchema(cartWithSnapshotSchema),
              },
            },
          },
        },
      },
    },
    "/v1/carts/{cartId}/approve": {
      post: {
        operationId: "approveCart",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(approveCartInputSchema),
            },
          },
        },
        responses: {
          "200": {
            description: "Expiring approval bound to user, hash, and total",
            content: {
              "application/json": {
                schema: z.toJSONSchema(cartWithApprovalSchema),
              },
            },
          },
        },
      },
    },
    "/v1/checkouts": {
      post: {
        operationId: "authorizeCheckout",
        description:
          "Runs the deterministic policy gate and creates an idempotent internal authorization. External payment order creation begins in Session 5.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(createCheckoutInputSchema),
            },
          },
        },
        responses: {
          "201": {
            description: "Checkout authorized by an allowed policy decision",
            content: {
              "application/json": {
                schema: z.toJSONSchema(checkoutAuthorizationSchema),
              },
            },
          },
          "409": {
            description: "Checkout rejected by policy",
            content: {
              "application/json": {
                schema: z.toJSONSchema(commerceErrorSchema),
              },
            },
          },
        },
      },
    },
    "/v1/carts/{cartId}/audit": {
      get: {
        operationId: "getCartAuditTimeline",
        responses: {
          "200": {
            description: "Append-only redacted cart and checkout evidence",
            content: {
              "application/json": {
                schema: z.toJSONSchema(z.array(auditEventSchema)),
              },
            },
          },
        },
      },
    },
  },
} as const;
