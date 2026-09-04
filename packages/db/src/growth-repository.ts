import { Pool } from "pg";
import { z } from "zod";

import {
  merchantGrowthSummarySchema,
  type MerchantGrowthReader,
} from "@shoppilot/domain";

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
    ]);

    const funnel = funnelRowSchema.parse(funnelResult.rows[0]);
    const outcomes = outcomeRowSchema.parse(outcomeResult.rows[0]);
    const values = valueRowSchema.parse(valueResult.rows[0]);
    const simulation = simulationRowSchema.parse(simulationResult.rows[0]);
    return merchantGrowthSummarySchema.parse({
      merchantId,
      currency: "INR",
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
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    reader: createPostgresMerchantGrowthReader(pool),
    close: () => pool.end(),
  };
};
