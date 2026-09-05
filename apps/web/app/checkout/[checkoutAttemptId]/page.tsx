import { CheckoutLauncher } from "./checkout-launcher";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkoutAttemptId: string }>;
  searchParams: Promise<{ source?: string; story?: string }>;
}) {
  const { checkoutAttemptId } = await params;
  const { source, story } = await searchParams;
  const checkoutStory = story === "recovery" ? "recovery" : "happy";
  const autonomousBuyer = source === "ai-buyer";
  return (
    <main className="payment-shell">
      <a className="payment-brand" href="/">
        StepUp <small>powered by ShopPilot</small>
      </a>
      <div className="payment-heading">
        <p className="eyebrow">
          {autonomousBuyer
            ? "AI-prepared cart · human-secured payment"
            : "Approved cart · secure checkout"}
        </p>
        <h1>One last secure step.</h1>
        <p>
          {autonomousBuyer
            ? "The autonomous buyer completed discovery, selection and cart preparation under your delegation. You approved the frozen total; now complete authentication in Razorpay’s checkout."
            : "Your exact cart is frozen and approved. Complete authentication in Razorpay’s checkout; StepUp receives only signed payment evidence."}
        </p>
      </div>
      <CheckoutLauncher
        checkoutAttemptId={checkoutAttemptId}
        story={checkoutStory}
      />
    </main>
  );
}
