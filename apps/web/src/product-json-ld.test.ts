import { describe, expect, it } from "vitest";

import type { CatalogueProduct } from "@shoppilot/domain";

import { buildProductJsonLd, serializeJsonLd } from "./product-json-ld.js";

const product: CatalogueProduct = {
  id: "shoe-01",
  merchantId: "stepup-shoes",
  catalogueVersion: 1,
  slug: "aero-pace",
  name: "Aero Pace",
  description: "</script><script>unsafe()</script>",
  imageUrl:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=82",
  productType: "running",
  returnPolicyDays: 14,
  variants: [
    {
      id: "variant-1",
      sku: "STEP-01-1-8",
      colour: "Blue",
      sizeUk: 8,
      pricePaise: 399_900,
      currency: "INR",
      stockQuantity: 3,
      inStock: true,
    },
  ],
  compatibleAddons: [],
};

describe("product JSON-LD", () => {
  it("uses canonical integer-paise values and Schema.org availability", () => {
    expect(buildProductJsonLd(product)).toMatchObject({
      "@type": "Product",
      offers: [
        {
          "@type": "Offer",
          price: "3999.00",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
      ],
    });
  });

  it("escapes catalogue markup before embedding JSON in HTML", () => {
    expect(serializeJsonLd(buildProductJsonLd(product))).not.toContain("<");
    expect(serializeJsonLd(buildProductJsonLd(product))).toContain(
      "\\u003c/script>",
    );
  });
});
