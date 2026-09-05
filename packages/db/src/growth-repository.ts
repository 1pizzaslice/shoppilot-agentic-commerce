import type { Pool } from "pg";
import { z } from "zod";

import {
  merchantGrowthSummarySchema,
  type MerchantGrowthReader,
} from "@shoppilot/domain";
import { createRuntimePool } from "./runtime.js";

const databaseInteger = z
  .union([z.number().int(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe());

const funnelRowSchema = z.object({
  carts_created: databaseInteger,
  carts_reviewed: databaseInteger,
  carts_approved: databaseInteger,
  checkouts_started: databaseInteger,
  paid_orders: databaseInteger,
});

const outcomeRowSchema = z.object({
  offered: databaseInteger,
  accepted: databaseInteger,
  declined: databaseInteger,
  skipped: databaseInteger,
});

const valueRowSchema = z.object({
  paid_orders: databaseInteger,
  paid_orders_with_addon: databaseInteger,
  base_cart_value_paise: databaseInteger,
  accepted_addon_value_paise: databaseInteger,
  gross_order_value_paise: databaseInteger,
});

const simulationRowSchema = z.object({
  scenario_count: databaseInteger,
  no_addon_value_paise: databaseInteger,
  compatibility_policy_value_paise: databaseInteger,
});

const suggestionRowSchema = z.object({
  offer_id: z.string(),
  product_name: z.string(),
  reason: z.string(),
  outcome: z.string().nullable(),
  price_paise: z.number().int().nonnegative(),
  currency: z.string(),
  checkout_state: z.string().nullable(),
});

const catalogueRowSchema = z.object({
  shoe_styles: databaseInteger,
  accessories: databaseInteger,
  live_variants: databaseInteger,
  low_stock_variants: databaseInteger,
  out_of_stock_variants: databaseInteger,
  price_floor_paise: databaseInteger,
  price_ceiling_paise: databaseInteger,
});

const categoryRowSchema = z.object({
  product_type: z.string(),
  count: databaseInteger,
});

const featuredProductRowSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  image_url: z.url(),
  product_type: z.string(),
  colour: z.string(),
  price_paise: z.number().int().nonnegative(),
  stock_quantity: databaseInteger,
});

const activityRowSchema = z.object({
  activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  carts_created: databaseInteger,
  paid_orders: databaseInteger,
  gross_value_paise: databaseInteger,
});

const productPerformanceRowSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  image_url: z.url(),
  product_type: z.string(),
  colour: z.string(),
  price_paise: z.number().int().nonnegative(),
  stock_quantity: databaseInteger,
  cart_adds: databaseInteger,
  paid_orders: databaseInteger,
  units_sold: databaseInteger,
  gross_value_paise: databaseInteger,
});

const definitions = [
  {
    key: "Base cart value",
    description:
      "Sum of primary-line totals in paid immutable checkout snapshots.",
  },
  {
    key: "Accepted add-on value",
    description:
      "Sum of add-on line totals in paid immutable checkout snapshots.",
  },
  {
    key: "Attach rate",
    description:
      "Paid orders containing an explicitly accepted add-on divided by all paid orders.",
  },
  {
    key: "Average order value",
    description:
      "Gross paid snapshot value divided by paid orders, rounded to the nearest paise.",
  },
  {
    key: "Fixed simulation",
    description:
      "Replays authorized historical carts and subtracts accepted add-on lines for the no-add-on comparison; it is descriptive, not causal.",
  },
] as const;

const formatMoney = (paise: number): string =>
  `₹${new Intl.NumberFormat("en-IN").format(Math.trunc(paise / 100))}`;

