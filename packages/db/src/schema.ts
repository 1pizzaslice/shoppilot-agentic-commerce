import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const catalogueVersions = pgTable(
  "catalogue_versions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("catalogue_versions_merchant_version_idx").on(
      table.merchantId,
      table.version,
    ),
    check("catalogue_versions_positive", sql`${table.version} > 0`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    catalogueVersionId: text("catalogue_version_id")
      .notNull()
      .references(() => catalogueVersions.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    productType: text("product_type").notNull(),
    returnPolicyDays: integer("return_policy_days").notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (table) => [
    uniqueIndex("products_merchant_slug_idx").on(table.merchantId, table.slug),
    index("products_merchant_type_idx").on(table.merchantId, table.productType),
    check(
      "products_type_allowed",
      sql`${table.productType} IN ('running', 'walking', 'training', 'trail', 'casual', 'accessory')`,
    ),
    check(
      "products_return_policy_nonnegative",
      sql`${table.returnPolicyDays} >= 0`,
    ),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    colour: text("colour").notNull(),
    sizeUk: integer("size_uk"),
    pricePaise: integer("price_paise").notNull(),
    currency: text("currency").default("INR").notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (table) => [
    uniqueIndex("product_variants_sku_idx").on(table.sku),
    index("product_variants_product_idx").on(table.productId),
    index("product_variants_filters_idx").on(
      table.sizeUk,
      table.colour,
      table.pricePaise,
    ),
    check("product_variants_price_nonnegative", sql`${table.pricePaise} >= 0`),
    check("product_variants_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "product_variants_size_range",
      sql`${table.sizeUk} IS NULL OR (${table.sizeUk} BETWEEN 4 AND 13)`,
    ),
  ],
);

export const inventory = pgTable(
  "inventory",
  {
    variantId: text("variant_id")
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("inventory_quantity_nonnegative", sql`${table.quantity} >= 0`),
  ],
);

export const productRelations = pgTable(
  "product_relations",
  {
    sourceProductId: text("source_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    targetProductId: text("target_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.sourceProductId,
        table.targetProductId,
        table.relationType,
      ],
    }),
    index("product_relations_source_idx").on(table.sourceProductId),
    check(
      "product_relations_compatible_addon",
      sql`${table.relationType} = 'compatible_addon'`,
    ),
    check(
      "product_relations_not_self",
      sql`${table.sourceProductId} <> ${table.targetProductId}`,
    ),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "conversations_state_allowed",
      sql`${table.state} IN ('collecting', 'ready', 'recommendations_shown', 'product_selected', 'cancelled')`,
    ),
  ],
);

export const shoppingIntents = pgTable("shopping_intents", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => conversations.id, { onDelete: "cascade" }),
  document: jsonb("document").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversation_messages_sequence_idx").on(
      table.conversationId,
      table.sequence,
    ),
    check(
      "conversation_messages_role_allowed",
      sql`${table.role} IN ('user', 'assistant')`,
    ),
    check(
      "conversation_messages_sequence_positive",
      sql`${table.sequence} > 0`,
    ),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    eventCount: integer("event_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "agent_runs_state_allowed",
      sql`${table.state} IN ('collecting', 'ready', 'recommendations_shown', 'product_selected', 'cancelled')`,
    ),
    check("agent_runs_event_count_nonnegative", sql`${table.eventCount} >= 0`),
  ],
);

export const conversationEvents = pgTable(
  "conversation_events",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    agentRunId: text("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    outcome: text("outcome").notNull(),
    metadata: jsonb("metadata").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversation_events_run_sequence_idx").on(
      table.agentRunId,
      table.sequence,
    ),
    index("conversation_events_conversation_idx").on(table.conversationId),
    check(
      "conversation_events_type_allowed",
      sql`${table.type} IN ('model_call', 'tool_call', 'policy_decision')`,
    ),
    check(
      "conversation_events_outcome_allowed",
      sql`${table.outcome} IN ('allowed', 'completed', 'rejected')`,
    ),
  ],
);

