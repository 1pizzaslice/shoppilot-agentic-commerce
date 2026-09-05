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
  const activityUsesRevenue = summary.activity.series.some(
    (point) => point.grossValuePaise > 0,
  );
  const maxActivity = Math.max(
    ...summary.activity.series.map((point) =>
      activityUsesRevenue ? point.grossValuePaise : point.cartsCreated,
    ),
    1,
  );
  const maxFunnel = Math.max(...funnel.map(([, value]) => value), 1);
  const bestSellers = summary.productPerformance
    .filter((product) => product.unitsSold > 0)
    .slice(0, 5);
  const needsAttention = [...summary.productPerformance]
    .filter(
      (product) =>
        product.unitsSold === 0 &&
        (product.cartAdds > 0 || product.stockQuantity <= 24),
    )
    .sort(
      (left, right) =>
        right.cartAdds - left.cartAdds ||
        left.stockQuantity - right.stockQuantity ||
        left.name.localeCompare(right.name),
    )
    .slice(0, 5);
  const categoryUsesRevenue = summary.categoryPerformance.some(
    (category) => category.grossValuePaise > 0,
  );
  const categoryUsesInterest = summary.categoryPerformance.some(
    (category) => category.cartAdds > 0,
  );
  const categoryValue = (productType: string): number => {
    const performance = summary.categoryPerformance.find(
      (category) => category.productType === productType,
    );
    if (categoryUsesRevenue) return performance?.grossValuePaise ?? 0;
    if (categoryUsesInterest) return performance?.cartAdds ?? 0;
    return (
      summary.catalogue.categories.find(
        (category) => category.productType === productType,
      )?.count ?? 0
    );
  };
  const maxCategory = Math.max(
    ...summary.categoryPerformance.map((category) =>
      categoryValue(category.productType),
    ),
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
        <div>
          <p className="merchant-intro">
            Live catalogue health and every commerce number below come from
            PostgreSQL—not model text or placeholder analytics.
          </p>
          <a className="merchant-shop-link" href="/">
            Open shopper experience →
          </a>
        </div>
      </header>

      <section className="catalogue-overview" aria-label="Live catalogue">
        <div className="catalogue-overview-heading">
          <div>
            <p className="eyebrow">Live catalogue</p>
            <h2>{summary.catalogue.shoeStyles} distinct footwear styles</h2>
            <p>
              {summary.catalogue.accessories} consent-only add-ons · sizes 5–12
              · {formatMoney(summary.catalogue.priceFloorPaise)}–
              {formatMoney(summary.catalogue.priceCeilingPaise)}
            </p>
          </div>
          <div className="inventory-health">
            <span>
              <b>{summary.catalogue.liveVariants}</b> live variants
            </span>
            <span>
              <b>{summary.catalogue.lowStockVariants}</b> low stock
            </span>
            <span>
              <b>{summary.catalogue.outOfStockVariants}</b> sold out
            </span>
          </div>
        </div>
        <div className="category-chips" aria-label="Catalogue categories">
          {summary.catalogue.categories.map((category) => (
            <span key={category.productType}>
              {category.productType} <b>{category.count}</b>
            </span>
          ))}
        </div>
        <div className="merchant-product-grid">
          {summary.catalogue.featuredProducts.map((product) => (
            <article key={product.productId}>
              <img src={product.imageUrl} alt={`${product.name} product`} />
              <div>
                <span>
                  {product.productType} · {product.colour}
                </span>
                <strong>{product.name}</strong>
                <small>
                  {formatMoney(product.pricePaise)} · {product.stockQuantity} in
                  stock across sizes
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>

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

      <section className="insight-section" aria-labelledby="growth-insights">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Growth factors</p>
            <h2 id="growth-insights">What deserves attention now</h2>
          </div>
          <span>Derived from observed commerce events</span>
        </div>
        <div className="insight-grid">
          {summary.insights.map((insight) => (
            <article
              className={`insight-card ${insight.kind}`}
              key={insight.title}
            >
              <span>{insight.kind}</span>
              <h3>{insight.title}</h3>
              <p>{insight.detail}</p>
              <small>{insight.action}</small>
            </article>
          ))}
        </div>
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
          <ol className="funnel-chart" aria-label="Observed purchase funnel">
            {funnel.map(([label, value], index) => (
              <li key={label}>
                <div>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>{label}</b>
                </div>
                <i>
                  <span style={{ width: `${(value / maxFunnel) * 100}%` }} />
                </i>
                <strong>{value}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="merchant-panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">7-day activity</p>
              <h2>
                {activityUsesRevenue ? "Verified order value" : "Cart demand"}
              </h2>
            </div>
            <span>
              {activityUsesRevenue ? "Paid snapshots" : "No estimated revenue"}
            </span>
          </div>
          <div
            className="activity-chart"
            role="img"
            aria-label={`Daily ${activityUsesRevenue ? "verified revenue" : "cart creation"} for the last seven days`}
          >
            {summary.activity.series.map((point) => {
              const value = activityUsesRevenue
                ? point.grossValuePaise
                : point.cartsCreated;
              return (
                <div className="activity-column" key={point.date}>
                  <span>
                    {activityUsesRevenue ? formatMoney(value) : String(value)}
                  </span>
                  <i>
                    <b
                      style={{
                        height: `${Math.max(value === 0 ? 2 : 12, (value / maxActivity) * 100)}%`,
                      }}
                    />
                  </i>
                  <small>
                    {new Date(`${point.date}T00:00:00Z`).toLocaleDateString(
                      "en-IN",
                      { weekday: "short" },
                    )}
                  </small>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="merchant-panel performance-panel">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Product performance</p>
            <h2>Best sellers and demand gaps</h2>
          </div>
          <span>Paid units outrank cart interest</span>
        </div>
        <div className="performance-columns">
          <div>
            <h3>Best sellers</h3>
            {bestSellers.length === 0 ? (
              <p className="empty-evidence">
                No verified paid product sales yet. Rankings will appear after
                test-mode purchases complete.
              </p>
            ) : (
              <ol className="ranked-products">
                {bestSellers.map((product, index) => (
                  <li key={product.productId}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <img src={product.imageUrl} alt="" />
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {product.productType} · {product.colour}
                      </small>
                    </div>
                    <b>{product.unitsSold} sold</b>
                    <em>{formatMoney(product.grossValuePaise)}</em>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3>Needs attention</h3>
            {needsAttention.length === 0 ? (
              <p className="empty-evidence">
                No unsold product currently has observed cart interest or a
                low-stock flag. More journeys will make demand gaps visible.
              </p>
            ) : (
              <ol className="ranked-products watch-products">
                {needsAttention.map((product) => (
                  <li key={product.productId}>
                    <img src={product.imageUrl} alt="" />
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {product.productType} · {product.colour}
                      </small>
                    </div>
                    <b>
                      {product.cartAdds} cart{" "}
                      {product.cartAdds === 1 ? "add" : "adds"}
                    </b>
                    <em>{product.stockQuantity} in stock</em>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section className="merchant-panel category-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Category mix</p>
            <h2>
              {categoryUsesRevenue
                ? "Verified value by use"
                : categoryUsesInterest
                  ? "Cart interest by use"
                  : "Catalogue coverage by use"}
            </h2>
          </div>
          <span>
            {categoryUsesRevenue
              ? "Revenue"
              : categoryUsesInterest
                ? "Cart adds"
                : "Live styles"}
          </span>
        </div>
        <div className="category-chart">
          {summary.categoryPerformance.map((category) => {
            const value = categoryValue(category.productType);
            return (
              <div key={category.productType}>
                <span>{category.productType}</span>
                <i>
                  <b style={{ width: `${(value / maxCategory) * 100}%` }} />
                </i>
                <strong>
                  {categoryUsesRevenue ? formatMoney(value) : value}
                </strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="merchant-panel catalogue-table-panel">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Catalogue intelligence</p>
            <h2>Every live footwear style</h2>
          </div>
          <span>
            {summary.productPerformance.length} products · real inventory
          </span>
        </div>
        <div className="table-scroll">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Colour</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Cart adds</th>
                <th>Paid units</th>
                <th>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {summary.productPerformance.map((product) => (
                <tr key={product.productId}>
                  <td>
                    <img src={product.imageUrl} alt="" />
                    <strong>{product.name}</strong>
                  </td>
                  <td>
                    <span className="table-chip">{product.productType}</span>
                  </td>
                  <td>{product.colour}</td>
                  <td>{formatMoney(product.pricePaise)}</td>
                  <td>
                    <span
                      className={
                        product.stockQuantity <= 24 ? "stock-risk" : "stock-ok"
                      }
                    >
                      {product.stockQuantity}
                    </span>
                  </td>
                  <td>{product.cartAdds}</td>
                  <td>{product.unitsSold}</td>
                  <td>
                    {product.cartAdds === 0
                      ? "—"
                      : `${(product.conversionBasisPoints / 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="merchant-panel addon-panel">
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
