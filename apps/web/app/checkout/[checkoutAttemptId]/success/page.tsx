import { PaymentSuccess } from "./payment-success";

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ checkoutAttemptId: string }>;
}) {
  const { checkoutAttemptId } = await params;
  return <PaymentSuccess checkoutAttemptId={checkoutAttemptId} />;
}
