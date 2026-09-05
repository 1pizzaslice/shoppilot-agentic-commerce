"use client";

import { useEffect, useState } from "react";

import { paymentOrderSchema, type PaymentOrder } from "@shoppilot/domain";

const money = (paise: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);

export function PaymentSuccess({
  checkoutAttemptId,
}: {
  checkoutAttemptId: string;
}) {
  const [payment, setPayment] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payment?.state === "paid") return;
    let active = true;
    let terminal = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/v1/checkouts/${checkoutAttemptId}`);
        if (response.status === 404) {
          terminal = true;
          throw new Error(
            "This payment link is no longer available. Start a new purchase to continue.",
          );
        }
        if (!response.ok) throw new Error("Receipt could not be loaded.");
        const next = paymentOrderSchema.parse(await response.json());
        if (active) setPayment(next);
      } catch (caught: unknown) {
        if (active)
          setError(
            caught instanceof Error ? caught.message : "Receipt unavailable.",
          );
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (!terminal) void refresh();
    }, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [checkoutAttemptId, payment?.state]);

  const paid = payment?.state === "paid";

  return (
    <main className="payment-success-shell">
      <a className="payment-brand" href="/">
        ShopPilot
      </a>
      <section className="payment-success-card" aria-live="polite">
        <div className={`receipt-mark ${paid ? "" : "receipt-mark-pending"}`}>
          {paid ? "✓" : "…"}
        </div>
        <p className="eyebrow">
          {paid ? "Verified Razorpay receipt" : "Confirming payment"}
        </p>
        <h1>{paid ? "Payment successful." : "Almost there."}</h1>
        <p className="success-copy">
          {paid
            ? "Razorpay confirmed that this test payment was captured for the one approved order. No real money moved."
            : (error ??
              "ShopPilot is checking the captured status directly with Razorpay. You can safely keep this page open.")}
        </p>
        {payment !== null ? (
          <div className="receipt-ticket payment-receipt-ticket">
            <div>
              <span>Total</span>
              <strong>{money(payment.amountPaise)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{payment.state.replaceAll("_", " ")}</strong>
            </div>
            <div>
              <span>Order reference</span>
              <strong>{payment.providerOrderId ?? "Being assigned"}</strong>
            </div>
          </div>
        ) : null}
        <div className="button-row payment-success-actions">
          <a className="primary-button link-button" href="/">
            Start another purchase
          </a>
          <a className="secondary-button link-button" href="/merchant">
            View merchant evidence
          </a>
        </div>
      </section>
    </main>
  );
}
