import { z } from "zod";

export const discoverySchema = z
  .object({
    protocol: z.literal("shoppilot-catalogue"),
    version: z.literal("1.0"),
    ucpConformance: z.literal(false),
    description: z.string().min(1),
    merchant: z.object({ id: z.string(), name: z.string() }).strict(),
    capabilities: z
      .object({
        search: z
          .object({
            method: z.literal("POST"),
            path: z.string().startsWith("/"),
          })
          .strict(),
        productLookup: z
          .object({
            method: z.literal("GET"),
            pathTemplate: z.string().startsWith("/"),
          })
          .strict(),
        openapi: z
          .object({
            method: z.literal("GET"),
            path: z.string().startsWith("/"),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type DiscoveryDocument = z.infer<typeof discoverySchema>;
