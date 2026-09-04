import { CheckoutLauncher } from "./checkout-launcher";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ checkoutAttemptId: string }>;
}) {
  const { checkoutAttemptId } = await params;
  return (
    <main>
      <p className="eyebrow">Test-mode payment</p>
      <h1>Complete your approved purchase</h1>
      <p>
        Review the Razorpay test checkout and enter payment details yourself.
      </p>
      <CheckoutLauncher checkoutAttemptId={checkoutAttemptId} />
    </main>
  );
}
