"use client";

import { useEffect, useState } from "react";

import {
  checkoutLaunchSchema,
  paymentOrderSchema,
  type CheckoutLaunch,
  type PaymentOrder,
} from "@shoppilot/domain";
import type { z } from "zod";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal: { ondismiss: () => void };
}

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const loadCheckoutScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.Razorpay !== undefined) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing !== null) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Checkout failed to load.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Checkout failed to load."));
    document.head.append(script);
  });

const requestJson = async <T,>(
  schema: z.ZodType<T>,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error("The payment request could not be completed.");
  return schema.parse(body);
};

export function CheckoutLauncher({
  checkoutAttemptId,
}: {
  checkoutAttemptId: string;
}) {
  const [payment, setPayment] = useState<PaymentOrder | null>(null);
  const [message, setMessage] = useState("Ready to open secure test checkout.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      payment === null ||
      !["created", "payment_pending"].includes(payment.state)
    )
      return;
    const timer = window.setInterval(() => {
      void requestJson<PaymentOrder>(
        paymentOrderSchema,
        `/v1/checkouts/${checkoutAttemptId}`,
      )
        .then(setPayment)
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [checkoutAttemptId, payment]);

  const openCheckout = async () => {
    setBusy(true);
    try {
      const launch = await requestJson<CheckoutLaunch>(
        checkoutLaunchSchema,
        "/v1/payment-orders",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ checkoutAttemptId }),
        },
      );
      setPayment(launch.payment);
      if (launch.checkout === null) {
        setMessage(
          "This checkout was already started. Its current status is shown below.",
        );
        return;
      }
      await loadCheckoutScript();
      const Razorpay = window.Razorpay;
      if (Razorpay === undefined) throw new Error("Checkout failed to load.");
      const checkout = launch.checkout;
      new Razorpay({
        key: checkout.keyId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        name: checkout.merchantName,
        description: checkout.description,
        order_id: checkout.orderId,
        handler: (response) => {
          void requestJson<PaymentOrder>(
            paymentOrderSchema,
            "/v1/payments/callback",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                checkoutAttemptId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            },
          ).then((next) => {
            setPayment(next);
            setMessage(
              "Payment evidence received. Waiting for verified confirmation.",
            );
          });
        },
        modal: {
          ondismiss: () => {
            void requestJson<PaymentOrder>(
              paymentOrderSchema,
              "/v1/payments/cancel",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ checkoutAttemptId }),
              },
            ).then(setPayment);
          },
        },
      }).open();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-live="polite">
      <p>{message}</p>
      <button type="button" onClick={() => void openCheckout()} disabled={busy}>
        {busy ? "Preparing checkout…" : "Pay securely in Razorpay test mode"}
      </button>
      {payment !== null ? (
        <p>Payment status: {payment.state.replaceAll("_", " ")}</p>
      ) : null}
    </section>
  );
}
