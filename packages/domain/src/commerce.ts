import { z } from "zod";

import { currencySchema } from "./catalogue.js";

export const cartStateSchema = z.enum([
  "draft",
  "review",
  "approved",
  "checkout_started",
  "terminal",
]);

export const checkoutStateSchema = z.enum([
  "not_created",
  "authorized",
  "creating",
  "created",
  "payment_pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
]);

export const cartLineKindSchema = z.enum(["primary", "addon"]);
export const addonOutcomeSchema = z.enum(["accepted", "declined", "skipped"]);

export const cartLineSchema = z
  .object({
    id: z.string().min(1),
    variantId: z.string().min(1),
    kind: cartLineKindSchema,
    quantity: z.number().int().min(1).max(3),
  })
  .strict();

export const addonOfferSchema = z
  .object({
    id: z.string().min(1),
    sourceProductId: z.string().min(1),
    productId: z.string().min(1),
    variantId: z.string().min(1),
    name: z.string().min(1),
    reason: z.string().min(1),
    pricePaise: z.number().int().nonnegative(),
    currency: currencySchema,
    outcome: addonOutcomeSchema.nullable(),
  })
  .strict();

export const cartSchema = z
  .object({
    id: z.string().min(1),
    merchantId: z.string().min(1),
    userId: z.string().min(1).max(160),
    state: cartStateSchema,
    version: z.number().int().positive(),
    budgetPaise: z.number().int().positive().nullable(),
    currency: currencySchema,
    lines: z.array(cartLineSchema).max(2),
    addonOffer: addonOfferSchema.nullable(),
  })
  .strict();

export const snapshotLineSchema = z
  .object({
    variantId: z.string().min(1),
    productId: z.string().min(1),
    sku: z.string().min(1),
    kind: cartLineKindSchema,
    quantity: z.number().int().min(1).max(3),
    unitPricePaise: z.number().int().nonnegative(),
    discountPaise: z.number().int().nonnegative(),
    taxPaise: z.number().int().nonnegative(),
    lineTotalPaise: z.number().int().nonnegative(),
    currency: currencySchema,
  })
  .strict();

