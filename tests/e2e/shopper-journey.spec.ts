import { expect, test, type Page } from "@playwright/test";

const now = "2026-09-04T10:00:00.000Z";
const variant = {
  id: "shoe-01-1-8",
  sku: "STEP-01-1-8",
  colour: "Midnight Blue",
  sizeUk: 8,
  pricePaise: 229_900,
  currency: "INR",
  stockQuantity: 7,
  inStock: true,
};
const recommendation = (index: number) => ({
  productId: `shoe-0${String(index)}`,
  slug: index === 1 ? "aero-pace" : `shoe-${String(index)}`,
  name: index === 1 ? "Aero Pace" : `Grounded Runner ${String(index)}`,
  productType: "running",
  variant: {
    ...variant,
    id: `shoe-0${String(index)}-1-8`,
    pricePaise: 229_900 + (index - 1) * 20_000,
  },
  returnPolicyDays: 14,
  fit: `Option ${String(index)} has an in-stock UK 8 variant.`,
  tradeoff:
    index === 1
      ? "Lowest-priced valid match."
      : "A different styling choice at a higher price.",
  matchedConstraints: ["running", "UK 8", "under ₹4,000", "in stock"],
});

const cart = (
  version: number,
  state: "draft" | "review" | "approved" | "checkout_started",
  outcome: "accepted" | "declined" | null = null,
) => ({
  id: "cart-demo",
  merchantId: "stepup-shoes",
  userId: "demo-shopper",
  state,
  version,
  budgetPaise: 400_000,
  currency: "INR",
  lines:
    version === 1
      ? []
      : [
          {
            id: "line-primary",
            variantId: variant.id,
            kind: "primary",
            quantity: 1,
          },
        ],
  addonOffer:
    version === 1
      ? null
      : {
          id: "offer-demo",
          sourceProductId: "shoe-01",
          productId: "addon-performance-socks",
          variantId: "addon-performance-socks-standard",
          name: "Performance Socks",
          reason: "Selected for this shoe's intended use and construction.",
          pricePaise: 39_900,
          currency: "INR",
          outcome,
        },
});

const snapshot = {
  id: "snapshot-demo",
  cartId: "cart-demo",
  cartVersion: 3,
  hash: "a".repeat(64),
  lines: [
    {
      variantId: variant.id,
      productId: "shoe-01",
      sku: variant.sku,
      kind: "primary",
      quantity: 1,
      unitPricePaise: 229_900,
      discountPaise: 0,
      taxPaise: 0,
      lineTotalPaise: 229_900,
      currency: "INR",
    },
  ],
  subtotalPaise: 229_900,
  discountPaise: 0,
  taxPaise: 0,
  deliveryPaise: 0,
  totalPaise: 229_900,
  currency: "INR",
  createdAt: now,
};

const payment = (state: "created" | "failed" | "paid") => ({
  checkoutAttemptId: "attempt-demo",
  state,
  provider: "fake",
  providerOrderId: "order_fake_demo",
  providerPaymentId: state === "paid" ? "pay_fake_demo" : null,
  amountPaise: 229_900,
  currency: "INR",
  failureCode: state === "failed" ? "demo_card_declined" : null,
  createdAt: now,
  updatedAt: now,
});

