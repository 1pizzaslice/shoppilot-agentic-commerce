import type { CheckoutLaunch } from "@shoppilot/domain";

export type RazorpayCheckoutConfiguration = NonNullable<
  CheckoutLaunch["checkout"]
>;

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal: { ondismiss: () => void };
}

type RazorpayWindow = Window & {
  Razorpay?: new (options: RazorpayOptions) => { open: () => void };
};

const loadCheckoutScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const checkoutWindow = window as RazorpayWindow;
    if (checkoutWindow.Razorpay !== undefined) return resolve();
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

export const openRazorpayCheckout = async (
  checkout: RazorpayCheckoutConfiguration,
  callbacks: {
    onSuccess: (response: RazorpaySuccessResponse) => void;
    onDismiss: () => void;
  },
): Promise<void> => {
  await loadCheckoutScript();
  const Razorpay = (window as RazorpayWindow).Razorpay;
  if (Razorpay === undefined) throw new Error("Checkout failed to load.");
  new Razorpay({
    key: checkout.keyId,
    amount: checkout.amountPaise,
    currency: checkout.currency,
    name: checkout.merchantName,
    description: checkout.description,
    order_id: checkout.orderId,
    handler: callbacks.onSuccess,
    modal: { ondismiss: callbacks.onDismiss },
  }).open();
};
