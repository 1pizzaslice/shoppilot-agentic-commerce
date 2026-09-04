import { parseWebEnvironment } from "@shoppilot/domain";

export default function Home() {
  const environment = parseWebEnvironment(process.env);

  return (
    <main>
      <p className="eyebrow">Razorpay Buildathon · Track 1</p>
      <h1>ShopPilot</h1>
      <p className="promise">
        Grounded recommendations, visible consent, and test-mode checkout.
      </p>
      <p className="status">
        The machine-readable StepUp Shoes catalogue is ready for discovery.
      </p>
      <a href={`${environment.NEXT_PUBLIC_API_BASE_URL}/health`}>
        Check API readiness
      </a>
      <a href="/products/aero-pace">View a database-backed product</a>
      <a href="/merchant">View merchant growth evidence</a>
    </main>
  );
}
