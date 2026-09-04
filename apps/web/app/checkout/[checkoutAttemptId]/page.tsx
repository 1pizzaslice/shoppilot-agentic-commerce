import { CheckoutLauncher } from "./checkout-launcher";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ checkoutAttemptId: string }>;
}) {
  const { checkoutAttemptId } = await params;
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
      <CheckoutLauncher checkoutAttemptId={checkoutAttemptId} />
    </main>
  );
}