const mockApi = async (page: Page) => {
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON() as { outcome?: string } | null;
    let result: unknown;
    if (url.pathname === "/v1/conversations") {
      result = {
        conversationId: "conversation-demo",
        kind: "question",
        state: "collecting",
        intent: {
          merchantId: "stepup-shoes",
          productType: "running",
          maxPricePaise: 400_000,
          currency: "INR",
        },
        message:
          "What UK shoe size do you need? You can also share a preferred colour, or I’ll show the best matches.",
        recommendations: [],
        notice: null,
      };
    } else if (
      url.pathname.includes("/conversations/conversation-demo/messages")
    ) {
      result = {
        conversationId: "conversation-demo",
        kind: "recommendations",
        state: "recommendations_shown",
        intent: {
          merchantId: "stepup-shoes",
          productType: "running",
          maxPricePaise: 400_000,
          currency: "INR",
          sizeUk: 8,
        },
        message: "I found three grounded matches.",
        recommendations: [1, 2, 3].map(recommendation),
        notice: null,
      };
    } else if (url.pathname.startsWith("/v1/catalog/products/")) {
      result = {
        id: "shoe-01",
        merchantId: "stepup-shoes",
        catalogueVersion: 1,
        slug: "aero-pace",
        name: "Aero Pace",
        description:
          "A supportive fictional running shoe with a durable rubber outsole.",
        productType: "running",
        returnPolicyDays: 14,
        variants: [variant],
        compatibleAddons: [],
      };
    } else if (url.pathname === "/v1/carts") {
      result = cart(1, "draft");
    } else if (url.pathname.endsWith("/lines")) {
      result = cart(2, "draft");
    } else if (url.pathname.endsWith("/addon-decision")) {
      result = cart(3, "draft", "declined");
    } else if (url.pathname.endsWith("/review")) {
      result = { cart: cart(4, "review", "declined"), snapshot };
    } else if (url.pathname.endsWith("/approve")) {
      result = {
        cart: cart(5, "approved", "declined"),
        approval: {
          id: "approval-demo",
          cartId: "cart-demo",
          snapshotId: snapshot.id,
          cartHash: snapshot.hash,
          userId: "demo-shopper",
          totalPaise: snapshot.totalPaise,
          currency: "INR",
          expiresAt: "2026-09-04T10:15:00.000Z",
          usedAt: null,
          invalidatedAt: null,
        },
      };
    } else if (url.pathname === "/v1/checkouts") {
      result = {
        attempt: {
          id: "attempt-demo",
          cartId: "cart-demo",
          approvalId: "approval-demo",
          policyDecisionId: "decision-demo",
          idempotencyKey: "checkout-demo",
          state: "authorized",
          createdAt: now,
        },
        decision: {
          id: "decision-demo",
          cartId: "cart-demo",
          approvalId: "approval-demo",
          outcome: "allowed",
          reason: "allowed",
          createdAt: now,
        },
      };
    } else if (url.pathname === "/v1/payment-orders") {
      result = { payment: payment("created"), checkout: null };
    } else if (url.pathname === "/v1/demo/payments/settle") {
      result = payment(body?.outcome === "declined" ? "failed" : "paid");
    } else if (url.pathname.endsWith("/audit")) {
      result = [];
    } else {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "Not mocked" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
};

const reachPayment = async (
  page: Page,
  preset: "Happy path" | "Decline & recover",
) => {
  await page.goto("/");
  await page.getByRole("button", { name: preset }).click();
  await page.getByRole("button", { name: "Find my pair" }).click();
  await page.getByLabel("Your answer").fill("8");
  await page.getByRole("button", { name: "Show matches" }).click();
  await page.getByRole("button", { name: "View this pair" }).first().click();
  await page.getByRole("button", { name: "Add this exact pair" }).click();
  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByRole("button", { name: "Freeze totals for review" }).click();
  await page
    .getByRole("checkbox", { name: /I approve this exact cart/ })
    .check();
  await page.getByRole("button", { name: "Approve exact total" }).click();
  await page
    .getByRole("button", { name: "Create one test payment order" })
    .click();
};

test.describe("deterministic browser states", () => {
  test.beforeEach(async ({ page }) => mockApi(page));

  test("completes the grounded, consented happy path", async ({ page }) => {
    await reachPayment(page, "Happy path");
    await page.getByRole("button", { name: "Complete test payment" }).click();
    await expect(
      page.getByRole("heading", { name: /Paid in test mode/ }),
    ).toBeVisible();
    await expect(page.getByText("order_fake_demo")).toBeVisible();
  });

  test("recovers a declined payment without creating another order", async ({
    page,
  }) => {
    let orderRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/v1/payment-orders")
        orderRequests += 1;
    });
    await reachPayment(page, "Decline & recover");
    await page.getByRole("button", { name: "Complete test payment" }).click();
    await expect(
      page.getByRole("heading", { name: "The demo card was declined." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Retry same payment safely" })
      .click();
    await expect(
      page.getByRole("heading", { name: /Paid in test mode/ }),
    ).toBeVisible();
    expect(orderRequests).toBe(1);
  });
});

test("completes the live PostgreSQL and fake-provider path", async ({
  page,
}) => {
  await reachPayment(page, "Happy path");
  await page.getByRole("button", { name: "Complete test payment" }).click();
  await expect(
    page.getByRole("heading", { name: /Paid in test mode/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See how this stayed safe" }).click();
  await expect(
    page.getByRole("dialog", { name: "Who decided what" }),
  ).toBeVisible();
  await expect(
    page.getByText("Policy verified approval, stock, price and budget."),
  ).toBeVisible();
});
