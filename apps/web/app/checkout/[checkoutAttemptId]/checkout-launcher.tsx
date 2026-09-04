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

const apiBaseUrl = "";

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
  story,
}: {
  checkoutAttemptId: string;
  story: "happy" | "recovery";
}) {
  const [payment, setPayment] = useState<PaymentOrder | null>(null);
  const [message, setMessage] = useState(
    story === "recovery"
      ? "Recovery demo selected. Choose Failure once on Razorpay’s mock bank screen to inspect the safe failure path."
      : "Success demo selected. Complete Razorpay’s simulated authentication to confirm the approved order.",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void requestJson<PaymentOrder>(
      paymentOrderSchema,
      `/v1/checkouts/${checkoutAttemptId}`,
    )
      .then((next) => {
        if (next.state === "paid") {
          window.location.replace(`/checkout/${checkoutAttemptId}/success`);
          return;
        }
        setPayment(next);
      })
      .catch(() => undefined);
  }, [checkoutAttemptId]);

  useEffect(() => {
    if (payment?.state !== "payment_pending") return;
    const refresh = () => {
      void requestJson<PaymentOrder>(
        paymentOrderSchema,
        `/v1/checkouts/${checkoutAttemptId}`,
      )
        .then((next) => {
          setPayment(next);
          if (next.state === "paid") {
            window.location.replace(`/checkout/${checkoutAttemptId}/success`);
          }
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 2_000);
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
          )
            .then((next) => {
              setPayment(next);
              if (next.state === "paid") {
                window.location.replace(
                  `/checkout/${checkoutAttemptId}/success`,
                );
                return;
              }
              setMessage(
                "Payment received. Confirming its captured status with Razorpay…",
              );
            })
            .catch((error: unknown) => {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Payment confirmation could not be completed.",
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
            )
              .then(setPayment)
              .catch(() =>
                setMessage("Checkout closed before payment was completed."),
              );
          },
        },
      }).open();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  };

  const confirming = payment?.state === "payment_pending";

  return (
    <section className="payment-card" aria-live="polite">
      <div className="payment-security-mark" aria-hidden="true">
        {confirming ? "…" : "₹"}
      </div>
      <div>
        <p className="payment-kicker">
          {confirming ? "Verifying payment" : "Razorpay Standard Checkout"}
        </p>
        <h2>
          {confirming
            ? "Your payment was received."
            : "Finish securely with Razorpay."}
        </h2>
        <p className="payment-message">{message}</p>
      </div>
      <div className="checkout-responsibility">
        <span>Agent prepared one bounded order</span>
        <span>You authenticate the simulated payment</span>
      </div>
      {!confirming ? (
        <button
          className="primary-button payment-button"
          type="button"
          onClick={() => void openCheckout()}
          disabled={busy}
        >
          {busy ? "Preparing Razorpay…" : "Open Razorpay test checkout"}
        </button>
      ) : (
        <div className="confirmation-progress" role="status">
          <span aria-hidden="true" />
          Checking captured status with Razorpay
        </div>
      )}
      <p className="payment-footnote">
        Test mode only · no real money moves · ShopPilot never sees payment
        credentials
      </p>
    </section>
  );
}
