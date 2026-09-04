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

export default async function ProductPage({ params }: ProductPageProps) {
  const { idOrSlug } = await params;
  const product = await loadProduct(idOrSlug);
  if (product === null) {
    notFound();
  }
  const jsonLd = buildProductJsonLd(product);

  return (
    <main>
      <p className="eyebrow">StepUp Shoes · {product.productType}</p>
      <h1>{product.name}</h1>
      <img
        src={product.imageUrl}
        alt={`${product.name} product view`}
        width="720"
        height="540"
      />
      <p>{product.description}</p>
      <p>{product.returnPolicyDays}-day return window</p>
      <h2>Available variants</h2>
      <ul>
        {product.variants.map((variant) => (
          <li key={variant.id}>
            {variant.colour}
            {variant.sizeUk === null ? "" : ` · UK ${variant.sizeUk}`} · ₹
            {paiseToDecimal(variant.pricePaise)} ·{" "}
            {variant.inStock
              ? `${variant.stockQuantity} in stock`
              : "Out of stock"}
          </li>
        ))}
      </ul>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
    </main>
  );
}
