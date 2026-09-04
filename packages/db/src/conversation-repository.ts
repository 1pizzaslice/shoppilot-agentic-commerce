import { randomUUID } from "node:crypto";

import { and, eq, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { z } from "zod";

import {
  conversationEventSchema,
  conversationRecordSchema,
  shoppingIntentSchema,
  type ConversationRecord,
  type ConversationStore,
  type ConversationTurnRecord,
} from "@shoppilot/domain";

import {
  agentRuns,
  conversationEvents,
  conversationMessages,
  conversations,
  shoppingIntents,
} from "./schema.js";
import { createRuntimePool, currentCorrelationId } from "./runtime.js";

const storedConversationSchema = z.object({
  id: z.string(),
  state: z.string(),
  document: z.unknown(),
});

export const createPostgresConversationStore = (
  pool: Pool,
): ConversationStore => {
  const db = drizzle(pool);

  return {
    get: async (conversationId): Promise<ConversationRecord | null> => {
      const rows = await db
        .select({
          id: conversations.id,
          state: conversations.state,
          document: shoppingIntents.document,
        })
        .from(conversations)
        .innerJoin(
          shoppingIntents,
          eq(shoppingIntents.conversationId, conversations.id),
        )
        .where(eq(conversations.id, conversationId))
        .limit(1);
      const raw = rows[0];
      if (raw === undefined) return null;
      const stored = storedConversationSchema.parse(raw);
      return conversationRecordSchema.parse({
        id: stored.id,
        state: stored.state,
        intent: shoppingIntentSchema.parse(stored.document),
      });
    },

    saveTurn: async (rawTurn: ConversationTurnRecord): Promise<void> => {
      const turn = {
        ...rawTurn,
        conversation: conversationRecordSchema.parse(rawTurn.conversation),
        events: rawTurn.events.map((event) =>
          conversationEventSchema.parse(event),
        ),
      };
      await db.transaction(async (transaction) => {
        await transaction
          .insert(conversations)
          .values({
            id: turn.conversation.id,
            merchantId: turn.conversation.intent.merchantId,
            state: turn.conversation.state,
          })
          .onConflictDoUpdate({
            target: conversations.id,
            set: { state: turn.conversation.state, updatedAt: new Date() },
          });
        await transaction
          .insert(shoppingIntents)
          .values({
            conversationId: turn.conversation.id,
            document: turn.conversation.intent,
          })
          .onConflictDoUpdate({
            target: shoppingIntents.conversationId,
            set: { document: turn.conversation.intent, updatedAt: new Date() },
          });

        const sequenceRows = await transaction
          .select({ value: max(conversationMessages.sequence) })
          .from(conversationMessages)
          .where(
            and(eq(conversationMessages.conversationId, turn.conversation.id)),
          );
        const nextSequence = (sequenceRows[0]?.value ?? 0) + 1;
        const runId = randomUUID();
        await transaction.insert(conversationMessages).values([
          {
            id: randomUUID(),
            conversationId: turn.conversation.id,
            sequence: nextSequence,
            role: "user",
            content: turn.userMessage,
          },
          {
            id: randomUUID(),
            conversationId: turn.conversation.id,
            sequence: nextSequence + 1,
            role: "assistant",
            content: turn.assistantMessage,
          },
        ]);
        await transaction.insert(agentRuns).values({
          id: runId,
          conversationId: turn.conversation.id,
          state: turn.conversation.state,
          eventCount: turn.events.length,
          correlationId: currentCorrelationId(),
        });
        if (turn.events.length > 0) {
          await transaction.insert(conversationEvents).values(
            turn.events.map((event, index) => ({
              id: randomUUID(),
              conversationId: turn.conversation.id,
              agentRunId: runId,
              sequence: index + 1,
              type: event.type,
              name: event.name,
              outcome: event.outcome,
              metadata: event.metadata,
              correlationId: currentCorrelationId(),
            })),
          );
        }
      });
    },
  };
};

export interface ConversationDependencies {
  store: ConversationStore;
  close: () => Promise<void>;
}

export const createConversationDependencies = (
  databaseUrl: string,
): ConversationDependencies => {
  const pool = createRuntimePool(databaseUrl);
  return {
    store: createPostgresConversationStore(pool),
    close: async () => pool.end(),
  };
};
