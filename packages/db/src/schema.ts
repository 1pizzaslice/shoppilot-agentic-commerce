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