export const checkoutSnapshotSchema = z
  .object({
    id: z.string().min(1),
    cartId: z.string().min(1),
    cartVersion: z.number().int().positive(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    lines: z.array(snapshotLineSchema).min(1).max(2),
    subtotalPaise: z.number().int().nonnegative(),
    discountPaise: z.number().int().nonnegative(),
    taxPaise: z.number().int().nonnegative(),
    deliveryPaise: z.number().int().nonnegative(),
    totalPaise: z.number().int().positive(),
    currency: currencySchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const approvalSchema = z
  .object({
    id: z.string().min(1),
    cartId: z.string().min(1),
    snapshotId: z.string().min(1),
    cartHash: z.string().regex(/^[a-f0-9]{64}$/),
    userId: z.string().min(1).max(160),
    totalPaise: z.number().int().positive(),
    currency: currencySchema,
    expiresAt: z.string().datetime(),
    usedAt: z.string().datetime().nullable(),
    invalidatedAt: z.string().datetime().nullable(),
  })
  .strict();

export const policyReasonSchema = z.enum([
  "allowed",
  "cart_not_approved",
  "approval_missing",
  "approval_expired",
  "approval_used",
  "approval_mismatch",
  "cart_mutated",
  "budget_exceeded",
  "invalid_quantity",
  "stock_changed",
  "price_changed",
  "duplicate_execution",
]);

export const policyDecisionSchema = z
  .object({
    id: z.string().min(1),
    cartId: z.string().min(1),
    approvalId: z.string().min(1),
    outcome: z.enum(["allowed", "rejected"]),
    reason: policyReasonSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const checkoutAttemptSchema = z
  .object({
    id: z.string().min(1),
    cartId: z.string().min(1),
    approvalId: z.string().min(1),
    policyDecisionId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    state: z.literal("authorized"),
    createdAt: z.string().datetime(),
  })
  .strict();

export const auditEventSchema = z
  .object({
    id: z.string().min(1),
    entityType: z.enum([
      "cart",
      "addon_offer",
      "approval",
      "checkout",
      "webhook",
    ]),
    entityId: z.string().min(1),
    eventType: z.string().min(1).max(80),
    outcome: z.enum(["completed", "allowed", "rejected", "invalidated"]),
    metadata: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    createdAt: z.string().datetime(),
  })
  .strict();

export const createCartInputSchema = z
  .object({
    merchantId: z.string().min(1).default("stepup-shoes"),
    userId: z.string().min(1).max(160),
    budgetPaise: z.number().int().positive().optional(),
    currency: currencySchema.default("INR"),
  })
  .strict();

export const cartIdParamsSchema = z
  .object({ cartId: z.string().min(1).max(160) })
  .strict();

export const addCartLineInputSchema = z
  .object({
    variantId: z.string().min(1).max(160),
    quantity: z.number().int().min(1).max(3).default(1),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const addonDecisionInputSchema = z
  .object({
    offerId: z.string().min(1).max(160),
    outcome: addonOutcomeSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const versionedCartInputSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const approveCartInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    snapshotId: z.string().min(1).max(160),
    cartHash: z.string().regex(/^[a-f0-9]{64}$/),
    userId: z.string().min(1).max(160),
  })
  .strict();

export const createCheckoutInputSchema = z
  .object({
    cartId: z.string().min(1).max(160),
    approvalId: z.string().min(1).max(160),
  })
  .strict();

export const cartWithSnapshotSchema = z
  .object({ cart: cartSchema, snapshot: checkoutSnapshotSchema })
  .strict();

export const cartWithApprovalSchema = z
  .object({ cart: cartSchema, approval: approvalSchema })
  .strict();

export const checkoutAuthorizationSchema = z
  .object({
    attempt: checkoutAttemptSchema.nullable(),
    decision: policyDecisionSchema,
  })
  .strict();

export const commerceErrorCodeSchema = z.enum([
  "invalid_request",
  "not_found",
  "conflict",
  "policy_rejected",
]);

export const commerceErrorSchema = z
  .object({
    error: commerceErrorCodeSchema,
    message: z.string().min(1),
    decision: policyDecisionSchema.optional(),
  })
  .strict();

export type CartState = z.infer<typeof cartStateSchema>;
export type CheckoutState = z.infer<typeof checkoutStateSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type CheckoutSnapshot = z.infer<typeof checkoutSnapshotSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;
export type CheckoutAttempt = z.infer<typeof checkoutAttemptSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type CreateCartInput = z.infer<typeof createCartInputSchema>;
export type AddCartLineInput = z.infer<typeof addCartLineInputSchema>;
export type AddonDecisionInput = z.infer<typeof addonDecisionInputSchema>;
export type ApproveCartInput = z.infer<typeof approveCartInputSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutInputSchema>;
export type PolicyReason = z.infer<typeof policyReasonSchema>;

const cartTransitions: Record<CartState, readonly CartState[]> = {
  draft: ["draft", "review"],
  review: ["draft", "review", "approved"],
  approved: ["draft", "checkout_started"],
  checkout_started: ["terminal"],
  terminal: [],
};

export const transitionCartState = (
  current: CartState,
  next: CartState,
): CartState => {
  if (!cartTransitions[current].includes(next)) {
    throw new Error(`Invalid cart transition: ${current} -> ${next}`);
  }
  return next;
};

const checkoutTransitions: Record<CheckoutState, readonly CheckoutState[]> = {
  not_created: ["authorized"],
  authorized: ["creating", "expired", "cancelled"],
  creating: ["created", "failed", "expired"],
  created: ["payment_pending", "paid", "failed", "expired", "cancelled"],
  payment_pending: ["paid", "failed", "expired", "cancelled"],
  paid: [],
  failed: ["paid"],
  expired: ["paid"],
  cancelled: ["paid"],
};

export const transitionCheckoutState = (
  current: CheckoutState,
  next: CheckoutState,
): CheckoutState => {
  if (!checkoutTransitions[current].includes(next)) {
    throw new Error(`Invalid checkout transition: ${current} -> ${next}`);
  }
  return next;
};

export interface CommerceService {
  createCart: (input: CreateCartInput) => Promise<Cart>;
  getCart: (cartId: string) => Promise<Cart | null>;
  addPrimaryLine: (cartId: string, input: AddCartLineInput) => Promise<Cart>;
  decideAddon: (cartId: string, input: AddonDecisionInput) => Promise<Cart>;
  reviewCart: (
    cartId: string,
    expectedVersion: number,
  ) => Promise<{ cart: Cart; snapshot: CheckoutSnapshot }>;
  approveCart: (
    cartId: string,
    input: ApproveCartInput,
  ) => Promise<{ cart: Cart; approval: Approval }>;
  authorizeCheckout: (
    input: CreateCheckoutInput,
  ) => Promise<{ attempt: CheckoutAttempt | null; decision: PolicyDecision }>;
  getAuditTimeline: (cartId: string) => Promise<readonly AuditEvent[]>;
}

export class CommerceNotFoundError extends Error {}
export class CommerceConflictError extends Error {}
export class CommercePolicyError extends Error {
  constructor(
    message: string,
    readonly decision: PolicyDecision,
  ) {
    super(message);
  }
}

const sensitiveMetadataKey =
  /(address|email|phone|prompt|secret|token|payment)/i;

export const redactAuditMetadata = (
  metadata: Readonly<Record<string, string | number | boolean | null>>,
): Record<string, string | number | boolean | null> =>
  Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sensitiveMetadataKey.test(key) ? "[REDACTED]" : value,
    ]),
  );
