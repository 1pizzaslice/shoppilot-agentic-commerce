import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { catalogueProductSchema, parseWebEnvironment } from "@shoppilot/domain";

import {
  buildProductJsonLd,
  paiseToDecimal,
  serializeJsonLd,
} from "../../../src/product-json-ld";

interface ProductPageProps {
  params: Promise<{ idOrSlug: string }>;
}

const loadProduct = async (idOrSlug: string) => {
  const environment = parseWebEnvironment(process.env);
  const response = await fetch(
    `${environment.NEXT_PUBLIC_API_BASE_URL}/v1/catalog/products/${encodeURIComponent(idOrSlug)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Catalogue service is unavailable");
  }
  return catalogueProductSchema.parse(await response.json());
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { idOrSlug } = await params;
  const product = await loadProduct(idOrSlug);
  if (product === null) return { title: "Footwear not found · StepUp" };

  const title = `${product.name} · StepUp Footwear`;
  const description = `${product.description} Available from StepUp with ${product.returnPolicyDays}-day returns.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: product.imageUrl, alt: `${product.name} product view` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [product.imageUrl],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { idOrSlug } = await params;
  const product = await loadProduct(idOrSlug);
  if (product === null) {
    notFound();
  }
  const jsonLd = buildProductJsonLd(product);
  const stockedVariants = product.variants.filter((variant) => variant.inStock);
  const startingPrice = Math.min(
    ...product.variants.map((variant) => variant.pricePaise),
  );

  return (
    <main className="product-page-shell">
      <header className="product-page-header">
        <a className="brand" href="/" aria-label="StepUp Footwear home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-copy">
            <strong>StepUp</strong>
            <small>Footwear · powered by ShopPilot</small>
          </span>
        </a>
        <a className="text-button" href="/">
          Ask ShopPilot to find my pair →
        </a>
      </header>

      <div className="catalogue-detail">
        <div className="catalogue-image-column">
          <div className="catalogue-image-frame">
            <img
              src={product.imageUrl}
              alt={`${product.name} product view`}
              width="960"
              height="720"
            />
            <span>{stockedVariants.length} sizes ready to shop</span>
          </div>
          <p>Live catalogue image · product details supplied by StepUp</p>
        </div>

        <section className="catalogue-product-copy">
          <p className="eyebrow">StepUp collection · {product.productType}</p>
          <h1>{product.name}</h1>
          <p className="catalogue-price">
            From ₹{paiseToDecimal(startingPrice)}
          </p>
          <p className="catalogue-description">{product.description}</p>

          <div className="catalogue-assurances" aria-label="Product assurances">
            <div>
              <strong>Live availability</strong>
              <span>Checked against StepUp inventory</span>
            </div>
            <div>
              <strong>{product.returnPolicyDays}-day returns</strong>
              <span>Clear before you approve checkout</span>
            </div>
          </div>

          <div className="variant-section">
            <div className="variant-heading">
              <h2>Available sizes</h2>
              <span>{product.variants[0]?.colour}</span>
            </div>
            <ul className="variant-grid">
              {product.variants.map((variant) => (
                <li
                  className={variant.inStock ? "" : "sold-out"}
                  key={variant.id}
                >
                  <strong>
                    {variant.sizeUk === null
                      ? "One size"
                      : `UK ${variant.sizeUk}`}
                  </strong>
                  <span>₹{paiseToDecimal(variant.pricePaise)}</span>
                  <small>
                    {variant.inStock
                      ? `${variant.stockQuantity} in stock`
                      : "Sold out"}
                  </small>
                </li>
              ))}
            </ul>
          </div>

          <a className="primary-button link-button catalogue-shop-cta" href="/">
            Find my best size and match
          </a>
          <p className="catalogue-shop-note">
            ShopPilot compares this pair with the live collection, then waits
            for your approval before any checkout is created.
          </p>
        </section>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
    </main>
  );
}
