"use client";

import { useEffect, useRef, useState } from "react";

import {
  approvalSchema,
  auditEventSchema,
  cartSchema,
  catalogueProductSchema,
  checkoutAuthorizationSchema,
  checkoutLaunchSchema,
  checkoutSnapshotSchema,
  paymentOrderSchema,
  shoppingResponseSchema,
  type Approval,
  type AuditEvent,
  type Cart,
  type CatalogueProduct,
  type CheckoutSnapshot,
  type PaymentOrder,
  type ShoppingRecommendation,
  type ShoppingResponse,
} from "@shoppilot/domain";
import { z } from "zod";

type DemoScenario = "happy" | "recovery";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const requestJson = async <T,>(
  schema: z.ZodType<T>,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z
      .object({ message: z.string() })
      .passthrough()
      .safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.message : "ShopPilot could not continue.",
      response.status,
    );
  }
  return schema.parse(body);
};

const postJson = <T,>(schema: z.ZodType<T>, path: string, body: unknown) =>
  requestJson(schema, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);

const auditCopy: Record<string, string> = {
  cart_created: "Created a private draft cart.",
  cart_primary_line_set: "Added the shoe you selected.",
  addon_offered: "Proposed one compatible optional add-on.",
  addon_outcome_recorded: "Recorded your add-on choice.",
  cart_addon_line_added: "Added the optional item after your consent.",
  cart_snapshot_created:
    "Froze price, stock, tax, delivery and total for review.",
  cart_approved: "Bound your approval to the frozen cart total.",
  checkout_policy_decided: "Policy verified approval, stock, price and budget.",
  checkout_authorized: "Authorized one bounded checkout attempt.",
  provider_order_created: "Created exactly one provider order on the server.",
  payment_webhook_processed: "Verified payment evidence and updated the order.",
};

const auditActor = (eventType: string): "policy" | "you" | "system" => {
  if (eventType.includes("policy") || eventType === "checkout_authorized")
    return "policy";
  if (eventType === "cart_approved" || eventType === "addon_outcome_recorded")
    return "you";
  return "system";
};

