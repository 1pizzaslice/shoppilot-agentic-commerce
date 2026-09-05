"use client";

import { useState } from "react";

import {
  auditEventSchema,
  cartSchema,
  cartWithApprovalSchema,
  cartWithSnapshotSchema,
  catalogueProductSchema,
  checkoutAuthorizationSchema,
  checkoutLaunchSchema,
  paymentOrderSchema,
  shoppingResponseSchema,
  type Cart,
  type CheckoutSnapshot,
  type PaymentOrder,
  type ShoppingRecommendation,
} from "@shoppilot/domain";
import type { z } from "zod";

import { openRazorpayCheckout } from "../checkout/razorpay-client";
import { discoverySchema } from "../machine-contract";

type BuyerState =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "launching"
  | "payment_ready"
  | "blocked";

type EventStatus = "running" | "completed" | "failed";

interface BuyerEvent {
  id: string;
  actor: "AI buyer" | "Catalogue" | "Cart" | "Policy" | "Razorpay";
  title: string;
  method: "GET" | "POST";
  path: string;
  status: EventStatus;
  requestId: string | null;
  detail: string;
}

interface PreparedPurchase {
  cart: Cart;
  snapshot: CheckoutSnapshot;
  selection: ShoppingRecommendation;
  addonName: string | null;
  persistedAuditCount: number;
}

class BuyerRequestError extends Error {
  constructor(
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
  }
}

const money = (paise: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

const shortId = (value: string): string =>
  value.length > 22 ? `${value.slice(0, 16)}…` : value;

const requestJson = async <T,>(
  schema: z.ZodType<T>,
  path: string,
  correlationId: string,
  init?: RequestInit,
): Promise<{ data: T; requestId: string | null; status: number }> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-request-id": correlationId,
      ...init?.headers,
    },
  });
  const requestId = response.headers.get("x-request-id");
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `Request failed with status ${String(response.status)}.`;
    throw new BuyerRequestError(message, requestId);
  }
  return { data: schema.parse(body), requestId, status: response.status };
};

