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
        Repository foundation is running. The catalogue arrives in Session 2.
      </p>
      <a href={`${environment.NEXT_PUBLIC_API_BASE_URL}/health`}>
        Check API readiness
      </a>
    </main>
  );
}
