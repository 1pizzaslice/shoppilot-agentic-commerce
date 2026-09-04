import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { buildApi } from "../../apps/api/src/app.js";
import {
  createPostgresCatalogueReader,
  createPostgresConversationStore,
  migrateCatalogue,
  seedCatalogue,
} from "@shoppilot/db";
import {
  createShoppingConversationHandler,
  shoppingResponseSchema,
} from "@shoppilot/domain";
import {
  createDeterministicIdGenerator,
  createFakeShoppingModel,
  createUnavailableCommerceService,
  createUnavailablePaymentService,
  createUnavailableGrowthReader,
} from "../../packages/testkit/src/index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://shoppilot:shoppilot_dev@localhost:5432/shoppilot";
const pool = new Pool({ connectionString: databaseUrl });
const catalogue = createPostgresCatalogueReader(pool);
const ids = createDeterministicIdGenerator("persisted-conversation");
const conversation = createShoppingConversationHandler({
  model: createFakeShoppingModel(),
  catalogue,
  store: createPostgresConversationStore(pool),
  nextId: ids.next,
});
const app = buildApi({
  readiness: { check: () => Promise.resolve([]) },
  catalogue,
  conversation,
  commerce: createUnavailableCommerceService(),
  payments: createUnavailablePaymentService(),
  growth: createUnavailableGrowthReader(),
});

beforeAll(async () => {
  await migrateCatalogue(pool);
  await seedCatalogue(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("PostgreSQL shopping conversation", () => {
  it("persists intent across turns and append-only agent evidence", async () => {
    const firstResponse = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      payload: { message: "Running shoes under ₹4,000" },
    });
    const first = shoppingResponseSchema.parse(firstResponse.json());
    expect(first.kind).toBe("question");

    const secondResponse = await app.inject({
      method: "POST",
      url: `/v1/conversations/${first.conversationId}/messages`,
      payload: { message: "UK 8, Cloud Grey" },
    });
    const second = shoppingResponseSchema.parse(secondResponse.json());
    expect(second.kind).toBe("recommendations");
    expect(second.recommendations.length).toBeGreaterThan(0);
    expect(second.recommendations.length).toBeLessThanOrEqual(3);
    for (const recommendation of second.recommendations) {
      expect(recommendation.productType).toBe("running");
      expect(recommendation.variant.sizeUk).toBe(8);
      expect(recommendation.variant.colour).toBe("Cloud Grey");
      expect(recommendation.variant.pricePaise).toBeLessThanOrEqual(400_000);
      expect(recommendation.variant.stockQuantity).toBeGreaterThan(0);
    }

    const counts = await pool.query<{
      messages: string;
      runs: string;
      events: string;
      toolEvents: string;
    }>(
      `SELECT
        (SELECT count(*) FROM conversation_messages WHERE conversation_id = $1) AS messages,
        (SELECT count(*) FROM agent_runs WHERE conversation_id = $1) AS runs,
        (SELECT count(*) FROM conversation_events WHERE conversation_id = $1) AS events,
        (SELECT count(*) FROM conversation_events WHERE conversation_id = $1 AND type = 'tool_call') AS "toolEvents"`,
      [first.conversationId],
    );
    expect(counts.rows[0]).toEqual({
      messages: "4",
      runs: "2",
      events: "6",
      toolEvents: "1",
    });
  });

  it("returns a typed 404 for an unknown conversation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/missing/messages",
      payload: { message: "size 8" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: "Conversation not found.",
    });
  });
});