export function ShopperJourney() {
  const [scenario, setScenario] = useState<DemoScenario>("happy");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<ShoppingResponse | null>(null);
  const [selected, setSelected] = useState<ShoppingRecommendation | null>(null);
  const [product, setProduct] = useState<CatalogueProduct | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [payment, setPayment] = useState<PaymentOrder | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [declinedOnce, setDeclinedOnce] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState<readonly AuditEvent[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const focusRef = useRef<HTMLHeadingElement>(null);
  const auditTriggerRef = useRef<HTMLButtonElement>(null);
  const auditCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (
      response !== null ||
      selected !== null ||
      cart !== null ||
      payment !== null
    )
      focusRef.current?.focus();
  }, [response, selected, cart, snapshot, payment]);

  useEffect(() => {
    if (!auditOpen) return;
    auditCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAuditOpen(false);
        window.setTimeout(() => auditTriggerRef.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [auditOpen]);

  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStale(false);
    try {
      await operation();
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 409) setStale(true);
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Your last confirmed step is still safe.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startConversation = async (
    mode: "fresh" | "continue" = response === null ? "fresh" : "continue",
  ) => {
    if (prompt.trim() === "") return;
    await perform(async () => {
      const next = await postJson(
        shoppingResponseSchema,
        mode === "fresh" || response === null
          ? "/v1/conversations"
          : `/v1/conversations/${response.conversationId}/messages`,
        { message: prompt },
      );
      if (mode === "fresh") {
        setSelected(null);
        setProduct(null);
        setCart(null);
        setSnapshot(null);
        setApproval(null);
        setPayment(null);
      }
      setResponse(next);
      setPrompt("");
    });
  };

  const chooseProduct = async (recommendation: ShoppingRecommendation) => {
    await perform(async () => {
      setProduct(
        await requestJson(
          catalogueProductSchema,
          `/v1/catalog/products/${encodeURIComponent(recommendation.productId)}`,
        ),
      );
      setSelected(recommendation);
    });
  };

  const addToCart = async () => {
    if (selected === null || response === null) return;
    await perform(async () => {
      const created = await postJson(cartSchema, "/v1/carts", {
        merchantId: "stepup-shoes",
        userId: `demo-shopper-${String(Date.now())}`,
        ...(response.intent.maxPricePaise === undefined
          ? {}
          : { budgetPaise: response.intent.maxPricePaise }),
        currency: "INR",
      });
      setCart(
        await postJson(cartSchema, `/v1/carts/${created.id}/lines`, {
          variantId: selected.variant.id,
          quantity: 1,
          expectedVersion: created.version,
        }),
      );
    });
  };

  const decideAddon = async (outcome: "accepted" | "declined" | "skipped") => {
    if (cart?.addonOffer === null || cart?.addonOffer === undefined) return;
    await perform(async () => {
      setCart(
        await postJson(cartSchema, `/v1/carts/${cart.id}/addon-decision`, {
          offerId: cart.addonOffer?.id,
          outcome,
          expectedVersion: cart.version,
        }),
      );
    });
  };

  const reviewCart = async () => {
    if (cart === null) return;
    await perform(async () => {
      const result = await postJson(
        z
          .object({ cart: cartSchema, snapshot: checkoutSnapshotSchema })
          .strict(),
        `/v1/carts/${cart.id}/review`,
        { expectedVersion: cart.version },
      );
      setCart(result.cart);
      setSnapshot(result.snapshot);
    });
  };

  const approveCart = async () => {
    if (cart === null || snapshot === null || !approved) return;
    await perform(async () => {
      const result = await postJson(
        z.object({ cart: cartSchema, approval: approvalSchema }).strict(),
        `/v1/carts/${cart.id}/approve`,
        {
          expectedVersion: cart.version,
          snapshotId: snapshot.id,
          cartHash: snapshot.hash,
          userId: cart.userId,
        },
      );
      setCart(result.cart);
      setApproval(result.approval);
    });
  };

  const beginPayment = async () => {
    if (cart === null || approval === null) return;
    await perform(async () => {
      const authorization = await postJson(
        checkoutAuthorizationSchema,
        "/v1/checkouts",
        { cartId: cart.id, approvalId: approval.id },
      );
      if (authorization.attempt === null)
        throw new Error("Policy did not authorize this checkout.");
      const launch = await postJson(
        checkoutLaunchSchema,
        "/v1/payment-orders",
        { checkoutAttemptId: authorization.attempt.id },
      );
      setPayment(launch.payment);
      setCart({ ...cart, state: "checkout_started" });
      if (launch.payment.provider === "razorpay") {
        window.location.assign(`/checkout/${authorization.attempt.id}`);
      }
    });
  };

  const settleDemoPayment = async () => {
    if (payment === null) return;
    await perform(async () => {
      const outcome =
        scenario === "recovery" && !declinedOnce ? "declined" : "paid";
      setPayment(
        await postJson(paymentOrderSchema, "/v1/demo/payments/settle", {
          checkoutAttemptId: payment.checkoutAttemptId,
          outcome,
        }),
      );
      if (outcome === "declined") setDeclinedOnce(true);
    });
  };

  const refreshCart = async () => {
    if (cart === null) return;
    await perform(async () => {
      setCart(await requestJson(cartSchema, `/v1/carts/${cart.id}`));
      setSnapshot(null);
      setApproval(null);
      setApproved(false);
    });
  };

  const openAudit = async () => {
    setAuditOpen(true);
    if (cart === null) return;
    await perform(async () =>
      setAudit(
        await requestJson(
          z.array(auditEventSchema),
          `/v1/carts/${cart.id}/audit`,
        ),
      ),
    );
  };

  const closeAudit = () => {
    setAuditOpen(false);
    window.setTimeout(() => auditTriggerRef.current?.focus(), 0);
  };

  const cancelJourney = async () => {
    if (
      payment !== null &&
      ["created", "payment_pending"].includes(payment.state)
    ) {
      await perform(async () => {
        setPayment(
          await postJson(paymentOrderSchema, "/v1/payments/cancel", {
            checkoutAttemptId: payment.checkoutAttemptId,
          }),
        );
        setCancelled(true);
      });
      return;
    }
    setCancelled(true);
  };

  const reset = () => {
    setPrompt("");
    setResponse(null);
    setSelected(null);
    setProduct(null);
    setCart(null);
    setSnapshot(null);
    setApproval(null);
    setPayment(null);
    setApproved(false);
    setError(null);
    setStale(false);
    setDeclinedOnce(false);
    setAuditOpen(false);
    setAudit([]);
    setCancelled(false);
  };

  const showRecommendations =
    !cancelled && response?.kind === "recommendations" && selected === null;
  const showingColourAlternatives =
    response?.kind === "recommendations" &&
    response.notice?.startsWith("No exact ") === true;
  const showAddon =
    !cancelled && cart?.state === "draft" && cart.addonOffer?.outcome === null;
  const canReview =
    !cancelled && cart?.state === "draft" && cart.addonOffer?.outcome !== null;

  return (
    <main className="shop-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ShopPilot home">
          ShopPilot
        </a>
        <div className="trust-chip">
          <span aria-hidden="true">●</span> Test mode · you approve every change
        </div>
        <button
          ref={auditTriggerRef}
          className="text-button"
          type="button"
          onClick={() => void openAudit()}
          disabled={cart === null}
        >
          View safety trail
        </button>
      </header>

      <div id="top" className="journey-grid">
        <section className="journey-main" aria-busy={busy}>
          {response === null && !cancelled ? (
            <div className="hero-panel">
              <p className="eyebrow">Your shortest route to the right pair</p>
              <h1>
                Tell us the need.
                <br />
                <em>Keep the control.</em>
              </h1>
              <p className="hero-copy">
                ShopPilot asks only what changes the answer, checks every fact
                against live catalogue data, and waits for your approval before
                checkout.
              </p>
              <div className="preset-row" aria-label="Demo presets">
                <button
                  type="button"
                  onClick={() => {
                    setScenario("happy");
                    setPrompt("Running shoes under ₹4,000");
                  }}
                >
                  <span>01</span> Happy path
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScenario("recovery");
                    setPrompt("Running shoes under ₹4,000");
                  }}
                >
                  <span>02</span> Decline & recover
                </button>
              </div>
              <form
                className="prompt-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startConversation("continue");
                }}
              >
                <label htmlFor="shopping-prompt">
                  What are you looking for?
                </label>
                <div>
                  <input
                    id="shopping-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="e.g. Running shoes under ₹4,000"
                    autoComplete="off"
                  />
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={busy || prompt.trim() === ""}
                  >
                    {busy ? "Finding…" : "Find my pair"}
                  </button>
                </div>
              </form>
              <ul className="proof-row" aria-label="ShopPilot guarantees">
                <li>Catalogue-grounded</li>
                <li>One optional add-on</li>
                <li>Exact-total approval</li>
              </ul>
            </div>
          ) : null}

          {cancelled ? (
            <section className="state-card centered-state">
              <span className="state-icon" aria-hidden="true">
                ×
              </span>
              <h1 ref={focusRef} tabIndex={-1}>
                Journey cancelled
              </h1>
              <p>
                Nothing else was added or purchased. Your control is the
                default.
              </p>
              <button className="primary-button" type="button" onClick={reset}>
                Start a new search
              </button>
            </section>
          ) : null}

          {!cancelled && response?.kind === "question" ? (
            <section className="conversation-panel">
              <p className="step-label">One detail needed</p>
              <h1 ref={focusRef} tabIndex={-1}>
                {response.message}
              </h1>
              <p className="muted">
                Size is required because it changes which variants are actually
                available.
              </p>
              <form
                className="answer-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startConversation();
                }}
              >
                <label htmlFor="clarification">Your answer</label>
                <div>
                  <input
                    id="clarification"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="UK 8, cloud grey"
                    autoFocus
                  />
                  <button
                    className="primary-button"
                    disabled={busy || prompt.trim() === ""}
                  >
                    Show matches
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {!cancelled && response?.kind === "no_results" ? (
            <section className="state-card no-results-state">
              <span className="state-icon" aria-hidden="true">
                0
              </span>
              <h1 ref={focusRef} tabIndex={-1}>
                Nothing exact—yet.
              </h1>
              <p>
                {response.message} Keep the details that matter and adjust just
                one below—we’ll search the same live catalogue again.
              </p>
              <form
                className="answer-form refinement-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startConversation();
                }}
              >
                <label htmlFor="no-result-refinement">Update this search</label>
                <div>
                  <input
                    id="no-result-refinement"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Try another colour or a higher budget"
                    autoFocus
                  />
                  <button
                    className="primary-button"
                    disabled={busy || prompt.trim() === ""}
                  >
                    Update current search
                  </button>
                </div>
              </form>
              <div className="inline-actions">
                <button
                  className="text-button"
                  type="button"
                  disabled={busy || prompt.trim() === ""}
                  onClick={() => void startConversation("fresh")}
                >
                  Use this text as a brand-new search
                </button>
                <button className="text-button" type="button" onClick={reset}>
                  Clear everything
                </button>
              </div>
            </section>
          ) : null}

          {showRecommendations ? (
            <section className="recommendation-panel">
              <div className="section-heading">
                <div>
                  <p className="step-label">Grounded recommendations</p>
                  <h1 ref={focusRef} tabIndex={-1}>
                    {showingColourAlternatives
                      ? "No exact colour match. Here are close alternatives."
                      : response.intent.colour !== undefined
                        ? `Exact ${response.intent.colour} matches.`
                        : response.recommendations.length === 3
                          ? "Three options across your budget."
                          : `${String(response.recommendations.length)} strong ${response.recommendations.length === 1 ? "match" : "matches"}.`}
                  </h1>
                </div>
                <p>
                  {response.notice ??
                    "Every option matches your required size, use and budget."}
                </p>
              </div>
              <div
                className="active-filters"
                aria-label="Active search filters"
              >
                <span>{response.intent.productType}</span>
                <span>UK {response.intent.sizeUk}</span>
                {response.intent.maxPricePaise === undefined ? null : (
                  <span>Up to {money(response.intent.maxPricePaise)}</span>
                )}
                {response.intent.colour === undefined ? (
                  <span>Any colour</span>
                ) : (
                  <span>{response.intent.colour}</span>
                )}
              </div>
              <div className="recommendation-grid">
                {response.recommendations.map((item, index) => (
                  <article className="product-card" key={item.productId}>
                    <div className="product-image-wrap">
                      <img
                        src={item.imageUrl}
                        alt={`${item.name} product photo`}
                      />
                    </div>
                    <div className="rank">
                      {(["Value", "Mid-range", "Top range"] as const)[index]}
                    </div>
                    <p className="product-type product-meta">
                      {item.productType} · {item.variant.colour} · UK{" "}
                      {item.variant.sizeUk}
                    </p>
                    <h2>{item.name}</h2>
                    <strong className="price">
                      {money(item.variant.pricePaise)}
                    </strong>
                    <div
                      className="product-assurances"
                      aria-label="Product assurances"
                    >
                      <span>
                        {item.variant.stockQuantity <= 3
                          ? `Only ${String(item.variant.stockQuantity)} left`
                          : `${String(item.variant.stockQuantity)} in stock`}
                      </span>
                      <span>{item.returnPolicyDays}-day returns</span>
                    </div>
                    <p>{item.fit}</p>
                    <small>{item.tradeoff}</small>
                    <ul>
                      {item.matchedConstraints.map((constraint) => (
                        <li key={constraint}>✓ {constraint}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => void chooseProduct(item)}
                      disabled={busy}
                    >
                      View this pair
                    </button>
                  </article>
                ))}
              </div>
              <form
                className="answer-form refinement-form compact-refinement"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startConversation("fresh");
                }}
              >
                <label htmlFor="recommendation-refinement">
                  Want something different?
                </label>
                <div>
                  <input
                    id="recommendation-refinement"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="e.g. make it black, budget ₹4,500"
                  />
                  <button
                    className="secondary-button"
                    disabled={busy || prompt.trim() === ""}
                  >
                    Search as new request
                  </button>
                </div>
              </form>
              <button
                className="text-button refine-current-button"
                type="button"
                disabled={busy || prompt.trim() === ""}
                onClick={() => void startConversation("continue")}
              >
                Or keep the active filters and change one detail
              </button>
            </section>
          ) : null}

          {!cancelled &&
          selected !== null &&
          product !== null &&
          cart === null ? (
            <section className="detail-panel">
              <button
                className="back-button"
                type="button"
                onClick={() => {
                  setSelected(null);
                  setProduct(null);
                }}
              >
                ← Back to matches
              </button>
              <div className="detail-grid">
                <div className="detail-image-wrap">
                  <img
                    src={product.imageUrl}
                    alt={`${product.name} product view`}
                  />
                </div>
                <div>
                  <p className="step-label">Your selected match</p>
                  <h1 ref={focusRef} tabIndex={-1}>
                    {product.name}
                  </h1>
                  <p className="detail-description">{product.description}</p>
                  <dl className="fact-grid">
                    <div>
                      <dt>Exact variant</dt>
                      <dd>
                        {selected.variant.colour} · UK {selected.variant.sizeUk}
                      </dd>
                    </div>
                    <div>
                      <dt>Live stock</dt>
                      <dd>{selected.variant.stockQuantity} available</dd>
                    </div>
                    <div>
                      <dt>Returns</dt>
                      <dd>{product.returnPolicyDays} days</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>{money(selected.variant.pricePaise)}</dd>
                    </div>
                  </dl>
                  <button
                    className="primary-button wide-button"
                    type="button"
                    onClick={() => void addToCart()}
                    disabled={busy}
                  >
                    {busy ? "Building safe cart…" : "Add this exact pair"}
                  </button>
                  <p className="microcopy">
                    This creates a draft cart only. No checkout or payment yet.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {showAddon && cart.addonOffer !== null ? (
            <section className="checkout-panel">
              <p className="step-label">One optional extra</p>
              <h1 ref={focusRef} tabIndex={-1}>
                Useful together. Entirely your call.
              </h1>
              <div className="addon-card">
                <div className="addon-image-wrap">
                  <img
                    src={cart.addonOffer.imageUrl}
                    alt={`${cart.addonOffer.name} product photo`}
                  />
                </div>
                <div>
                  <span>Compatible with your pair</span>
                  <h2>{cart.addonOffer.name}</h2>
                  <p>{cart.addonOffer.reason}</p>
                </div>
                <strong>{money(cart.addonOffer.pricePaise)}</strong>
              </div>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void decideAddon("accepted")}
                  disabled={busy}
                >
                  Yes, add it
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void decideAddon("declined")}
                  disabled={busy}
                >
                  No thanks
                </button>
              </div>
              <p className="microcopy">ShopPilot never auto-adds an upsell.</p>
            </section>
          ) : null}

          {canReview ? (
            <section className="checkout-panel">
              <p className="step-label">Cart ready</p>
              <h1 ref={focusRef} tabIndex={-1}>
                Your choices, before anything is frozen.
              </h1>
              <div className="choice-summary">
                <span>Selected shoe</span>
                <strong>{selected?.name}</strong>
                <span>
                  {selected === null ? "" : money(selected.variant.pricePaise)}
                </span>
              </div>
              {cart.addonOffer?.outcome === "accepted" ? (
                <div className="choice-summary">
                  <span>Consented add-on</span>
                  <strong>{cart.addonOffer.name}</strong>
                  <span>{money(cart.addonOffer.pricePaise)}</span>
                </div>
              ) : (
                <p className="declined-note">
                  Optional add-on declined — checkout continues normally.
                </p>
              )}
              <button
                className="primary-button wide-button"
                type="button"
                onClick={() => void reviewCart()}
                disabled={busy}
              >
                Freeze totals for review
              </button>
            </section>
          ) : null}

          {!cancelled && snapshot !== null && approval === null ? (
            <section className="checkout-panel">
              <p className="step-label">Final approval</p>
              <h1 ref={focusRef} tabIndex={-1}>
                Nothing moves after you approve.
              </h1>
              <div className="receipt-lines">
                <div>
                  <span>Items</span>
                  <strong>{money(snapshot.subtotalPaise)}</strong>
                </div>
                <div>
                  <span>Tax</span>
                  <strong>{money(snapshot.taxPaise)}</strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <strong>
                    {snapshot.deliveryPaise === 0
                      ? "Free"
                      : money(snapshot.deliveryPaise)}
                  </strong>
                </div>
                <div className="total-line">
                  <span>Exact total</span>
                  <strong>{money(snapshot.totalPaise)}</strong>
                </div>
              </div>
              <label className="approval-check">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                />
                <span>
                  I approve this exact cart and total. I understand the next
                  step creates one secure payment order.
                </span>
              </label>
              <button
                className="primary-button wide-button"
                type="button"
                onClick={() => void approveCart()}
                disabled={!approved || busy}
              >
                Approve exact total
              </button>
              <p className="hash-note">
                Approval fingerprint · {snapshot.hash.slice(0, 12)}
              </p>
            </section>
          ) : null}

          {!cancelled && approval !== null && payment === null ? (
            <section className="checkout-panel centered-state">
              <span className="state-icon safe-icon" aria-hidden="true">
                ✓
              </span>
              <p className="step-label">Policy allowed</p>
              <h1 ref={focusRef} tabIndex={-1}>
                Approved, bounded, ready.
              </h1>
              <p>
                Your approval matches the frozen cart. Stock and price will be
                checked again before a payment order is created.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => void beginPayment()}
                disabled={busy}
              >
                Continue to secure payment
              </button>
            </section>
          ) : null}

          {!cancelled && payment !== null && payment.state !== "paid" ? (
            <section className="checkout-panel centered-state">
              <span
                className={`state-icon ${payment.state === "failed" ? "error-icon" : ""}`}
                aria-hidden="true"
              >
                {payment.state === "failed" ? "!" : "₹"}
              </span>
              <p className="step-label">Test-mode checkout</p>
              <h1 ref={focusRef} tabIndex={-1}>
                {payment.state === "failed"
                  ? "The demo card was declined."
                  : "Payment order ready."}
              </h1>
              <p>
                {payment.state === "failed"
                  ? "No duplicate order was created. Retry safely against the same approved payment order."
                  : scenario === "recovery"
                    ? "This preset deliberately declines once, then demonstrates safe recovery."
                    : "Use the fake provider to complete this deterministic demo payment."}
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => void settleDemoPayment()}
                disabled={busy}
              >
                {payment.state === "failed"
                  ? "Retry same payment safely"
                  : "Complete test payment"}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => void cancelJourney()}
              >
                Cancel checkout
              </button>
            </section>
          ) : null}

          {!cancelled && payment?.state === "paid" && snapshot !== null ? (
            <section className="receipt-panel">
              <div className="receipt-mark" aria-hidden="true">
                ✓
              </div>
              <p className="step-label">Verified receipt</p>
              <h1 ref={focusRef} tabIndex={-1}>
                Paid in test mode.
                <br />
                Control kept end to end.
              </h1>
              <p>
                The signed provider event matched the one server-created order.
                This demo did not move real money.
              </p>
              <div className="receipt-ticket">
                <div>
                  <span>Total</span>
                  <strong>{money(snapshot.totalPaise)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>Paid · test mode</strong>
                </div>
                <div>
                  <span>Order reference</span>
                  <strong>{payment.providerOrderId}</strong>
                </div>
              </div>
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void openAudit()}
                >
                  See how this stayed safe
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={reset}
                >
                  Shop again
                </button>
              </div>
            </section>
          ) : null}

          {error !== null ? (
            <div className="error-banner" role="alert">
              <div>
                <strong>{stale ? "Your cart changed" : "We hit a snag"}</strong>
                <p>{error}</p>
              </div>
              {stale ? (
                <button type="button" onClick={() => void refreshCart()}>
                  Refresh safe cart
                </button>
              ) : (
                <button type="button" onClick={() => setError(null)}>
                  Dismiss
                </button>
              )}
            </div>
          ) : null}
          {busy ? (
            <div className="loading-line" role="status">
              <span />
              Checking the next step…
            </div>
          ) : null}
        </section>

        <aside className="control-rail" aria-label="Purchase progress">
          <p>Safe purchase path</p>
          <ol>
            <li className={response !== null ? "done" : "active"}>
              <span>1</span>
              <div>
                <strong>Describe</strong>
                <small>Your need</small>
              </div>
            </li>
            <li
              className={
                selected !== null ? "done" : response !== null ? "active" : ""
              }
            >
              <span>2</span>
              <div>
                <strong>Choose</strong>
                <small>Grounded match</small>
              </div>
            </li>
            <li
              className={
                snapshot !== null ? "done" : cart !== null ? "active" : ""
              }
            >
              <span>3</span>
              <div>
                <strong>Review</strong>
                <small>Exact cart</small>
              </div>
            </li>
            <li
              className={
                approval !== null ? "done" : snapshot !== null ? "active" : ""
              }
            >
              <span>4</span>
              <div>
                <strong>Approve</strong>
                <small>Bound total</small>
              </div>
            </li>
            <li
              className={
                payment?.state === "paid"
                  ? "done"
                  : payment !== null
                    ? "active"
                    : ""
              }
            >
              <span>5</span>
              <div>
                <strong>Pay</strong>
                <small>Razorpay checkout</small>
              </div>
            </li>
          </ol>
          <div className="rail-note">
            <span aria-hidden="true">◇</span>
            <p>
              <strong>The model proposes.</strong>
              <br />
              Deterministic policy code authorizes every cart and money action.
            </p>
          </div>
          {(response !== null || selected !== null) &&
          payment?.state !== "paid" ? (
            <button
              className="cancel-link"
              type="button"
              onClick={() => void cancelJourney()}
            >
              Cancel journey
            </button>
          ) : null}
        </aside>
      </div>

      {auditOpen ? (
        <div className="drawer-backdrop" onMouseDown={closeAudit}>
          <aside
            className="audit-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <p className="step-label">Human-readable audit</p>
                <h2 id="audit-title">Who decided what</h2>
              </div>
              <button
                ref={auditCloseRef}
                type="button"
                aria-label="Close safety trail"
                onClick={closeAudit}
              >
                ×
              </button>
            </div>
            <div className="audit-primer">
              <div>
                <span className="actor agent">Agent</span>
                <p>Proposes matches and explains trade-offs.</p>
              </div>
              <div>
                <span className="actor policy">Policy</span>
                <p>Validates catalogue facts and allows bounded actions.</p>
              </div>
              <div>
                <span className="actor you">You</span>
                <p>Select, consent, approve and pay.</p>
              </div>
            </div>
            <ol className="audit-list">
              <li>
                <span className="actor agent">Agent</span>
                <div>
                  <strong>Proposed catalogue matches</strong>
                  <p>
                    {selected === null
                      ? "Waiting for your selection."
                      : `${selected.name}, ${selected.variant.colour}, UK ${String(selected.variant.sizeUk)}.`}
                  </p>
                </div>
              </li>
              {audit.map((event) => (
                <li key={event.id}>
                  <span className={`actor ${auditActor(event.eventType)}`}>
                    {auditActor(event.eventType) === "policy"
                      ? "Policy"
                      : auditActor(event.eventType) === "you"
                        ? "You"
                        : "System"}
                  </span>
                  <div>
                    <strong>
                      {event.outcome === "rejected" ? "Blocked" : "Recorded"}
                    </strong>
                    <p>
                      {auditCopy[event.eventType] ??
                        event.eventType.replaceAll("_", " ")}
                    </p>
                    <time>
                      {new Date(event.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
            {audit.length === 0 ? (
              <p className="empty-audit">
                Cart actions will appear here as they happen.
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
