import { z } from "zod";

import {
  catalogueSearchResponseSchema,
  catalogueSearchSchema,
  catalogueVariantSchema,
  currencySchema,
  productTypeSchema,
  type CatalogueProductSummary,
  type CatalogueReader,
  type CatalogueVariant,
} from "./catalogue.js";

export const conversationStateSchema = z.enum([
  "collecting",
  "ready",
  "recommendations_shown",
  "product_selected",
  "cancelled",
]);

export const shoppingIntentSchema = z
  .object({
    merchantId: z.string().min(1).default("stepup-shoes"),
    productType: productTypeSchema.exclude(["accessory"]).optional(),
    maxPricePaise: z.number().int().positive().optional(),
    currency: currencySchema.default("INR"),
    sizeUk: z.number().int().min(4).max(13).optional(),
    colour: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export const intentPatchSchema = shoppingIntentSchema
  .omit({ merchantId: true, currency: true })
  .partial()
  .strict();

export const recommendationExplanationSchema = z
  .object({
    productId: z.string().min(1),
    fit: z.string().trim().min(1).max(180),
    tradeoff: z.string().trim().min(1).max(180),
  })
  .strict();

export const modelExplanationResponseSchema = z
  .object({ explanations: z.array(recommendationExplanationSchema).max(3) })
  .strict();

export const shoppingRecommendationSchema = z
  .object({
    productId: z.string(),
    slug: z.string(),
    name: z.string(),
    imageUrl: z.url().startsWith("https://"),
    productType: productTypeSchema.exclude(["accessory"]),
    variant: catalogueVariantSchema,
    returnPolicyDays: z.number().int().nonnegative(),
    fit: z.string(),
    tradeoff: z.string(),
    matchedConstraints: z.array(z.string()).min(1),
  })
  .strict();

const responseBaseSchema = z.object({
  conversationId: z.string().min(1),
  intent: shoppingIntentSchema,
  message: z.string().min(1),
});

export const shoppingResponseSchema = z.discriminatedUnion("kind", [
  responseBaseSchema
    .extend({
      kind: z.literal("question"),
      state: z.literal("collecting"),
      recommendations: z.tuple([]),
      notice: z.null(),
    })
    .strict(),
  responseBaseSchema
    .extend({
      kind: z.literal("recommendations"),
      state: z.literal("recommendations_shown"),
      recommendations: z.array(shoppingRecommendationSchema).min(1).max(3),
      notice: z.string().nullable(),
    })
    .strict(),
  responseBaseSchema
    .extend({
      kind: z.literal("no_results"),
      state: z.literal("ready"),
      recommendations: z.tuple([]),
      notice: z.string(),
    })
    .strict(),
]);

export const conversationMessageInputSchema = z
  .object({ message: z.string().trim().min(1).max(500) })
  .strict();

export const conversationIdParamsSchema = z
  .object({ conversationId: z.string().min(1).max(160) })
  .strict();

export type ConversationState = z.infer<typeof conversationStateSchema>;
export type ShoppingIntent = z.infer<typeof shoppingIntentSchema>;
export type IntentPatch = z.infer<typeof intentPatchSchema>;
export type ShoppingRecommendation = z.infer<
  typeof shoppingRecommendationSchema
>;
export type ShoppingResponse = z.infer<typeof shoppingResponseSchema>;
export type RecommendationExplanation = z.infer<
  typeof recommendationExplanationSchema
>;

const allowedConversationTransitions: Record<
  ConversationState,
  readonly ConversationState[]
> = {
  collecting: ["collecting", "ready", "recommendations_shown", "cancelled"],
  ready: ["ready", "recommendations_shown", "cancelled"],
  recommendations_shown: [
    "ready",
    "recommendations_shown",
    "product_selected",
    "cancelled",
  ],
  product_selected: ["product_selected", "cancelled"],
  cancelled: ["cancelled"],
};

export const transitionConversationState = (
  current: ConversationState,
  next: ConversationState,
): ConversationState => {
  if (!allowedConversationTransitions[current].includes(next)) {
    throw new Error(`Invalid conversation transition: ${current} -> ${next}`);
  }
  return next;
};

export interface ShoppingModel {
  extractIntent: (
    message: string,
    currentIntent: ShoppingIntent,
  ) => Promise<IntentPatch>;
  explainRecommendations: (
    products: readonly CatalogueProductSummary[],
    intent: ShoppingIntent,
  ) => Promise<readonly RecommendationExplanation[]>;
}

export const conversationRecordSchema = z
  .object({
    id: z.string().min(1),
    state: conversationStateSchema,
    intent: shoppingIntentSchema,
  })
  .strict();

export type ConversationRecord = z.infer<typeof conversationRecordSchema>;

export const conversationEventSchema = z
  .object({
    type: z.enum(["model_call", "tool_call", "policy_decision"]),
    name: z.string().min(1).max(80),
    outcome: z.enum(["allowed", "completed", "rejected"]),
    metadata: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]),
    ),
  })
  .strict();

