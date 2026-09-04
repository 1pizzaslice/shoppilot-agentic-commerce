import {
  intentPatchSchema,
  type IntentPatch,
  type ShoppingIntent,
  type ShoppingModel,
} from "@shoppilot/domain";

const typeTerms = [
  ["running", ["running", "runner", "jogging"]],
  ["walking", ["walking", "walk", "commute"]],
  ["training", ["training", "trainer", "gym"]],
  ["trail", ["trail", "hiking", "off-road"]],
  ["casual", ["casual", "everyday", "weekend"]],
] as const;

const extract = (
  message: string,
  currentIntent: ShoppingIntent,
  includeSynonyms: boolean,
): IntentPatch => {
  const normalized = message.toLowerCase().replaceAll(",", "");
  const productType = typeTerms.find(([, terms]) =>
    (includeSynonyms ? terms : terms.slice(0, 1)).some((term) =>
      normalized.includes(term),
    ),
  )?.[0];
  const budgetMatch =
    /(?:under|below|up to|max(?:imum)?|budget(?: of)?)[^0-9₹]*(?:₹\s*)?(\d+(?:\.\d+)?)\s*(k)?/.exec(
      normalized,
    );
  const budgetValue = Number(budgetMatch?.[1]);
  const maxPricePaise =
    budgetMatch?.[1] !== undefined && Number.isFinite(budgetValue)
      ? Math.round(budgetValue * (budgetMatch[2] === "k" ? 100_000 : 100))
      : undefined;
  const sizeMatch =
    /(?:uk\s*)?size\s*(\d{1,2})\b/i.exec(message) ??
    /\buk\s*(\d{1,2})\b/i.exec(message) ??
    (currentIntent.sizeUk === undefined
      ? /^\s*(\d{1,2})\s*$/.exec(message)
      : null);
  const parsedSize = Number(sizeMatch?.[1]);
  const sizeUk =
    Number.isInteger(parsedSize) && parsedSize >= 4 && parsedSize <= 13
      ? parsedSize
      : undefined;
  const colour = /\b(midnight blue|cloud grey|black)\b/i.exec(message)?.[1];
  return intentPatchSchema.parse({
    ...(productType === undefined ? {} : { productType }),
    ...(maxPricePaise === undefined ? {} : { maxPricePaise }),
    ...(sizeUk === undefined ? {} : { sizeUk }),
    ...(colour === undefined
      ? {}
      : {
          colour: colour
            .toLowerCase()
            .replace(/\b\w/g, (character) => character.toUpperCase()),
        }),
  });
};

export const createEvaluationAgentModel = (): ShoppingModel => ({
  extractIntent: (message, currentIntent) =>
    Promise.resolve(extract(message, currentIntent, true)),
  explainRecommendations: (products, intent) =>
    Promise.resolve(
      products.map((product) => ({
        productId: product.id,
        fit: `Canonical match for ${product.productType} use in UK size ${String(intent.sizeUk)}.`,
        tradeoff:
          "Compare its canonical price and colour with the other valid choices.",
      })),
    ),
});

export const extractBaselineIntent = (
  turns: readonly string[],
): ShoppingIntent => {
  let intent = intentPatchSchema.parse({});
  for (const turn of turns) {
    intent = {
      ...intent,
      ...extract(
        turn,
        { ...intent, merchantId: "stepup-shoes", currency: "INR" },
        false,
      ),
    };
  }
  return {
    merchantId: "stepup-shoes",
    currency: "INR",
    ...intent,
  };
};
