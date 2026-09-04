import {
  and,
  asc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import { z } from "zod";

import {
  catalogueProductSchema,
  catalogueSearchResponseSchema,
  catalogueSearchSchema,
  catalogueVariantSchema,
  type CatalogueProduct,
  type CatalogueProductSummary,
  type CatalogueReader,
  type CatalogueSearch,
  type CatalogueSearchResponse,
  type CatalogueVariant,
} from "@shoppilot/domain";

import {
  catalogueVersions,
  inventory,
  productRelations,
  products,
  productVariants,
} from "./schema.js";
import { createRuntimePool } from "./runtime.js";

const productRowSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  imageUrl: z.url(),
  productType: z.string(),
  returnPolicyDays: z.number().int(),
  catalogueVersion: z.number().int(),
  variantId: z.string(),
  sku: z.string(),
  colour: z.string(),
  sizeUk: z.number().int().nullable(),
  pricePaise: z.number().int(),
  currency: z.string(),
  stockQuantity: z.number().int(),
});

const addonRowSchema = z.object({
  productId: z.string(),
  name: z.string(),
  reason: z.string(),
  variantId: z.string(),
  sku: z.string(),
  colour: z.string(),
  sizeUk: z.number().int().nullable(),
  pricePaise: z.number().int(),
  currency: z.string(),
  stockQuantity: z.number().int(),
});

const toVariant = (row: z.infer<typeof productRowSchema>): CatalogueVariant =>
  catalogueVariantSchema.parse({
    id: row.variantId,
    sku: row.sku,
    colour: row.colour,
    sizeUk: row.sizeUk,
    pricePaise: row.pricePaise,
    currency: row.currency,
    stockQuantity: row.stockQuantity,
    inStock: row.stockQuantity > 0,
  });

const filtersFor = (input: CatalogueSearch): SQL[] => {
  const filters: SQL[] = [
    eq(products.merchantId, input.merchantId),
    eq(products.active, true),
    eq(productVariants.active, true),
  ];

  if (input.productType !== undefined) {
    filters.push(eq(products.productType, input.productType));
  }
  if (input.maxPricePaise !== undefined) {
    filters.push(lte(productVariants.pricePaise, input.maxPricePaise));
  }
  if (input.sizeUk !== undefined) {
    filters.push(eq(productVariants.sizeUk, input.sizeUk));
  }
  if (input.colour !== undefined) {
    const colour = input.colour.toLowerCase().replaceAll("gray", "grey");
    filters.push(ilike(productVariants.colour, `%${colour}%`));
  }
  if (input.inStockOnly) {
    filters.push(gt(inventory.quantity, 0));
  }
  if (input.query !== undefined) {
    filters.push(
      or(
        ilike(products.name, `%${input.query}%`),
        ilike(products.description, `%${input.query}%`),
      ) ?? sql`false`,
    );
  }
  if (input.cursor !== undefined) {
    filters.push(gt(products.id, input.cursor));
  }

  return filters;
};

const productSelection = {
  id: products.id,
  merchantId: products.merchantId,
  slug: products.slug,
  name: products.name,
  description: products.description,
  imageUrl: products.imageUrl,
  productType: products.productType,
  returnPolicyDays: products.returnPolicyDays,
  catalogueVersion: catalogueVersions.version,
  variantId: productVariants.id,
  sku: productVariants.sku,
  colour: productVariants.colour,
  sizeUk: productVariants.sizeUk,
  pricePaise: productVariants.pricePaise,
  currency: productVariants.currency,
  stockQuantity: inventory.quantity,
};