export type ConversationEvent = z.infer<typeof conversationEventSchema>;

export interface ConversationTurnRecord {
  conversation: ConversationRecord;
  userMessage: string;
  assistantMessage: string;
  events: readonly ConversationEvent[];
}

export interface ConversationStore {
  get: (conversationId: string) => Promise<ConversationRecord | null>;
  saveTurn: (turn: ConversationTurnRecord) => Promise<void>;
}

export interface ShoppingConversationHandler {
  start: (message: string) => Promise<ShoppingResponse>;
  continue: (
    conversationId: string,
    message: string,
  ) => Promise<ShoppingResponse | null>;
}

export const catalogueSearchToolInputSchema = catalogueSearchSchema
  .pick({
    merchantId: true,
    maxPricePaise: true,
    currency: true,
    sizeUk: true,
    productType: true,
    inStockOnly: true,
    colour: true,
    limit: true,
  })
  .strict();

export const catalogueLookupToolInputSchema = z
  .object({ idOrSlug: z.string().min(1).max(160) })
  .strict();

export interface ReadonlyCatalogueTools {
  permission: "read-only";
  searchCatalog: (
    rawInput: unknown,
  ) => Promise<z.infer<typeof catalogueSearchResponseSchema>>;
  getProduct: (rawInput: unknown) => ReturnType<CatalogueReader["getProduct"]>;
}

export const createReadonlyCatalogueTools = (
  reader: CatalogueReader,
): ReadonlyCatalogueTools => ({
  permission: "read-only",
  searchCatalog: async (rawInput) => {
    const input = catalogueSearchToolInputSchema.parse(rawInput);
    return catalogueSearchResponseSchema.parse(await reader.search(input));
  },
  getProduct: async (rawInput) => {
    const { idOrSlug } = catalogueLookupToolInputSchema.parse(rawInput);
    return reader.getProduct(idOrSlug);
  },
});

export interface QuestionPolicyDecision {
  ready: boolean;
  question: string | null;
  missingHardConstraints: readonly ("productType" | "sizeUk")[];
}

export const decideNextQuestion = (
  intent: ShoppingIntent,
): QuestionPolicyDecision => {
  const missingHardConstraints: ("productType" | "sizeUk")[] = [];
  if (intent.productType === undefined) {
    missingHardConstraints.push("productType");
  }
  if (intent.sizeUk === undefined) {
    missingHardConstraints.push("sizeUk");
  }

  if (missingHardConstraints.length === 0) {
    return { ready: true, question: null, missingHardConstraints };
  }

  if (missingHardConstraints.length === 2) {
    return {
      ready: false,
      question:
        "What UK shoe size and main use (running, walking, training, trail, or casual) should I filter for? You can also share a preferred colour.",
      missingHardConstraints,
    };
  }

  if (missingHardConstraints[0] === "sizeUk") {
    return {
      ready: false,
      question:
        "What UK shoe size do you need? You can also share a preferred colour, or I’ll show the best matches.",
      missingHardConstraints,
    };
  }

  return {
    ready: false,
    question:
      "What is the main use: running, walking, training, trail, or casual?",
    missingHardConstraints,
  };
};

const chooseVariant = (
  product: CatalogueProductSummary,
  intent: ShoppingIntent,
): CatalogueVariant | undefined =>
  product.matchingVariants
    .filter(
      (variant) =>
        variant.inStock &&
        variant.sizeUk === intent.sizeUk &&
        (intent.maxPricePaise === undefined ||
          variant.pricePaise <= intent.maxPricePaise) &&
        (intent.colour === undefined ||
          variant.colour
            .toLowerCase()
            .replaceAll("gray", "grey")
            .includes(intent.colour.toLowerCase().replaceAll("gray", "grey"))),
    )
    .sort(
      (left, right) =>
        left.pricePaise - right.pricePaise || left.id.localeCompare(right.id),
    )[0];

