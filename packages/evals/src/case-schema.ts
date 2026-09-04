import { z } from "zod";

import { productTypeSchema } from "@shoppilot/domain";

export const evaluationCategorySchema = z.enum([
  "happy_path",
  "ambiguous_request",
  "no_result_or_stale_catalogue",
  "malicious_input",
  "commerce_attack",
  "payment_failure",
]);

const commonCaseSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^v1-[a-z]+-\d{2}$/),
  category: evaluationCategorySchema,
  catalogueVersion: z.literal("eval-catalogue-v1"),
  description: z.string().min(1),
  forbiddenActions: z.array(
    z.enum(["cart_mutation", "external_order", "trust_untrusted_text"]),
  ),
});

const expectedConstraintsSchema = z
  .object({
    productType: productTypeSchema.exclude(["accessory"]),
    sizeUk: z.number().int().min(4).max(13),
    maxPricePaise: z.number().int().positive().optional(),
    colour: z.string().min(1).optional(),
  })
  .strict();

export const shoppingEvaluationCaseSchema = commonCaseSchema
  .extend({
    kind: z.literal("shopping"),
    userTurns: z.array(z.string().min(1)).min(1).max(3),
    expected: z
      .object({
        outcome: z.enum(["recommendations", "no_results"]),
        constraints: expectedConstraintsSchema,
        eligibleProductIds: z.array(z.string()),
        maxClarifications: z.number().int().min(0).max(2),
      })
      .strict(),
    knownInjection: z.boolean().default(false),
  })
  .strict();

export const boundaryScenarioSchema = z.enum([
  "stale_price",
  "missing_stock",
  "malicious_tool_extra_key",
  "malicious_tool_limit",
  "malicious_tool_size",
  "unapproved_cart_mutation",
  "over_budget_checkout",
  "wrong_size_checkout",
  "expired_approval",
  "mutated_cart",
  "duplicate_checkout",
  "compatible_addon",
  "declined_addon",
  "payment_declined",
  "payment_cancelled",
  "payment_timeout",
  "duplicate_webhook",
  "out_of_order_webhook",
]);

export const boundaryEvaluationCaseSchema = commonCaseSchema
  .extend({
    kind: z.literal("boundary"),
    scenario: boundaryScenarioSchema,
    expected: z
      .object({ outcome: z.enum(["blocked", "safe", "completed"]) })
      .strict(),
    knownInjection: z.boolean().default(false),
  })
  .strict();

export const evaluationCaseSchema = z.discriminatedUnion("kind", [
  shoppingEvaluationCaseSchema,
  boundaryEvaluationCaseSchema,
]);

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type ShoppingEvaluationCase = z.infer<
  typeof shoppingEvaluationCaseSchema
>;
export type BoundaryEvaluationCase = z.infer<
  typeof boundaryEvaluationCaseSchema
>;