export const createPostgresMerchantGrowthReader = (
  pool: Pool,
): MerchantGrowthReader => ({
  getSummary: async (merchantId) => {
    const [
      funnelResult,
      outcomeResult,
      valueResult,
      simulationResult,
      suggestionsResult,
      catalogueResult,
      categoriesResult,
      featuredProductsResult,
      activityResult,
      productPerformanceResult,
    ] = await Promise.all([
      pool.query(
        `SELECT
             count(DISTINCT entity_id) FILTER (WHERE event_type = 'cart_created') AS carts_created,
             count(DISTINCT entity_id) FILTER (WHERE event_type = 'cart_snapshot_created') AS carts_reviewed,
             count(DISTINCT metadata->>'cartId') FILTER (WHERE event_type = 'cart_approved') AS carts_approved,
             count(DISTINCT entity_id) FILTER (WHERE event_type = 'checkout_authorized') AS checkouts_started,
             count(DISTINCT entity_id) FILTER (
               WHERE event_type = 'payment_webhook_processed' AND metadata->>'nextState' = 'paid'
             ) AS paid_orders
           FROM audit_events
           WHERE entity_id IN (SELECT id FROM carts WHERE merchant_id = $1)
              OR metadata->>'cartId' IN (SELECT id FROM carts WHERE merchant_id = $1)
              OR entity_id IN (SELECT id FROM checkout_attempts WHERE cart_id IN (
                SELECT id FROM carts WHERE merchant_id = $1
              ))`,
        [merchantId],
      ),
      pool.query(
        `SELECT count(*) AS offered,
             count(*) FILTER (WHERE ao.outcome = 'accepted') AS accepted,
             count(*) FILTER (WHERE ao.outcome = 'declined') AS declined,
             count(*) FILTER (WHERE ao.outcome = 'skipped') AS skipped
           FROM addon_offers ao
           JOIN carts c ON c.id = ao.cart_id
           WHERE c.merchant_id = $1`,
        [merchantId],
      ),
      pool.query(
        `WITH paid AS (
             SELECT po.checkout_attempt_id, cs.document, cs.total_paise
             FROM payment_orders po
             JOIN checkout_attempts ca ON ca.id = po.checkout_attempt_id
             JOIN carts c ON c.id = ca.cart_id
             JOIN approvals a ON a.id = ca.approval_id
             JOIN checkout_snapshots cs ON cs.id = a.snapshot_id
             WHERE c.merchant_id = $1 AND po.state = 'paid'
           ), line_values AS (
             SELECT p.checkout_attempt_id, p.total_paise,
               coalesce(sum((line->>'lineTotalPaise')::bigint) FILTER (WHERE line->>'kind' = 'primary'), 0) AS base_value,
               coalesce(sum((line->>'lineTotalPaise')::bigint) FILTER (WHERE line->>'kind' = 'addon'), 0) AS addon_value
             FROM paid p CROSS JOIN LATERAL jsonb_array_elements(p.document) line
             GROUP BY p.checkout_attempt_id, p.total_paise
           )
           SELECT count(*) AS paid_orders,
             count(*) FILTER (WHERE addon_value > 0) AS paid_orders_with_addon,
             coalesce(sum(base_value), 0) AS base_cart_value_paise,
             coalesce(sum(addon_value), 0) AS accepted_addon_value_paise,
             coalesce(sum(total_paise), 0) AS gross_order_value_paise
           FROM line_values`,
        [merchantId],
      ),
      pool.query(
        `WITH scenarios AS (
             SELECT cs.id, cs.total_paise,
               coalesce(sum((line->>'lineTotalPaise')::bigint) FILTER (WHERE line->>'kind' = 'addon'), 0) AS addon_value
             FROM checkout_attempts ca
             JOIN carts c ON c.id = ca.cart_id
             JOIN approvals a ON a.id = ca.approval_id
             JOIN checkout_snapshots cs ON cs.id = a.snapshot_id
             CROSS JOIN LATERAL jsonb_array_elements(cs.document) line
             WHERE c.merchant_id = $1
             GROUP BY cs.id, cs.total_paise
           )
           SELECT count(*) AS scenario_count,
             coalesce(sum(total_paise - addon_value), 0) AS no_addon_value_paise,
             coalesce(sum(total_paise), 0) AS compatibility_policy_value_paise
           FROM scenarios`,
        [merchantId],
      ),
      pool.query(
        `SELECT ao.id AS offer_id, ao.name AS product_name, ao.reason,
                  ao.outcome, ao.price_paise, ao.currency,
                  checkout.state AS checkout_state
           FROM addon_offers ao
           JOIN carts c ON c.id = ao.cart_id
           LEFT JOIN LATERAL (
             SELECT ca.state
             FROM approvals a JOIN checkout_attempts ca ON ca.approval_id = a.id
             WHERE a.cart_id = ao.cart_id
             ORDER BY ca.created_at DESC LIMIT 1
           ) checkout ON true
           WHERE c.merchant_id = $1
           ORDER BY ao.created_at DESC, ao.id DESC LIMIT 10`,
        [merchantId],
      ),
      pool.query(
        `SELECT
           count(DISTINCT p.id) FILTER (WHERE p.product_type <> 'accessory') AS shoe_styles,
           count(DISTINCT p.id) FILTER (WHERE p.product_type = 'accessory') AS accessories,
           count(*) FILTER (WHERE i.quantity > 0) AS live_variants,
           count(*) FILTER (WHERE i.quantity BETWEEN 1 AND 3) AS low_stock_variants,
           count(*) FILTER (WHERE i.quantity = 0) AS out_of_stock_variants,
           coalesce(min(pv.price_paise) FILTER (WHERE p.product_type <> 'accessory'), 0) AS price_floor_paise,
           coalesce(max(pv.price_paise) FILTER (WHERE p.product_type <> 'accessory'), 0) AS price_ceiling_paise
         FROM products p
         JOIN product_variants pv ON pv.product_id = p.id AND pv.active = true
         JOIN inventory i ON i.variant_id = pv.id
         WHERE p.merchant_id = $1 AND p.active = true`,
        [merchantId],
      ),
      pool.query(
        `SELECT p.product_type, count(DISTINCT p.id) AS count
         FROM products p
         WHERE p.merchant_id = $1 AND p.active = true
           AND p.product_type <> 'accessory'
         GROUP BY p.product_type ORDER BY p.product_type`,
        [merchantId],
      ),
      pool.query(
        `WITH product_stock AS (
           SELECT p.id AS product_id, p.name, p.image_url, p.product_type,
                  min(pv.colour) AS colour, min(pv.price_paise) AS price_paise,
                  sum(i.quantity)::integer AS stock_quantity
           FROM products p
           JOIN product_variants pv ON pv.product_id = p.id AND pv.active = true
           JOIN inventory i ON i.variant_id = pv.id
           WHERE p.merchant_id = $1 AND p.active = true
             AND p.product_type <> 'accessory'
           GROUP BY p.id, p.name, p.image_url, p.product_type
         ), featured AS (
           SELECT DISTINCT ON (product_type) * FROM product_stock
           ORDER BY product_type, stock_quantity DESC, product_id
         )
         SELECT * FROM featured ORDER BY product_type LIMIT 5`,
        [merchantId],
      ),
      pool.query(
        `WITH days AS (
           SELECT generate_series(current_date - interval '6 days', current_date, interval '1 day')::date AS day
         ), cart_activity AS (
           SELECT c.created_at::date AS day, count(*) AS carts_created
           FROM carts c
           WHERE c.merchant_id = $1 AND c.created_at >= current_date - interval '6 days'
           GROUP BY c.created_at::date
         ), paid_activity AS (
           SELECT po.updated_at::date AS day, count(*) AS paid_orders,
                  coalesce(sum(po.amount_paise), 0) AS gross_value_paise
           FROM payment_orders po
           JOIN checkout_attempts ca ON ca.id = po.checkout_attempt_id
           JOIN carts c ON c.id = ca.cart_id
           WHERE c.merchant_id = $1 AND po.state = 'paid'
             AND po.updated_at >= current_date - interval '6 days'
           GROUP BY po.updated_at::date
         )
         SELECT to_char(days.day, 'YYYY-MM-DD') AS activity_date,
                coalesce(cart_activity.carts_created, 0) AS carts_created,
                coalesce(paid_activity.paid_orders, 0) AS paid_orders,
                coalesce(paid_activity.gross_value_paise, 0) AS gross_value_paise
         FROM days
         LEFT JOIN cart_activity ON cart_activity.day = days.day
         LEFT JOIN paid_activity ON paid_activity.day = days.day
         ORDER BY days.day`,
        [merchantId],
      ),
      pool.query(
        `WITH catalogue AS (
           SELECT p.id AS product_id, p.name, p.image_url, p.product_type,
                  min(pv.colour) AS colour, min(pv.price_paise) AS price_paise,
                  sum(i.quantity) AS stock_quantity
           FROM products p
           JOIN product_variants pv ON pv.product_id = p.id AND pv.active = true
           JOIN inventory i ON i.variant_id = pv.id
           WHERE p.merchant_id = $1 AND p.active = true
             AND p.product_type <> 'accessory'
           GROUP BY p.id, p.name, p.image_url, p.product_type
         ), cart_interest AS (
           SELECT pv.product_id, count(DISTINCT cl.cart_id) AS cart_adds
           FROM cart_lines cl
           JOIN carts c ON c.id = cl.cart_id
           JOIN product_variants pv ON pv.id = cl.variant_id
           WHERE c.merchant_id = $1 AND cl.kind = 'primary'
           GROUP BY pv.product_id
         ), paid_sales AS (
           SELECT line->>'productId' AS product_id,
                  count(DISTINCT po.checkout_attempt_id) AS paid_orders,
                  coalesce(sum((line->>'quantity')::integer), 0) AS units_sold,
                  coalesce(sum((line->>'lineTotalPaise')::bigint), 0) AS gross_value_paise
           FROM payment_orders po
           JOIN checkout_attempts ca ON ca.id = po.checkout_attempt_id
           JOIN carts c ON c.id = ca.cart_id
           JOIN approvals a ON a.id = ca.approval_id
           JOIN checkout_snapshots cs ON cs.id = a.snapshot_id
           CROSS JOIN LATERAL jsonb_array_elements(cs.document) line
           WHERE c.merchant_id = $1 AND po.state = 'paid'
             AND line->>'kind' = 'primary'
           GROUP BY line->>'productId'
         )
         SELECT catalogue.*,
                coalesce(cart_interest.cart_adds, 0) AS cart_adds,
                coalesce(paid_sales.paid_orders, 0) AS paid_orders,
                coalesce(paid_sales.units_sold, 0) AS units_sold,
                coalesce(paid_sales.gross_value_paise, 0) AS gross_value_paise
         FROM catalogue
         LEFT JOIN cart_interest USING (product_id)
         LEFT JOIN paid_sales USING (product_id)
         ORDER BY units_sold DESC, gross_value_paise DESC, cart_adds DESC,
                  stock_quantity ASC, name ASC
         LIMIT 200`,
        [merchantId],
      ),
    ]);

    const funnel = funnelRowSchema.parse(funnelResult.rows[0]);
    const outcomes = outcomeRowSchema.parse(outcomeResult.rows[0]);
    const values = valueRowSchema.parse(valueResult.rows[0]);
    const simulation = simulationRowSchema.parse(simulationResult.rows[0]);
    const catalogue = catalogueRowSchema.parse(catalogueResult.rows[0]);
    const productPerformance = productPerformanceResult.rows.map((raw) => {
      const row = productPerformanceRowSchema.parse(raw);
      return {
        productId: row.product_id,
        name: row.name,
        imageUrl: row.image_url,
        productType: row.product_type,
        colour: row.colour,
        pricePaise: row.price_paise,
        stockQuantity: row.stock_quantity,
        cartAdds: row.cart_adds,
        paidOrders: row.paid_orders,
        unitsSold: row.units_sold,
        grossValuePaise: row.gross_value_paise,
        conversionBasisPoints:
          row.cart_adds === 0
            ? 0
            : Math.min(
                10_000,
                Math.round((row.paid_orders * 10_000) / row.cart_adds),
              ),
      };
    });
    const categoryPerformance = categoriesResult.rows.map((raw) => {
      const category = categoryRowSchema.parse(raw);
      const matching = productPerformance.filter(
        (product) => product.productType === category.product_type,
      );
      return {
        productType: category.product_type,
        cartAdds: matching.reduce((sum, product) => sum + product.cartAdds, 0),
        paidOrders: matching.reduce(
          (sum, product) => sum + product.paidOrders,
          0,
        ),
        unitsSold: matching.reduce(
          (sum, product) => sum + product.unitsSold,
          0,
        ),
        grossValuePaise: matching.reduce(
          (sum, product) => sum + product.grossValuePaise,
          0,
        ),
      };
    });
    const highestInterestWithoutSale = productPerformance
      .filter((product) => product.cartAdds > 0 && product.paidOrders === 0)
      .sort((left, right) => right.cartAdds - left.cartAdds)[0];
    const insights = [
      values.paid_orders > 0
        ? {
            kind: "win" as const,
            title: `${String(values.paid_orders)} verified ${values.paid_orders === 1 ? "order" : "orders"}`,
            detail: `${formatMoney(values.gross_order_value_paise)} is backed by paid immutable checkout snapshots.`,
            action:
              "Keep monitoring repeat demand before changing catalogue strategy.",
          }
        : {
            kind: "opportunity" as const,
            title: "Establish the first sales baseline",
            detail: `${String(funnel.carts_created)} carts exist, but no verified paid order is available yet.`,
            action:
              "Complete test-mode journeys to validate the funnel before acting on product rankings.",
          },
      outcomes.offered > 0
        ? {
            kind: "opportunity" as const,
            title: `${((values.paid_orders_with_addon === 0 || values.paid_orders === 0 ? 0 : values.paid_orders_with_addon / values.paid_orders) * 100).toFixed(1)}% paid attach rate`,
            detail: `${String(outcomes.accepted)} of ${String(outcomes.offered)} compatible add-on offers were accepted before payment.`,
            action:
              "Review accepted and declined offers by compatibility, without auto-adding products.",
          }
        : {
            kind: "opportunity" as const,
            title: "Add-on evidence is waiting",
            detail: "No compatible add-on decision has been recorded yet.",
            action:
              "Run a shopper journey to begin measuring consented attachment.",
          },
      catalogue.low_stock_variants > 0
        ? {
            kind: "risk" as const,
            title: `${String(catalogue.low_stock_variants)} variants are low on stock`,
            detail: `${String(catalogue.out_of_stock_variants)} additional variants are already sold out.`,
            action:
              "Prioritize replenishment for products with cart interest or verified sales.",
          }
        : {
            kind: "win" as const,
            title: "Inventory coverage is healthy",
            detail: `${String(catalogue.live_variants)} variants are currently available.`,
            action:
              "Continue watching size-level availability as demand accumulates.",
          },
      highestInterestWithoutSale === undefined
        ? {
            kind: "opportunity" as const,
            title: "Product demand needs more evidence",
            detail:
              "No product currently has cart interest without a verified sale.",
            action:
              "Use the performance table after more shopper journeys are recorded.",
          }
        : {
            kind: "opportunity" as const,
            title: `${highestInterestWithoutSale.name} has interest but no sale`,
            detail: `${String(highestInterestWithoutSale.cartAdds)} carts selected this product without a verified paid order.`,
            action:
              "Check price position and size availability before changing the product.",
          },
    ];
    return merchantGrowthSummarySchema.parse({
      merchantId,
      currency: "INR",
      catalogue: {
        shoeStyles: catalogue.shoe_styles,
        accessories: catalogue.accessories,
        liveVariants: catalogue.live_variants,
        lowStockVariants: catalogue.low_stock_variants,
        outOfStockVariants: catalogue.out_of_stock_variants,
        priceFloorPaise: catalogue.price_floor_paise,
        priceCeilingPaise: catalogue.price_ceiling_paise,
        categories: categoriesResult.rows.map((raw) => {
          const row = categoryRowSchema.parse(raw);
          return { productType: row.product_type, count: row.count };
        }),
        featuredProducts: featuredProductsResult.rows.map((raw) => {
          const row = featuredProductRowSchema.parse(raw);
          return {
            productId: row.product_id,
            name: row.name,
            imageUrl: row.image_url,
            productType: row.product_type,
            colour: row.colour,
            pricePaise: row.price_paise,
            stockQuantity: row.stock_quantity,
          };
        }),
      },
      funnel: {
        cartsCreated: funnel.carts_created,
        cartsReviewed: funnel.carts_reviewed,
        cartsApproved: funnel.carts_approved,
        checkoutsStarted: funnel.checkouts_started,
        paidOrders: funnel.paid_orders,
      },
      addonOutcomes: {
        offered: outcomes.offered,
        accepted: outcomes.accepted,
        declined: outcomes.declined,
        skipped: outcomes.skipped,
      },
      orderValues: {
        baseCartValuePaise: values.base_cart_value_paise,
        acceptedAddonValuePaise: values.accepted_addon_value_paise,
        grossOrderValuePaise: values.gross_order_value_paise,
        averageOrderValuePaise:
          values.paid_orders === 0
            ? 0
            : Math.round(values.gross_order_value_paise / values.paid_orders),
        attachRateBasisPoints:
          values.paid_orders === 0
            ? 0
            : Math.round(
                (values.paid_orders_with_addon * 10_000) / values.paid_orders,
              ),
      },
      simulation: {
        label: "Fixed historical-cart simulation — not causal",
        scenarioCount: simulation.scenario_count,
        noAddonValuePaise: simulation.no_addon_value_paise,
        compatibilityPolicyValuePaise:
          simulation.compatibility_policy_value_paise,
        incrementalAddonValuePaise:
          simulation.compatibility_policy_value_paise -
          simulation.no_addon_value_paise,
      },
      activity: {
        windowDays: 7,
        series: activityResult.rows.map((raw) => {
          const row = activityRowSchema.parse(raw);
          return {
            date: row.activity_date,
            cartsCreated: row.carts_created,
            paidOrders: row.paid_orders,
            grossValuePaise: row.gross_value_paise,
          };
        }),
      },
      productPerformance,
      categoryPerformance,
      insights,
      recentSuggestions: suggestionsResult.rows.map((raw) => {
        const row = suggestionRowSchema.parse(raw);
        return {
          offerId: row.offer_id,
          productName: row.product_name,
          reason: row.reason,
          outcome: row.outcome,
          pricePaise: row.price_paise,
          currency: row.currency,
          checkoutState: row.checkout_state,
        };
      }),
      definitions,
    });
  },
});

export interface GrowthDependencies {
  reader: MerchantGrowthReader;
  close: () => Promise<void>;
}

export const createGrowthDependencies = (
  databaseUrl: string,
): GrowthDependencies => {
  const pool = createRuntimePool(databaseUrl);
  return {
    reader: createPostgresMerchantGrowthReader(pool),
    close: () => pool.end(),
  };
};
