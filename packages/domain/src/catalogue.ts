import { z } from "zod";

export const currencySchema = z.literal("INR");
export const productTypeSchema = z.enum([
  "running",
  "walking",
  "training",
  "trail",
  "casual",
  "accessory",
]);

export const catalogueSearchSchema = z
  .object({
    merchantId: z.string().min(1).default("stepup-shoes"),
    query: z.string().trim().min(1).max(100).optional(),
    maxPricePaise: z.number().int().positive().optional(),
    currency: currencySchema.default("INR"),
    sizeUk: z.number().int().min(4).max(13).optional(),
    productType: productTypeSchema.optional(),
    inStockOnly: z.boolean().default(true),
    colour: z.string().trim().min(1).max(40).optional(),
    limit: z.number().int().min(1).max(20).default(10),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export const catalogueVariantSchema = z
  .object({
    id: z.string(),
    sku: z.string(),
    colour: z.string(),
    sizeUk: z.number().int().nullable(),
    pricePaise: z.number().int().nonnegative(),
    currency: currencySchema,
    stockQuantity: z.number().int().nonnegative(),
    inStock: z.boolean(),
  })
  .strict();

export const catalogueProductSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    imageUrl: z.url().startsWith("https://"),
    productType: productTypeSchema,
    returnPolicyDays: z.number().int().nonnegative(),
    lowestPricePaise: z.number().int().nonnegative(),
    currency: currencySchema,
    matchingVariants: z.array(catalogueVariantSchema).min(1),
  })
  .strict();

export const catalogueSearchResponseSchema = z
  .object({
    products: z.array(catalogueProductSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const compatibleAddonSchema = z
  .object({
    productId: z.string(),
    name: z.string(),
    reason: z.string(),
    variants: z.array(catalogueVariantSchema),
  })
  .strict();

export const catalogueProductSchema = catalogueProductSummarySchema
  .omit({ matchingVariants: true, lowestPricePaise: true, currency: true })
  .extend({
    merchantId: z.string(),
    catalogueVersion: z.number().int().positive(),
    variants: z.array(catalogueVariantSchema).min(1),
    compatibleAddons: z.array(compatibleAddonSchema),
  })
  .strict();

export const catalogueErrorSchema = z
  .object({
    error: z.enum(["invalid_request", "not_found", "internal_error"]),
    message: z.string(),
  })
  .strict();

export type CatalogueSearch = z.infer<typeof catalogueSearchSchema>;
export type CatalogueVariant = z.infer<typeof catalogueVariantSchema>;
export type CatalogueProductSummary = z.infer<
  typeof catalogueProductSummarySchema
>;
export type CatalogueSearchResponse = z.infer<
  typeof catalogueSearchResponseSchema
>;
export type CatalogueProduct = z.infer<typeof catalogueProductSchema>;

export interface CatalogueReader {
  search: (input: CatalogueSearch) => Promise<CatalogueSearchResponse>;
  getProduct: (idOrSlug: string) => Promise<CatalogueProduct | null>;
}