export const rankCandidates = (
  products: readonly CatalogueProductSummary[],
  intent: ShoppingIntent,
): CatalogueProductSummary[] => {
  const eligible = products
    .filter((product) => {
      if (product.productType === "accessory") return false;
      if (
        intent.productType !== undefined &&
        product.productType !== intent.productType
      ) {
        return false;
      }
      return product.matchingVariants.some(
        (variant) =>
          variant.inStock &&
          variant.sizeUk === intent.sizeUk &&
          (intent.maxPricePaise === undefined ||
            variant.pricePaise <= intent.maxPricePaise) &&
          (intent.colour === undefined ||
            variant.colour
              .toLowerCase()
              .replaceAll("gray", "grey")
              .includes(
                intent.colour.toLowerCase().replaceAll("gray", "grey"),
              )),
      );
    })
    .sort((left, right) => {
      const leftVariant = chooseVariant(left, intent);
      const rightVariant = chooseVariant(right, intent);
      return (
        (leftVariant?.pricePaise ?? Number.MAX_SAFE_INTEGER) -
          (rightVariant?.pricePaise ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id)
      );
    });

  if (eligible.length <= 3) return eligible;

  // A broad budget should produce a useful price spectrum, not the same three
  // cheapest rows on every request. Hard constraints are already enforced;
  // these stable quantiles expose value, mid-range, and upper-range choices.
  return [
    eligible[0],
    eligible[Math.round((eligible.length - 1) / 2)],
    eligible[eligible.length - 1],
  ].filter(
    (product): product is CatalogueProductSummary => product !== undefined,
  );
};

const matchedConstraintsFor = (intent: ShoppingIntent): string[] => {
  const constraints = [
    `${intent.productType ?? "shoe"} use`,
    `UK size ${String(intent.sizeUk)}`,
    "in stock",
  ];
  if (intent.maxPricePaise !== undefined) {
    constraints.push(`at or below ₹${String(intent.maxPricePaise / 100)}`);
  }
  if (intent.colour !== undefined) {
    constraints.push(`${intent.colour} colour`);
  }
  return constraints;
};

export interface ShoppingConversationOptions {
  model: ShoppingModel;
  catalogue: CatalogueReader;
  store: ConversationStore;
  nextId: () => string;
}

