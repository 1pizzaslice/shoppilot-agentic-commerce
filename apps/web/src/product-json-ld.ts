import type { CatalogueProduct } from "@shoppilot/domain";

export const paiseToDecimal = (paise: number): string => {
  const rupees = Math.floor(paise / 100);
  const remainder = (paise % 100).toString().padStart(2, "0");
  return `${rupees}.${remainder}`;
};

export const buildProductJsonLd = (product: CatalogueProduct) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  sku: product.id,
  name: product.name,
  description: product.description,
  image: product.imageUrl,
  category: product.productType,
  offers: product.variants.map((variant) => ({
    "@type": "Offer",
    sku: variant.sku,
    price: paiseToDecimal(variant.pricePaise),
    priceCurrency: variant.currency,
    availability: variant.inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    color: variant.colour,
    size: variant.sizeUk === null ? undefined : `UK ${variant.sizeUk}`,
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      merchantReturnDays: product.returnPolicyDays,
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
    },
  })),
  isRelatedTo: product.compatibleAddons.map((addon) => ({
    "@type": "Product",
    sku: addon.productId,
    name: addon.name,
  })),
});

export const serializeJsonLd = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");
