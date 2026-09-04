import {
  conversationRecordSchema,
  intentPatchSchema,
  type CatalogueProductSummary,
  type ConversationRecord,
  type ConversationStore,
  type ConversationTurnRecord,
  type IntentPatch,
  type ShoppingIntent,
  type ShoppingModel,
  type CommerceService,
  type PaymentService,
} from "@shoppilot/domain";

export {
  createFakePaymentProvider,
  type FakePaymentProvider,
} from "./fake-payment.js";

export const createUnavailableCommerceService = (): CommerceService => {
  const unavailable = (): never => {
    throw new Error("Commerce service is not used by this test.");
  };
  return {
    createCart: unavailable,
    getCart: unavailable,
    addPrimaryLine: unavailable,
    decideAddon: unavailable,
    reviewCart: unavailable,
    approveCart: unavailable,
    authorizeCheckout: unavailable,
    getAuditTimeline: unavailable,
  };
};

export const createUnavailablePaymentService = (): PaymentService => {
  const unavailable = (): never => {
    throw new Error("Payment service is not used by this test.");
  };
  return {
    createOrder: unavailable,
    getPayment: unavailable,
    recordCallback: unavailable,
    cancel: unavailable,
    expireTimedOut: unavailable,
    processWebhook: unavailable,
  };
};

export interface DeterministicIdGenerator {
  next: () => string;
}

export const createDeterministicIdGenerator = (
  prefix = "test",
): DeterministicIdGenerator => {
  let sequence = 0;

  return {
    next: () => `${prefix}-${String(++sequence).padStart(4, "0")}`,
  };
};

export const fixedClock = (instant: string): (() => Date) => {
  const timestamp = new Date(instant);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new Error("fixedClock requires an ISO-compatible instant");
  }

  return () => new Date(timestamp);
};

const productTypes = [
  "running",
  "walking",
  "training",
  "trail",
  "casual",
] as const;

const parseBudgetPaise = (message: string): number | undefined => {
  const normalized = message.toLowerCase().replaceAll(",", "");
  const match =
    /(?:under|below|upto|up to|max(?:imum)?|budget(?: of)?)[^0-9₹]*(?:₹\s*)?(\d+(?:\.\d+)?)\s*(k)?/.exec(
      normalized,
    );
  if (match?.[1] === undefined) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * (match[2] === "k" ? 100_000 : 100));
};

const parseSize = (
  message: string,
  currentIntent: ShoppingIntent,
): number | undefined => {
  const explicit = /(?:uk\s*)?size\s*(\d{1,2})\b/i.exec(message);
  const uk = /\buk\s*(\d{1,2})\b/i.exec(message);
  const compact = /^\s*(\d{1,2})\s*$/.exec(message);
  const raw = explicit?.[1] ?? uk?.[1] ?? compact?.[1];
  if (
    raw === undefined ||
    (explicit === null && uk === null && currentIntent.sizeUk !== undefined)
  ) {
    return undefined;
  }
  const size = Number(raw);
  return Number.isInteger(size) && size >= 4 && size <= 13 ? size : undefined;
};

const parseColour = (message: string): string | undefined => {
  const named = /\b(midnight blue|cloud grey|black|neutral)\b/i.exec(
    message,
  )?.[1];
  if (named === undefined) return undefined;
  return named
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export const createFakeShoppingModel = (): ShoppingModel => ({
  extractIntent: (message, currentIntent): Promise<IntentPatch> => {
    const normalized = message.toLowerCase();
    const productType = productTypes.find((type) => normalized.includes(type));
    const maxPricePaise = parseBudgetPaise(message);
    const sizeUk = parseSize(message, currentIntent);
    const colour = parseColour(message);
    return Promise.resolve(
      intentPatchSchema.parse({
        ...(productType === undefined ? {} : { productType }),
        ...(maxPricePaise === undefined ? {} : { maxPricePaise }),
        ...(sizeUk === undefined ? {} : { sizeUk }),
        ...(colour === undefined ? {} : { colour }),
      }),
    );
  },
  explainRecommendations: (
    products: readonly CatalogueProductSummary[],
    intent: ShoppingIntent,
  ) =>
    Promise.resolve(
      products.map((product, index) => ({
        productId: product.id,
        fit: `Option ${String(index + 1)} has an in-stock variant in UK size ${String(intent.sizeUk)}.`,
        tradeoff:
          index === 0
            ? "Lowest-priced valid match in this search."
            : "Costs more than the first valid match; compare colour and styling.",
      })),
    ),
});

export interface MemoryConversationStore extends ConversationStore {
  records: Map<string, ConversationRecord>;
  turns: ConversationTurnRecord[];
}

export const createMemoryConversationStore = (): MemoryConversationStore => {
  const records = new Map<string, ConversationRecord>();
  const turns: ConversationTurnRecord[] = [];
  return {
    records,
    turns,
    get: (conversationId) =>
      Promise.resolve(records.get(conversationId) ?? null),
    saveTurn: (turn) => {
      const conversation = conversationRecordSchema.parse(turn.conversation);
      records.set(conversation.id, conversation);
      turns.push({ ...turn, conversation });
      return Promise.resolve();
    },
  };
};
