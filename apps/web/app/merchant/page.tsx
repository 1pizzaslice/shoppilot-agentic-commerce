import {
  merchantGrowthSummarySchema,
  parseWebEnvironment,
  type MerchantGrowthSummary,
} from "@shoppilot/domain";

export const dynamic = "force-dynamic";

const formatMoney = (paise: number): string => {
  const rupees = Math.trunc(paise / 100).toLocaleString("en-IN");
  return `₹${rupees}.${String(paise % 100).padStart(2, "0")}`;
};

const readSummary = async (): Promise<MerchantGrowthSummary> => {
  const environment = parseWebEnvironment(process.env);
  const response = await fetch(
    `${environment.NEXT_PUBLIC_API_BASE_URL}/v1/merchants/stepup-shoes/growth`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Growth evidence is unavailable.");
  return merchantGrowthSummarySchema.parse(await response.json());
};

export default async function MerchantPage() {
  let summary: MerchantGrowthSummary;
  try {
    summary = await readSummary();
  } catch {
    return (
      <main className="merchant-shell">
        <p className="eyebrow">StepUp Shoes · merchant evidence</p>
        <h1 className="merchant-title">Growth view unavailable</h1>
        <p className="status">
          Start the ShopPilot API and reload. No estimate is shown when stored
          evidence cannot be read.
        </p>
      </main>
    );
  }

  const funnel = [
    ["Carts", summary.funnel.cartsCreated],
    ["Reviewed", summary.funnel.cartsReviewed],
    ["Approved", summary.funnel.cartsApproved],
    ["Checkout", summary.funnel.checkoutsStarted],
    ["Paid", summary.funnel.paidOrders],
  ] as const;
  const maxSimulation = Math.max(
    summary.simulation.compatibilityPolicyValuePaise,
    1,
  );

  return (
    <main className="merchant-shell">
      <header className="merchant-header">
        <div>
          <p className="eyebrow">StepUp Shoes · merchant evidence</p>
          <h1 className="merchant-title">
            Growth without hidden cart changes.
          </h1>
        </div>
        <p className="merchant-intro">
          Every number below comes from stored carts, approvals, checkout
          snapshots, payment states, or append-only events.
        </p>
      </header>

      <section className="metric-grid" aria-label="Paid order value">
        <article className="metric-card accent-card">
          <span>Observed order value</span>
          <strong>
            {formatMoney(summary.orderValues.grossOrderValuePaise)}
          </strong>
          <small>Verified paid snapshots</small>
        </article>
        <article className="metric-card">
          <span>Base cart value</span>
          <strong>{formatMoney(summary.orderValues.baseCartValuePaise)}</strong>
          <small>Primary lines in paid orders</small>
        </article>
        <article className="metric-card">
          <span>Accepted add-on value</span>
          <strong>
            {formatMoney(summary.orderValues.acceptedAddonValuePaise)}
          </strong>
          <small>Explicitly accepted, then paid</small>
        </article>
        <article className="metric-card">
          <span>Attach rate</span>
          <strong>
            {(summary.orderValues.attachRateBasisPoints / 100).toFixed(2)}%
          </strong>
          <small>Paid orders with an add-on</small>
        </article>
      </section>

      <div className="merchant-columns">
        <section className="merchant-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Observed funnel</p>
              <h2>From cart to verified payment</h2>
            </div>
            <span>
              {formatMoney(summary.orderValues.averageOrderValuePaise)} average
            </span>
          </div>
          <ol className="funnel-list">
            {funnel.map(([label, value], index) => (
              <li key={label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{label}</b>
                <strong>{value}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="merchant-panel">
          <p className="eyebrow">Add-on outcomes</p>
          <h2>Consent stays visible</h2>
          <div className="outcome-grid">
            <div>
              <strong>{summary.addonOutcomes.offered}</strong>
              <span>Offered</span>
            </div>
            <div>
              <strong>{summary.addonOutcomes.accepted}</strong>
              <span>Accepted</span>
            </div>
            <div>
              <strong>{summary.addonOutcomes.declined}</strong>
              <span>Declined</span>
            </div>
            <div>
              <strong>{summary.addonOutcomes.skipped}</strong>
              <span>Skipped</span>
            </div>
          </div>
          <p className="panel-note">
            Declining or skipping never mutates the cart and never blocks
            checkout.
          </p>
        </section>
      </div>

      <section className="merchant-panel simulation-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Fixed comparison</p>
            <h2>Compatibility policy vs. no add-on</h2>
          </div>
          <span className="simulation-label">{summary.simulation.label}</span>
        </div>
        <p>
          Replays {summary.simulation.scenarioCount} authorized historical
          carts. It does not estimate conversion lift or claim production
          revenue.
        </p>
        <div className="comparison-row">
          <span>No add-on</span>
          <div>
            <i
              style={{
                width: `${(summary.simulation.noAddonValuePaise / maxSimulation) * 100}%`,
              }}
            />
          </div>
          <strong>{formatMoney(summary.simulation.noAddonValuePaise)}</strong>
        </div>
        <div className="comparison-row policy-row">
          <span>Compatibility policy</span>
          <div>
            <i
              style={{
                width: `${(summary.simulation.compatibilityPolicyValuePaise / maxSimulation) * 100}%`,
              }}
            />
          </div>
          <strong>
            {formatMoney(summary.simulation.compatibilityPolicyValuePaise)}
          </strong>
        </div>
        <p className="incremental-value">
          Descriptive add-on difference:{" "}
          <b>{formatMoney(summary.simulation.incrementalAddonValuePaise)}</b>
        </p>
      </section>

      <section className="merchant-panel">
        <p className="eyebrow">Recent suggestions</p>
        <h2>Why each add-on appeared</h2>
        {summary.recentSuggestions.length === 0 ? (
          <p className="panel-note">
            No add-on outcomes have been recorded yet.
          </p>
        ) : (
          <div className="suggestion-list">
            {summary.recentSuggestions.map((suggestion) => (
              <article key={suggestion.offerId}>
                <div>
                  <strong>{suggestion.productName}</strong>
                  <p>{suggestion.reason}</p>
                </div>
                <div className="suggestion-outcome">
                  <span>{suggestion.outcome ?? "awaiting decision"}</span>
                  <small>
                    {suggestion.checkoutState === null
                      ? "No checkout started"
                      : `Checkout: ${suggestion.checkoutState.replaceAll("_", " ")}`}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="merchant-panel definitions-panel">
        <p className="eyebrow">Reproducible definitions</p>
        <h2>How these numbers are calculated</h2>
        <dl>
          {summary.definitions.map((definition) => (
            <div key={definition.key}>
              <dt>{definition.key}</dt>
              <dd>{definition.description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
