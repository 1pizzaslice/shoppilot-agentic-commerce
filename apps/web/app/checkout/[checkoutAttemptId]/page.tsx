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
        ShopPilot
      </a>
      <div className="payment-heading">
        <p className="eyebrow">Approved cart · test-mode payment</p>
        <h1>One last secure step.</h1>
        <p>
          Your exact cart is frozen and approved. Enter test payment details in
          Razorpay’s checkout; ShopPilot receives only signed payment evidence.
        </p>
      </div>
      <CheckoutLauncher
        checkoutAttemptId={checkoutAttemptId}
        story={checkoutStory}
      />
    </main>
  );
}
