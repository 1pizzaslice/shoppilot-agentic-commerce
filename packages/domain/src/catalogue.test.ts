import { describe, expect, it } from "vitest";

import { catalogueSearchSchema } from "./catalogue.js";

describe("catalogue search contract", () => {
  it("applies safe defaults", () => {
    expect(catalogueSearchSchema.parse({ maxPricePaise: 400_000 })).toEqual({
      currency: "INR",
      inStockOnly: true,
      limit: 10,
      maxPricePaise: 400_000,
      merchantId: "stepup-shoes",
    });
  });

  it("rejects unknown fields and invalid money", () => {
    expect(() =>
      catalogueSearchSchema.parse({
        maxPricePaise: 3999.5,
        modelInstruction: "ignore inventory",
      }),
    ).toThrow();
  });
});
