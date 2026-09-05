"use client";

import { useEffect, useRef, useState } from "react";

import type {
  Approval,
  Cart,
  CheckoutSnapshot,
  PaymentOrder,
  ShoppingRecommendation,
  ShoppingResponse,
} from "@shoppilot/domain";
import { z } from "zod";

const discoverySchema = z
  .object({
    protocol: z.literal("shoppilot-catalogue"),
    version: z.literal("1.0"),
    ucpConformance: z.literal(false),
    description: z.string().min(1),
    merchant: z.object({ id: z.string(), name: z.string() }).strict(),
    capabilities: z
      .object({
        search: z
          .object({
            method: z.literal("POST"),
            path: z.string().startsWith("/"),
          })
          .strict(),
        productLookup: z
          .object({
            method: z.literal("GET"),
            pathTemplate: z.string().startsWith("/"),
          })
          .strict(),
        openapi: z
          .object({
            method: z.literal("GET"),
            path: z.string().startsWith("/"),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

type TraceStatus = "complete" | "active" | "waiting" | "blocked";

interface TraceStep {
  actor: "Buyer" | "Catalogue" | "Shopper" | "Policy" | "Razorpay";
  title: string;
  endpoint: string;
  detail: string;
  status: TraceStatus;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value / 100);

const shortId = (value: string): string =>
  value.length > 18 ? `${value.slice(0, 12)}…` : value;

export function AiBuyerTrace({
  response,
  selected,
  cart,
  snapshot,
  approval,
  payment,
  onClose,
}: {
  response: ShoppingResponse | null;
  selected: ShoppingRecommendation | null;
  cart: Cart | null;
  snapshot: CheckoutSnapshot | null;
  approval: Approval | null;
  payment: PaymentOrder | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [discovery, setDiscovery] = useState<
    | { state: "loading" }
    | {
        state: "ready";
        merchant: string;
        protocol: string;
        searchEndpoint: string;
        productEndpoint: string;
        openapiPath: string;
      }
    | { state: "failed" }
  >({ state: "loading" });

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    void fetch("/.well-known/ucp")
      .then(async (result) => {
        if (!result.ok) throw new Error("Discovery request failed");
        return discoverySchema.parse(await result.json());
      })
      .then((document) =>
        setDiscovery({
          state: "ready",
          merchant: document.merchant.name,
          protocol: `${document.protocol} v${document.version}`,
          searchEndpoint: `${document.capabilities.search.method} ${document.capabilities.search.path}`,
          productEndpoint: `${document.capabilities.productLookup.method} ${document.capabilities.productLookup.pathTemplate}`,
          openapiPath: document.capabilities.openapi.path,
        }),
      )
      .catch(() => setDiscovery({ state: "failed" }));
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const intent = response?.intent;
  const steps: readonly TraceStep[] = [
    {
      actor: "Buyer",
      title: "Discover merchant capabilities",
      endpoint: "GET /.well-known/ucp",
      detail:
        discovery.state === "ready"
          ? `${discovery.merchant} · ${discovery.protocol}`
          : discovery.state === "failed"
            ? "The machine-readable discovery request failed."
            : "Reading the merchant capability document…",
      status:
        discovery.state === "ready"
          ? "complete"
          : discovery.state === "failed"
            ? "blocked"
            : "active",
    },
    {
      actor: "Catalogue",
      title: "Interpret intent and search live stock",
      endpoint:
        discovery.state === "ready"
          ? `POST /v1/conversations → ${discovery.searchEndpoint} (read-only)`
          : "POST /v1/conversations → catalogue search (read-only)",
      detail:
        response === null
          ? "Waiting for a shopper request."
          : response.kind === "question"
            ? "The buyer paused for a decision-changing shopper answer."
            : response.kind === "no_results"
              ? "No product passed every hard catalogue constraint."
              : `${String(response.recommendations.length)} grounded option${response.recommendations.length === 1 ? "" : "s"} · ${intent?.productType ?? "shoe"} · UK ${String(intent?.sizeUk ?? "—")}${intent?.maxPricePaise === undefined ? "" : ` · up to ${money(intent.maxPricePaise)}`}`,
      status:
        response === null
          ? "waiting"
          : response.kind === "question"
            ? "active"
            : response.kind === "no_results"
              ? "blocked"
              : "complete",
    },
    {
      actor: "Shopper",
      title: "Consent to an exact variant",
      endpoint:
        discovery.state === "ready"
          ? discovery.productEndpoint
          : "GET /v1/catalog/products/{idOrSlug}",
      detail:
        selected === null
          ? "The buyer can propose, but the shopper selects the SKU."
          : `${selected.name} · ${selected.variant.sku} · ${selected.variant.colour} · UK ${String(selected.variant.sizeUk)}`,
      status:
        selected !== null
          ? "complete"
          : response?.kind === "recommendations"
            ? "active"
            : "waiting",
    },
    {
      actor: "Buyer",
      title: "Prepare a versioned draft cart",
      endpoint: "POST /v1/carts → POST /v1/carts/{id}/lines",
      detail:
        cart === null
          ? "No cart mutation occurs before the shopper asks to add the pair."
          : `Cart ${shortId(cart.id)} · version ${String(cart.version)} · ${String(cart.lines.length)} consented line${cart.lines.length === 1 ? "" : "s"}`,
      status:
        cart !== null ? "complete" : selected !== null ? "active" : "waiting",
    },
    {
      actor: "Shopper",
      title: "Freeze and approve the exact total",
      endpoint: "POST /review → POST /approve",
      detail:
        approval !== null
          ? `${money(approval.totalPaise)} approved · expires ${new Date(approval.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
          : snapshot !== null
            ? `${money(snapshot.totalPaise)} frozen · fingerprint ${snapshot.hash.slice(0, 12)}`
            : "Price, tax, delivery, SKU and quantity must be frozen first.",
      status:
        approval !== null
          ? "complete"
          : snapshot !== null
            ? "active"
            : "waiting",
    },
    {
      actor: "Policy",
      title: "Revalidate and authorize one checkout",
      endpoint: "POST /v1/checkouts",
      detail:
        payment !== null
          ? "Approval, budget, price, stock and duplicate-execution checks passed."
          : approval !== null
            ? "Ready to recheck every frozen commerce fact."
            : "Money actions remain unavailable without bound approval.",
      status:
        payment !== null
          ? "complete"
          : approval !== null
            ? "active"
            : "waiting",
    },
    {
      actor: "Razorpay",
      title: "Create one test payment order",
      endpoint: "POST /v1/payment-orders",
      detail:
        payment?.providerOrderId !== null &&
        payment?.providerOrderId !== undefined
          ? `${payment.provider} · ${shortId(payment.providerOrderId)} · ${money(payment.amountPaise)} · ${payment.state}`
          : "The server creates no provider order before policy authorization.",
      status:
        payment?.providerOrderId !== null &&
        payment?.providerOrderId !== undefined
          ? "complete"
          : approval !== null
            ? "active"
            : "waiting",
    },
  ];

  return (
    <div className="trace-backdrop" onMouseDown={onClose}>
      <aside
        className="buyer-trace-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="buyer-trace-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="trace-header">
          <div>
            <p className="step-label">External AI-buyer proof</p>
            <h2 id="buyer-trace-title">The machine view of this purchase</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close AI buyer trace"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="trace-intro">
          These are the real contracts behind the visible journey. The buyer may
          discover and propose; deterministic policy and explicit shopper
          approval control every mutation and money action. The published
          discovery profile is a practical UCP-inspired subset, not a claim of
          full UCP conformance.
        </p>
        <div className="trace-contract-links">
          <a href="/.well-known/ucp" target="_blank" rel="noreferrer">
            Capability document ↗
          </a>
          <a
            href={
              discovery.state === "ready"
                ? discovery.openapiPath
                : "/openapi.json"
            }
            target="_blank"
            rel="noreferrer"
          >
            OpenAPI contract ↗
          </a>
        </div>
        <ol className="machine-trace-list">
          {steps.map((step, index) => (
            <li className={step.status} key={step.title}>
              <span className="trace-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="trace-step-meta">
                  <span className={`trace-actor ${step.actor.toLowerCase()}`}>
                    {step.actor}
                  </span>
                  <span className={`trace-status ${step.status}`}>
                    {step.status}
                  </span>
                </div>
                <strong>{step.title}</strong>
                <code>{step.endpoint}</code>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="trace-footer">
          <strong>Not a staged parallel demo</strong>
          <p>
            This trace advances from the same catalogue, cart, approval and
            payment state shown to the shopper.
          </p>
        </div>
      </aside>
    </div>
  );
}
