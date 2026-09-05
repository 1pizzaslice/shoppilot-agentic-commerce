import { CheckoutLauncher } from "./checkout-launcher";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkoutAttemptId: string }>;
  searchParams: Promise<{ story?: string }>;
}) {
  const { checkoutAttemptId } = await params;
  const { story } = await searchParams;
  const checkoutStory = story === "recovery" ? "recovery" : "happy";
  return (
    <main className="payment-shell">
      <a className="payment-brand" href="/">
        StepUp <small>powered by ShopPilot</small>
      </a>
      <div className="payment-heading">
        <p className="eyebrow">Approved cart · secure checkout</p>
        <h1>One last secure step.</h1>
        <p>
          Your exact cart is frozen and approved. Complete authentication in
          Razorpay’s checkout; StepUp receives only signed payment evidence.
        </p>
      </div>
      <CheckoutLauncher
        checkoutAttemptId={checkoutAttemptId}
        story={checkoutStory}
      />
    </main>
  );
}