export const carts = pgTable(
  "carts",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    state: text("state").notNull(),
    version: integer("version").default(1).notNull(),
    budgetPaise: integer("budget_paise"),
    currency: text("currency").default("INR").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("carts_merchant_user_idx").on(table.merchantId, table.userId),
    check(
      "carts_state_allowed",
      sql`${table.state} IN ('draft', 'review', 'approved', 'checkout_started', 'terminal')`,
    ),
    check("carts_version_positive", sql`${table.version} > 0`),
    check(
      "carts_budget_positive",
      sql`${table.budgetPaise} IS NULL OR ${table.budgetPaise} > 0`,
    ),
    check("carts_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

export const cartLines = pgTable(
  "cart_lines",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("cart_lines_one_kind_idx").on(table.cartId, table.kind),
    uniqueIndex("cart_lines_variant_idx").on(table.cartId, table.variantId),
    check(
      "cart_lines_kind_allowed",
      sql`${table.kind} IN ('primary', 'addon')`,
    ),
    check("cart_lines_quantity_range", sql`${table.quantity} BETWEEN 1 AND 3`),
  ],
);

export const addonOffers = pgTable(
  "addon_offers",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    cartVersion: integer("cart_version").notNull(),
    sourceProductId: text("source_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    reason: text("reason").notNull(),
    pricePaise: integer("price_paise").notNull(),
    currency: text("currency").default("INR").notNull(),
    outcome: text("outcome"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("addon_offers_cart_version_idx").on(
      table.cartId,
      table.cartVersion,
    ),
    index("addon_offers_cart_idx").on(table.cartId, table.createdAt),
    check("addon_offers_version_positive", sql`${table.cartVersion} > 0`),
    check("addon_offers_price_nonnegative", sql`${table.pricePaise} >= 0`),
    check("addon_offers_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "addon_offers_outcome_allowed",
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('accepted', 'declined', 'skipped')`,
    ),
  ],
);

export const checkoutSnapshots = pgTable(
  "checkout_snapshots",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    cartVersion: integer("cart_version").notNull(),
    hash: text("hash").notNull(),
    document: jsonb("document").notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull(),
    taxPaise: integer("tax_paise").notNull(),
    deliveryPaise: integer("delivery_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    currency: text("currency").default("INR").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("checkout_snapshots_cart_version_idx").on(
      table.cartId,
      table.cartVersion,
    ),
    uniqueIndex("checkout_snapshots_hash_idx").on(table.hash),
    check("checkout_snapshots_version_positive", sql`${table.cartVersion} > 0`),
    check("checkout_snapshots_total_positive", sql`${table.totalPaise} > 0`),
    check("checkout_snapshots_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => checkoutSnapshots.id, { onDelete: "restrict" }),
    cartHash: text("cart_hash").notNull(),
    userId: text("user_id").notNull(),
    totalPaise: integer("total_paise").notNull(),
    currency: text("currency").default("INR").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("approvals_snapshot_idx").on(table.snapshotId),
    index("approvals_cart_idx").on(table.cartId, table.createdAt),
    check("approvals_total_positive", sql`${table.totalPaise} > 0`),
    check("approvals_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

export const policyDecisions = pgTable(
  "policy_decisions",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id").notNull(),
    approvalId: text("approval_id").notNull(),
    outcome: text("outcome").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("policy_decisions_cart_idx").on(table.cartId, table.createdAt),
    check(
      "policy_decisions_outcome_allowed",
      sql`${table.outcome} IN ('allowed', 'rejected')`,
    ),
  ],
);

export const checkoutAttempts = pgTable(
  "checkout_attempts",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    approvalId: text("approval_id")
      .notNull()
      .references(() => approvals.id, { onDelete: "cascade" }),
    policyDecisionId: text("policy_decision_id")
      .notNull()
      .references(() => policyDecisions.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    state: text("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("checkout_attempts_approval_idx").on(table.approvalId),
    uniqueIndex("checkout_attempts_idempotency_idx").on(table.idempotencyKey),
    check(
      "checkout_attempts_state_authorized",
      sql`${table.state} = 'authorized'`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    eventType: text("event_type").notNull(),
    outcome: text("outcome").notNull(),
    metadata: jsonb("metadata").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_entity_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    check(
      "audit_events_entity_type_allowed",
      sql`${table.entityType} IN ('cart', 'addon_offer', 'approval', 'checkout')`,
    ),
    check(
      "audit_events_outcome_allowed",
      sql`${table.outcome} IN ('completed', 'allowed', 'rejected', 'invalidated')`,
    ),
  ],
);
