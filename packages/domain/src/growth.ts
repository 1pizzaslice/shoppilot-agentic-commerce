import { z } from "zod";

import { addonOutcomeSchema, checkoutStateSchema } from "./commerce.js";
import { currencySchema } from "./catalogue.js";

const countSchema = z.number().int().nonnegative();
const moneySchema = z.number().int().nonnegative();

export const growthSuggestionSchema = z
  .object({
    offerId: z.string().min(1),
    productName: z.string().min(1),
    reason: z.string().min(1),
    outcome: addonOutcomeSchema.nullable(),
    pricePaise: moneySchema,
    currency: currencySchema,
    checkoutState: checkoutStateSchema.nullable(),
  })
  .strict();

const catalogueCategorySchema = z
  .object({ productType: z.string().min(1), count: countSchema })
  .strict();

const featuredCatalogueProductSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1),
    imageUrl: z.url().startsWith("https://"),
    productType: z.string().min(1),
    colour: z.string().min(1),
    pricePaise: moneySchema,
    stockQuantity: countSchema,
  })
  .strict();

export const merchantGrowthSummarySchema = z
  .object({
    merchantId: z.string().min(1),
    currency: currencySchema,
    catalogue: z
      .object({
        shoeStyles: countSchema,
        accessories: countSchema,
        liveVariants: countSchema,
        lowStockVariants: countSchema,
        outOfStockVariants: countSchema,
        priceFloorPaise: moneySchema,
        priceCeilingPaise: moneySchema,
        categories: z.array(catalogueCategorySchema),
        featuredProducts: z.array(featuredCatalogueProductSchema).max(5),
      })
      .strict(),
    funnel: z
      .object({
        cartsCreated: countSchema,
        cartsReviewed: countSchema,
        cartsApproved: countSchema,
        checkoutsStarted: countSchema,
        paidOrders: countSchema,
      })
      .strict(),
    addonOutcomes: z
      .object({
        offered: countSchema,
        accepted: countSchema,
        declined: countSchema,
        skipped: countSchema,
      })
      .strict(),
    orderValues: z
      .object({
        baseCartValuePaise: moneySchema,
        acceptedAddonValuePaise: moneySchema,
        grossOrderValuePaise: moneySchema,
        averageOrderValuePaise: moneySchema,
        attachRateBasisPoints: z.number().int().min(0).max(10_000),
      })
      .strict(),
    simulation: z
      .object({
        label: z.literal("Fixed historical-cart simulation — not causal"),
        scenarioCount: countSchema,
        noAddonValuePaise: moneySchema,
        compatibilityPolicyValuePaise: moneySchema,
        incrementalAddonValuePaise: moneySchema,
      })
      .strict(),
    recentSuggestions: z.array(growthSuggestionSchema).max(10),
    definitions: z.array(
      z
        .object({ key: z.string().min(1), description: z.string().min(1) })
        .strict(),
    ),
  })
  .strict();

export const merchantGrowthParamsSchema = z
  .object({ merchantId: z.string().min(1).max(160) })
  .strict();

export type MerchantGrowthSummary = z.infer<typeof merchantGrowthSummarySchema>;

export interface MerchantGrowthReader {
  getSummary: (merchantId: string) => Promise<MerchantGrowthSummary>;
}