export function AutonomousBuyer() {
  const [request, setRequest] = useState(
    "Buy red running shoes in UK 8 under ₹7,000",
  );
  const [capRupees, setCapRupees] = useState("7000");
  const [allowAddon, setAllowAddon] = useState(false);
  const [delegated, setDelegated] = useState(false);
  const [state, setState] = useState<BuyerState>("idle");
  const [events, setEvents] = useState<readonly BuyerEvent[]>([]);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedPurchase | null>(null);
  const [payment, setPayment] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateEvent = (id: string, update: Partial<BuyerEvent>) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === id ? { ...event, ...update } : event,
      ),
    );
  };

  const executeStep = async <T,>(options: {
    actor: BuyerEvent["actor"];
    title: string;
    method: BuyerEvent["method"];
    path: string;
    detail: (value: T) => string;
    schema: z.ZodType<T>;
    correlationId: string;
    body?: unknown;
  }): Promise<T> => {
    const id = crypto.randomUUID();
    setEvents((current) => [
      ...current,
      {
        id,
        actor: options.actor,
        title: options.title,
        method: options.method,
        path: options.path,
        status: "running",
        requestId: null,
        detail: "Waiting for the merchant response…",
      },
    ]);
    try {
      const result = await requestJson(
        options.schema,
        options.path,
        options.correlationId,
        options.method === "POST"
          ? { method: "POST", body: JSON.stringify(options.body) }
          : undefined,
      );
      updateEvent(id, {
        status: "completed",
        requestId: result.requestId,
        detail: `${String(result.status)} · ${options.detail(result.data)}`,
      });
      return result.data;
    } catch (caught: unknown) {
      const message =
        caught instanceof Error ? caught.message : "The request failed.";
      updateEvent(id, {
        status: "failed",
        requestId:
          caught instanceof BuyerRequestError ? caught.requestId : null,
        detail: message,
      });
      throw caught;
    }
  };

  const runBuyer = async () => {
    const normalizedCap = capRupees.replaceAll(",", "").trim();
    const rupees = Number(normalizedCap);
    if (
      request.trim().length < 10 ||
      !Number.isInteger(rupees) ||
      rupees < 500 ||
      rupees > 100_000 ||
      !delegated
    ) {
      setError(
        !delegated
          ? "Confirm the delegation boundary before starting the buyer."
          : "Enter a complete request and a whole-rupee cap from ₹500 to ₹1,00,000.",
      );
      return;
    }

    const capPaise = rupees * 100;
    const runCorrelationId = `buyer-${crypto.randomUUID()}`;
    setCorrelationId(runCorrelationId);
    setEvents([]);
    setPrepared(null);
    setPayment(null);
    setError(null);
    setState("running");

    try {
      const discovery = await executeStep({
        actor: "AI buyer",
        title: "Discovered StepUp without scraping",
        method: "GET",
        path: "/.well-known/ucp",
        schema: discoverySchema,
        correlationId: runCorrelationId,
        detail: (value) =>
          `${value.merchant.name} advertises ${value.capabilities.search.path}`,
      });
      const response = await executeStep({
        actor: "AI buyer",
        title: "Submitted one complete purchase instruction",
        method: "POST",
        path: "/v1/conversations",
        schema: shoppingResponseSchema,
        correlationId: runCorrelationId,
        body: { message: request.trim() },
        detail: (value) =>
          value.kind === "recommendations"
            ? `${String(value.recommendations.length)} grounded candidates returned`
            : value.message,
      });
      if (response.kind !== "recommendations") {
        throw new Error(
          response.kind === "question"
            ? "The instruction was incomplete. Include a UK size so the autonomous run never guesses."
            : "No catalogue item satisfied the complete instruction.",
        );
      }
      const eligible = response.recommendations.filter(
        (candidate) =>
          candidate.variant.inStock && candidate.variant.pricePaise <= capPaise,
      );
      const selection = eligible[0];
      if (selection === undefined) {
        throw new Error(
          "The delegation cap rejected every recommended variant before cart creation.",
        );
      }
      const productPath =
        discovery.capabilities.productLookup.pathTemplate.replace(
          "{idOrSlug}",
          encodeURIComponent(selection.productId),
        );
      const product = await executeStep({
        actor: "Catalogue",
        title: "Validated the selected canonical variant",
        method: "GET",
        path: productPath,
        schema: catalogueProductSchema,
        correlationId: runCorrelationId,
        detail: (value) =>
          `${value.name} · ${selection.variant.sku} · ${money(selection.variant.pricePaise)}`,
      });
      if (
        !product.variants.some(
          (variant) =>
            variant.id === selection.variant.id &&
            variant.inStock &&
            variant.pricePaise === selection.variant.pricePaise,
        )
      ) {
        throw new Error(
          "The selected variant changed between search and lookup, so the buyer stopped.",
        );
      }
      let cart = await executeStep({
        actor: "Cart",
        title: "Created a budget-bound draft cart",
        method: "POST",
        path: "/v1/carts",
        schema: cartSchema,
        correlationId: runCorrelationId,
        body: {
          merchantId: discovery.merchant.id,
          userId: runCorrelationId,
          budgetPaise: capPaise,
          currency: "INR",
        },
        detail: (value) => `cart ${shortId(value.id)} · cap ${money(capPaise)}`,
      });
      cart = await executeStep({
        actor: "Cart",
        title: "Added the exact selected SKU",
        method: "POST",
        path: `/v1/carts/${encodeURIComponent(cart.id)}/lines`,
        schema: cartSchema,
        correlationId: runCorrelationId,
        body: {
          variantId: selection.variant.id,
          quantity: 1,
          expectedVersion: cart.version,
        },
        detail: (value) =>
          `${selection.variant.sku} added · cart version ${String(value.version)}`,
      });
      const offeredAddon = cart.addonOffer;
      if (offeredAddon !== null) {
        const outcome = allowAddon ? "accepted" : "declined";
        cart = await executeStep({
          actor: "AI buyer",
          title: allowAddon
            ? "Applied the delegated add-on rule"
            : "Declined the optional add-on by policy",
          method: "POST",
          path: `/v1/carts/${encodeURIComponent(cart.id)}/addon-decision`,
          schema: cartSchema,
          correlationId: runCorrelationId,
          body: {
            offerId: offeredAddon.id,
            outcome,
            expectedVersion: cart.version,
          },
          detail: () => `${offeredAddon.name} · ${outcome}`,
        });
      }
      const review = await executeStep({
        actor: "Cart",
        title: "Froze the exact purchase for approval",
        method: "POST",
        path: `/v1/carts/${encodeURIComponent(cart.id)}/review`,
        schema: cartWithSnapshotSchema,
        correlationId: runCorrelationId,
        body: { expectedVersion: cart.version },
        detail: (value) =>
          `${money(value.snapshot.totalPaise)} frozen · hash ${value.snapshot.hash.slice(0, 12)}`,
      });
      const persistedAudit = await executeStep({
        actor: "Policy",
        title: "Read back append-only server evidence",
        method: "GET",
        path: `/v1/carts/${encodeURIComponent(cart.id)}/audit`,
        schema: auditEventSchema.array().superRefine((value, context) => {
          if (value.length === 0) {
            context.addIssue({
              code: "custom",
              message: "The server returned no durable commerce evidence.",
            });
          }
          if (
            value.some(
              (auditEvent) => auditEvent.correlationId !== runCorrelationId,
            )
          ) {
            context.addIssue({
              code: "custom",
              message: "The durable evidence did not match this buyer run.",
            });
          }
        }),
        correlationId: runCorrelationId,
        detail: (value) =>
          `${String(value.length)} persisted events verified under this correlation`,
      });
      setPrepared({
        cart: review.cart,
        snapshot: review.snapshot,
        selection,
        addonName:
          review.cart.addonOffer?.outcome === "accepted"
            ? review.cart.addonOffer.name
            : null,
        persistedAuditCount: persistedAudit.length,
      });
      setState("awaiting_approval");
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The autonomous buyer stopped safely.",
      );
      setState("blocked");
    }
  };

  const approveAndCreateOrder = async () => {
    if (prepared === null || correlationId === null) return;
    setState("launching");
    setError(null);
    try {
      const approved = await executeStep({
        actor: "Policy",
        title: "Recorded explicit approval of the frozen cart",
        method: "POST",
        path: `/v1/carts/${encodeURIComponent(prepared.cart.id)}/approve`,
        schema: cartWithApprovalSchema,
        correlationId,
        body: {
          expectedVersion: prepared.cart.version,
          snapshotId: prepared.snapshot.id,
          cartHash: prepared.snapshot.hash,
          userId: prepared.cart.userId,
        },
        detail: (value) =>
          `${money(value.approval.totalPaise)} bound until ${new Date(value.approval.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
      });
      const authorization = await executeStep({
        actor: "Policy",
        title: "Revalidated every commerce fact",
        method: "POST",
        path: "/v1/checkouts",
        schema: checkoutAuthorizationSchema,
        correlationId,
        body: {
          cartId: approved.cart.id,
          approvalId: approved.approval.id,
        },
        detail: (value) =>
          value.decision.outcome === "allowed"
            ? "budget, price, stock, approval and idempotency allowed"
            : `blocked: ${value.decision.reason}`,
      });
      if (authorization.attempt === null) {
        throw new Error(
          `Checkout policy stopped the run: ${authorization.decision.reason}.`,
        );
      }
      const launch = await executeStep({
        actor: "Razorpay",
        title: "Created one test-mode provider order",
        method: "POST",
        path: "/v1/payment-orders",
        schema: checkoutLaunchSchema,
        correlationId,
        body: { checkoutAttemptId: authorization.attempt.id },
        detail: (value) =>
          `${value.payment.provider} · ${value.payment.providerOrderId ?? "order pending"} · ${money(value.payment.amountPaise)}`,
      });
      await executeStep({
        actor: "Policy",
        title: "Verified the final server audit",
        method: "GET",
        path: `/v1/carts/${encodeURIComponent(prepared.cart.id)}/audit`,
        schema: auditEventSchema.array().superRefine((value, context) => {
          if (
            !value.some(
              (auditEvent) => auditEvent.eventType === "provider_order_created",
            )
          ) {
            context.addIssue({
              code: "custom",
              message: "The provider order was absent from durable evidence.",
            });
          }
          if (
            value.some(
              (auditEvent) => auditEvent.correlationId !== correlationId,
            )
          ) {
            context.addIssue({
              code: "custom",
              message: "The durable evidence did not match this buyer run.",
            });
          }
        }),
        correlationId,
        detail: (value) =>
          `${String(value.length)} persisted events include the single provider order`,
      });
      setPayment(launch.payment);
      setState("payment_ready");
      if (launch.payment.provider === "razorpay") {
        if (launch.checkout === null) {
          throw new Error(
            "Razorpay checkout details were unavailable for this order.",
          );
        }
        const checkoutAttemptId = authorization.attempt.id;
        await openRazorpayCheckout(launch.checkout, {
          onSuccess: (response) => {
            void requestJson(
              paymentOrderSchema,
              "/v1/payments/callback",
              correlationId,
              {
                method: "POST",
                body: JSON.stringify({
                  checkoutAttemptId,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                }),
              },
            )
              .then(({ data }) => {
                setPayment(data);
                window.location.replace(
                  `/checkout/${encodeURIComponent(checkoutAttemptId)}/success`,
                );
              })
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Payment confirmation could not be completed.",
                );
                setState("blocked");
              });
          },
          onDismiss: () => {
            void requestJson(
              paymentOrderSchema,
              "/v1/payments/cancel",
              correlationId,
              {
                method: "POST",
                body: JSON.stringify({ checkoutAttemptId }),
              },
            )
              .then(({ data }) => {
                setPayment(data);
                setError(
                  "Razorpay was closed before authentication. No payment was captured.",
                );
                setState("blocked");
              })
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Checkout closed before payment was completed.",
                );
                setState("blocked");
              });
          },
        });
      }
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The checkout boundary stopped safely.",
      );
      setState("blocked");
    }
  };

  const reset = () => {
    setState("idle");
    setEvents([]);
    setCorrelationId(null);
    setPrepared(null);
    setPayment(null);
    setError(null);
    setDelegated(false);
  };

  const busy = state === "running" || state === "launching";

  return (
    <main className="autonomous-shell">
      <header className="autonomous-header">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-copy">
            <strong>StepUp</strong>
            <small>powered by ShopPilot</small>
          </span>
        </a>
        <span>Separate machine-client flow</span>
        <a href="/">Return to shopper journey</a>
      </header>

      <section className="autonomous-hero">
        <div>
          <p className="eyebrow">Autonomous buyer · real HTTP execution</p>
          <h1>Delegate once. Let the buyer build the purchase.</h1>
        </div>
        <p>
          This client discovers StepUp, submits one complete instruction,
          selects a grounded SKU, applies your add-on rule, and freezes the
          exact cart without intermediate clicks. You intervene only at the
          final approval and Razorpay authentication boundaries.
        </p>
      </section>

      <div className="autonomous-layout">
        <section className="delegation-card" aria-labelledby="delegation-title">
          <p className="step-label">01 · Upfront delegation</p>
          <h2 id="delegation-title">Set the buyer’s boundaries</h2>
          <label>
            Complete purchase instruction
            <textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              disabled={busy || state === "awaiting_approval"}
              rows={3}
            />
            <small>
              Include the activity, UK size, budget, and any colour.
            </small>
          </label>
          <label>
            Hard spending cap
            <span className="rupee-input">
              <span aria-hidden="true">₹</span>
              <input
                inputMode="numeric"
                value={capRupees}
                onChange={(event) => setCapRupees(event.target.value)}
                disabled={busy || state === "awaiting_approval"}
                aria-label="Hard spending cap in rupees"
              />
            </span>
          </label>
          <label className="delegation-check">
            <input
              type="checkbox"
              checked={allowAddon}
              onChange={(event) => setAllowAddon(event.target.checked)}
              disabled={busy || state === "awaiting_approval"}
            />
            <span>
              <strong>Allow one compatible add-on</strong>
              <small>
                Only when it keeps the entire cart within the hard cap.
              </small>
            </span>
          </label>
          <label className="delegation-check delegation-consent">
            <input
              type="checkbox"
              checked={delegated}
              onChange={(event) => setDelegated(event.target.checked)}
              disabled={busy || state === "awaiting_approval"}
            />
            <span>
              <strong>I delegate product and cart preparation</strong>
              <small>
                The buyer may choose one valid SKU under this cap. Payment still
                requires my exact-total approval and secure authentication.
              </small>
            </span>
          </label>
          {state === "idle" || state === "blocked" ? (
            <button
              className="primary-button autonomous-run-button"
              type="button"
              onClick={() => void runBuyer()}
              disabled={busy}
            >
              {state === "blocked"
                ? "Retry autonomous buyer"
                : "Run autonomous buyer"}
            </button>
          ) : null}
          {state === "awaiting_approval" || state === "payment_ready" ? (
            <button className="text-button" type="button" onClick={reset}>
              Start a new autonomous run
            </button>
          ) : null}
        </section>

        <section className="execution-card" aria-labelledby="execution-title">
          <div className="execution-heading">
            <div>
              <p className="step-label">02 · Verifiable execution</p>
              <h2 id="execution-title">Observed API exchanges</h2>
            </div>
            <span className={`buyer-run-state ${state}`}>
              {state.replaceAll("_", " ")}
            </span>
          </div>
          {correlationId !== null ? (
            <div className="correlation-proof">
              <span>Shared audit correlation</span>
              <code>{correlationId}</code>
            </div>
          ) : (
            <div className="execution-empty">
              <strong>No simulated steps are pre-filled.</strong>
              <p>
                Start the buyer to see each completed merchant response, status
                code, and returned request identifier.
              </p>
            </div>
          )}
          {events.length > 0 ? (
            <ol className="buyer-exchange-list">
              {events.map((event, index) => (
                <li className={event.status} key={event.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="exchange-meta">
                      <b>{event.actor}</b>
                      <em>{event.status}</em>
                    </div>
                    <strong>{event.title}</strong>
                    <code>
                      {event.method} {event.path}
                    </code>
                    <p>{event.detail}</p>
                    {event.requestId !== null ? (
                      <small>x-request-id · {event.requestId}</small>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {busy ? (
            <div className="buyer-working" role="status">
              <span aria-hidden="true" /> Buyer is calling the next contract…
            </div>
          ) : null}
        </section>
      </div>

      {prepared !== null ? (
        <section
          className="autonomous-review"
          aria-labelledby="buyer-review-title"
        >
          <div className="autonomous-review-image">
            <img
              src={prepared.selection.imageUrl}
              alt={`${prepared.selection.name} selected by the AI buyer`}
            />
          </div>
          <div>
            <p className="step-label">03 · Human money boundary</p>
            <h2 id="buyer-review-title">The buyer prepared this exact cart.</h2>
            <div className="autonomous-selection">
              <div>
                <span>Selected pair</span>
                <strong>{prepared.selection.name}</strong>
              </div>
              <div>
                <span>Exact variant</span>
                <strong>
                  {prepared.selection.variant.colour} · UK{" "}
                  {prepared.selection.variant.sizeUk}
                </strong>
              </div>
              <div>
                <span>Add-on rule</span>
                <strong>{prepared.addonName ?? "No add-on added"}</strong>
              </div>
              <div>
                <span>Frozen total</span>
                <strong>{money(prepared.snapshot.totalPaise)}</strong>
              </div>
            </div>
            <p className="snapshot-proof">
              Snapshot <code>{prepared.snapshot.hash.slice(0, 18)}…</code> binds
              the SKU, quantity, price and total shown here. The buyer also read
              back {prepared.persistedAuditCount} append-only server events with
              this run’s correlation ID.
            </p>
            {state === "awaiting_approval" ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => void approveAndCreateOrder()}
              >
                Approve {money(prepared.snapshot.totalPaise)} and pay securely
              </button>
            ) : null}
            {payment !== null && payment.provider === "fake" ? (
              <div className="autonomous-payment-ready">
                <strong>Fake-provider order prepared successfully.</strong>
                <span>{payment.providerOrderId}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {error !== null ? (
        <div className="autonomous-error" role="alert">
          <strong>Buyer stopped safely</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <footer className="autonomous-proof-note">
        <strong>What this proves</strong>
        <p>
          The buyer is a separate API client: every row above appears only after
          a validated HTTP response, and the commerce trail is read back from
          PostgreSQL under the same correlation ID. Claude extracts the
          instruction; deterministic catalogue and policy code owns eligibility,
          price, stock, budget, approval, and order authorization.
        </p>
      </footer>
    </main>
  );
}