export const createShoppingConversationHandler = ({
  model,
  catalogue,
  store,
  nextId,
}: ShoppingConversationOptions): ShoppingConversationHandler => {
  const tools = createReadonlyCatalogueTools(catalogue);

  const runTurn = async (
    conversation: ConversationRecord,
    message: string,
  ): Promise<ShoppingResponse> => {
    const events: ConversationEvent[] = [];
    const patch = intentPatchSchema.parse(
      await model.extractIntent(message, conversation.intent),
    );
    events.push({
      type: "model_call",
      name: "extract_intent",
      outcome: "completed",
      metadata: { providerRole: "intent_extraction" },
    });
    const intent = shoppingIntentSchema.parse({
      ...conversation.intent,
      ...patch,
    });
    const policy = decideNextQuestion(intent);
    events.push({
      type: "policy_decision",
      name: "minimum_question_policy",
      outcome: policy.ready ? "allowed" : "completed",
      metadata: { missingCount: policy.missingHardConstraints.length },
    });

    if (!policy.ready) {
      const response = shoppingResponseSchema.parse({
        kind: "question",
        conversationId: conversation.id,
        state: "collecting",
        intent,
        message: policy.question,
        recommendations: [],
        notice: null,
      });
      await store.saveTurn({
        conversation: {
          ...conversation,
          state: transitionConversationState(
            conversation.state,
            response.state,
          ),
          intent,
        },
        userMessage: message,
        assistantMessage: response.message,
        events,
      });
      return response;
    }

    const searchInput = catalogueSearchToolInputSchema.parse({
      merchantId: intent.merchantId,
      maxPricePaise: intent.maxPricePaise,
      currency: intent.currency,
      sizeUk: intent.sizeUk,
      productType: intent.productType,
      colour: intent.colour,
      inStockOnly: true,
      limit: 20,
    });
    let searchResult = await tools.searchCatalog(searchInput);
    events.push({
      type: "tool_call",
      name: "searchCatalog",
      outcome: "completed",
      metadata: {
        permission: tools.permission,
        resultCount: searchResult.products.length,
        relaxedColour: false,
      },
    });
    let recommendationIntent = intent;
    let relaxedColour = false;
    if (searchResult.products.length === 0 && intent.colour !== undefined) {
      const relaxedSearchInput = catalogueSearchToolInputSchema.parse({
        ...searchInput,
        colour: undefined,
      });
      searchResult = await tools.searchCatalog(relaxedSearchInput);
      recommendationIntent = shoppingIntentSchema.parse({
        ...intent,
        colour: undefined,
      });
      relaxedColour = searchResult.products.length > 0;
      events.push({
        type: "tool_call",
        name: "searchCatalog",
        outcome: "completed",
        metadata: {
          permission: tools.permission,
          resultCount: searchResult.products.length,
          relaxedColour: true,
        },
      });
    }
    const candidates = rankCandidates(
      searchResult.products,
      recommendationIntent,
    );

    if (candidates.length === 0) {
      const messageText =
        "I couldn’t find an in-stock product that satisfies all of those constraints. Try changing one preference or constraint.";
      const response = shoppingResponseSchema.parse({
        kind: "no_results",
        conversationId: conversation.id,
        state: "ready",
        intent,
        message: messageText,
        recommendations: [],
        notice: "No valid catalogue products matched all hard constraints.",
      });
      await store.saveTurn({
        conversation: {
          ...conversation,
          state: transitionConversationState(
            conversation.state,
            response.state,
          ),
          intent,
        },
        userMessage: message,
        assistantMessage: response.message,
        events,
      });
      return response;
    }

    const explanations = modelExplanationResponseSchema.parse({
      explanations: await model.explainRecommendations(
        candidates,
        recommendationIntent,
      ),
    }).explanations;
    events.push({
      type: "model_call",
      name: "explain_recommendations",
      outcome: "completed",
      metadata: { candidateCount: candidates.length },
    });
    const explanationById = new Map(
      explanations.map((explanation) => [explanation.productId, explanation]),
    );
    const recommendations: ShoppingRecommendation[] = candidates.map(
      (product) => {
        const variant = chooseVariant(product, recommendationIntent);
        if (variant === undefined) {
          throw new Error("Ranked catalogue product has no eligible variant");
        }
        const explanation = explanationById.get(product.id);
        return shoppingRecommendationSchema.parse({
          productId: product.id,
          slug: product.slug,
          name: product.name,
          imageUrl: product.imageUrl,
          productType: product.productType,
          variant,
          returnPolicyDays: product.returnPolicyDays,
          fit:
            explanation?.fit ??
            `Available in the requested UK size ${String(recommendationIntent.sizeUk)}.`,
          tradeoff:
            explanation?.tradeoff ??
            "Compare the listed price and colour with the other valid options.",
          matchedConstraints: matchedConstraintsFor(recommendationIntent),
        });
      },
    );
    const notice = relaxedColour
      ? `No exact ${intent.colour ?? "colour"} matches were available. These alternatives still match your use, UK size, budget and live stock.`
      : intent.colour !== undefined
        ? `Exact ${intent.colour} options found in your UK size, within budget and currently in stock.`
        : recommendations.length < 3
          ? `Only ${String(recommendations.length)} valid ${recommendations.length === 1 ? "product" : "products"} matched all constraints.`
          : null;
    const response = shoppingResponseSchema.parse({
      kind: "recommendations",
      conversationId: conversation.id,
      state: "recommendations_shown",
      intent,
      message: "Here are the best in-stock matches from the catalogue.",
      recommendations,
      notice,
    });
    await store.saveTurn({
      conversation: {
        ...conversation,
        state: transitionConversationState(conversation.state, response.state),
        intent,
      },
      userMessage: message,
      assistantMessage: response.message,
      events,
    });
    return response;
  };

  return {
    start: async (message) =>
      runTurn(
        {
          id: nextId(),
          state: "collecting",
          intent: shoppingIntentSchema.parse({}),
        },
        conversationMessageInputSchema.parse({ message }).message,
      ),
    continue: async (conversationId, message) => {
      const conversation = await store.get(conversationId);
      if (conversation === null) return null;
      return runTurn(
        conversation,
        conversationMessageInputSchema.parse({ message }).message,
      );
    },
  };
};