export const createPostgresCatalogueReader = (pool: Pool): CatalogueReader => {
  const db = drizzle(pool);

  const search = async (
    rawInput: CatalogueSearch,
  ): Promise<CatalogueSearchResponse> => {
    const input = catalogueSearchSchema.parse(rawInput);
    const filters = filtersFor(input);
    const idRows = await db
      .selectDistinct({ id: products.id })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(...filters))
      .orderBy(asc(products.id))
      .limit(input.limit + 1);

    const hasNextPage = idRows.length > input.limit;
    const pageIds = idRows.slice(0, input.limit).map(({ id }) => id);
    if (pageIds.length === 0) {
      return { products: [], nextCursor: null };
    }

    const rows = await db
      .select(productSelection)
      .from(products)
      .innerJoin(
        catalogueVersions,
        eq(catalogueVersions.id, products.catalogueVersionId),
      )
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(
        and(
          inArray(products.id, pageIds),
          ...filtersFor({ ...input, cursor: undefined }),
        ),
      )
      .orderBy(asc(products.id), asc(productVariants.id));

    const grouped = new Map<string, CatalogueProductSummary>();
    for (const rawRow of rows) {
      const row = productRowSchema.parse(rawRow);
      const existing = grouped.get(row.id);
      if (existing !== undefined) {
        existing.matchingVariants.push(toVariant(row));
        existing.lowestPricePaise = Math.min(
          existing.lowestPricePaise,
          row.pricePaise,
        );
        continue;
      }

      grouped.set(row.id, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        imageUrl: row.imageUrl,
        productType: catalogueSearchSchema.shape.productType
          .unwrap()
          .parse(row.productType),
        returnPolicyDays: row.returnPolicyDays,
        lowestPricePaise: row.pricePaise,
        currency: "INR",
        matchingVariants: [toVariant(row)],
      });
    }

    return catalogueSearchResponseSchema.parse({
      products: [...grouped.values()],
      nextCursor: hasNextPage ? (pageIds.at(-1) ?? null) : null,
    });
  };

  const getProduct = async (
    idOrSlug: string,
  ): Promise<CatalogueProduct | null> => {
    const rows = await db
      .select(productSelection)
      .from(products)
      .innerJoin(
        catalogueVersions,
        eq(catalogueVersions.id, products.catalogueVersionId),
      )
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(
        and(
          or(eq(products.id, idOrSlug), eq(products.slug, idOrSlug)),
          eq(products.active, true),
          eq(productVariants.active, true),
        ),
      )
      .orderBy(asc(productVariants.id));

    const first = rows[0];
    if (first === undefined) {
      return null;
    }
    const parsedRows = rows.map((row) => productRowSchema.parse(row));
    const product = parsedRows[0];
    if (product === undefined) {
      return null;
    }

    const addonProducts = alias(products, "addon_products");
    const addonVariants = alias(productVariants, "addon_variants");
    const addonInventory = alias(inventory, "addon_inventory");
    const addonRows = await db
      .select({
        productId: addonProducts.id,
        name: addonProducts.name,
        reason: productRelations.reason,
        variantId: addonVariants.id,
        sku: addonVariants.sku,
        colour: addonVariants.colour,
        sizeUk: addonVariants.sizeUk,
        pricePaise: addonVariants.pricePaise,
        currency: addonVariants.currency,
        stockQuantity: addonInventory.quantity,
      })
      .from(productRelations)
      .innerJoin(
        addonProducts,
        eq(addonProducts.id, productRelations.targetProductId),
      )
      .innerJoin(addonVariants, eq(addonVariants.productId, addonProducts.id))
      .innerJoin(addonInventory, eq(addonInventory.variantId, addonVariants.id))
      .where(
        and(
          eq(productRelations.sourceProductId, product.id),
          eq(productRelations.relationType, "compatible_addon"),
          eq(addonProducts.active, true),
          eq(addonVariants.active, true),
        ),
      )
      .orderBy(asc(addonProducts.id), asc(addonVariants.id));

    const addons = new Map<
      string,
      {
        productId: string;
        name: string;
        reason: string;
        variants: CatalogueVariant[];
      }
    >();
    for (const rawAddon of addonRows) {
      const addon = addonRowSchema.parse(rawAddon);
      const variant = catalogueVariantSchema.parse({
        id: addon.variantId,
        sku: addon.sku,
        colour: addon.colour,
        sizeUk: addon.sizeUk,
        pricePaise: addon.pricePaise,
        currency: addon.currency,
        stockQuantity: addon.stockQuantity,
        inStock: addon.stockQuantity > 0,
      });
      const existing = addons.get(addon.productId);
      if (existing === undefined) {
        addons.set(addon.productId, {
          productId: addon.productId,
          name: addon.name,
          reason: addon.reason,
          variants: [variant],
        });
      } else {
        existing.variants.push(variant);
      }
    }

    return catalogueProductSchema.parse({
      id: product.id,
      merchantId: product.merchantId,
      catalogueVersion: product.catalogueVersion,
      slug: product.slug,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      productType: product.productType,
      returnPolicyDays: product.returnPolicyDays,
      variants: parsedRows.map(toVariant),
      compatibleAddons: [...addons.values()],
    });
  };

  return { search, getProduct };
};

export interface CatalogueDependencies extends CatalogueReader {
  close: () => Promise<void>;
}

export const createCatalogueDependencies = (
  databaseUrl: string,
): CatalogueDependencies => {
  const pool = createRuntimePool(databaseUrl);
  const reader = createPostgresCatalogueReader(pool);
  return { ...reader, close: async () => pool.end() };
};
