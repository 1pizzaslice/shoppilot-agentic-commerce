import { expect, test, type Page } from "@playwright/test";

const now = "2026-09-04T10:00:00.000Z";
const variant = {
  id: "shoe-01-1-8",
  sku: "STEP-01-1-8",
  colour: "Signal Red",
  sizeUk: 8,
  pricePaise: 229_900,
  currency: "INR",
  stockQuantity: 7,
  inStock: true,
};
const demoPhotos = [
  {
    colour: "Signal Red",
    url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=82",
  },
  {
    colour: "Jet Black",
    url: "https://images.unsplash.com/photo-1556306535-fc6684304af1?auto=format&fit=crop&w=1200&q=82",
  },
  {
    colour: "Clean White",
    url: "https://images.unsplash.com/photo-1521903062400-b80f2cb8cb9d?auto=format&fit=crop&w=1200&q=82",
  },
] as const;
const recommendation = (index: number) => ({
  productId: `shoe-0${String(index)}`,
  slug: index === 1 ? "aero-pace" : `shoe-${String(index)}`,
  name: index === 1 ? "Aero Pace" : `Grounded Runner ${String(index)}`,
  imageUrl: demoPhotos[index - 1]?.url ?? demoPhotos[0].url,
  productType: "running",
  variant: {
    ...variant,
    id: `shoe-0${String(index)}-1-8`,
    colour: demoPhotos[index - 1]?.colour ?? demoPhotos[0].colour,
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
          imageUrl:
            "https://images.unsplash.com/flagged/photo-1557599365-977bd4eecc4d?auto=format&fit=crop&w=1200&q=82",
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

const payment = (state: "created" | "failed" | "paid" | "cancelled") => ({
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
  await page.route("**/.well-known/ucp", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        protocol: "shoppilot-catalogue",
        version: "1.0",
        ucpConformance: false,
        description: "A machine-readable test merchant profile.",
        merchant: { id: "stepup-shoes", name: "StepUp Shoes" },
        capabilities: {
          search: { method: "POST", path: "/v1/catalog/search" },
          productLookup: {
            method: "GET",
            pathTemplate: "/v1/catalog/products/{idOrSlug}",
          },
          openapi: { method: "GET", path: "/openapi.json" },
        },
      }),
    });
  });
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
        imageUrl:
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=82",
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
      result = [
        {
          id: "audit-cart-created",
          entityType: "cart",
          entityId: "cart-demo",
          eventType: "cart_created",
          outcome: "completed",
          metadata: { budgetPaise: 400_000 },
          correlationId: "request-demo",
          createdAt: now,
        },
        {
          id: "audit-cart-approved",
          entityType: "approval",
          entityId: "approval-demo",
          eventType: "cart_approved",
          outcome: "completed",
          metadata: { totalPaise: 229_900 },
          correlationId: "request-demo",
          createdAt: now,
        },
      ];
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
  preset: "Successful checkout" | "Failure & recovery",
) => {
  await page.goto("/");
  await page
    .getByText("Try a guided buildathon story", { exact: true })
    .click();
  await page.getByRole("button", { name: preset }).click();
  await page.getByRole("button", { name: "Find my pair" }).click();
  await page.getByLabel("Your answer").fill("8");
  await page.getByRole("button", { name: "Show matches" }).click();
  await page.getByRole("button", { name: "View this pair" }).first().click();
  await page.getByRole("button", { name: "Add this exact pair" }).click();
  await expect(page.locator(".addon-image-wrap img")).toBeVisible();
  await expect(page.locator(".addon-image-wrap img")).toHaveAttribute(
    "alt",
    /product photo$/,
  );
  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByRole("button", { name: "Freeze totals for review" }).click();
  await page
    .getByRole("checkbox", { name: /I approve this exact cart/ })
    .check();
  await page.getByRole("button", { name: "Approve exact total" }).click();
  await page
    .getByRole("button", { name: "Continue to secure payment" })
    .click();
};

test.describe("deterministic browser states", () => {
  test.beforeEach(async ({ page }) => mockApi(page));

  test("shows the live external AI-buyer contract trace", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", {
        name: /Inspect this shopper journey’s contracts/,
      })
      .click();

    const trace = page.getByRole("dialog", {
      name: "The contract view of this purchase",
    });
    await expect(trace).toBeVisible();
    await expect(trace.getByText("GET /.well-known/ucp")).toBeVisible();
    await expect(
      trace.getByText("StepUp Shoes · shoppilot-catalogue v1.0"),
    ).toBeVisible();
    await expect(trace.getByText("POST /v1/payment-orders")).toBeVisible();
    await expect(
      trace.getByText("This is the guided shopper journey"),
    ).toBeVisible();

    await trace.getByRole("button", { name: "Close contract trace" }).click();
    await expect(trace).toBeHidden();
  });

  test("completes the grounded, consented happy path", async ({ page }) => {
    await reachPayment(page, "Successful checkout");
    await page.getByRole("button", { name: "Contract trace" }).click();
    const buyerTrace = page.getByRole("dialog", {
      name: "The contract view of this purchase",
    });
    await expect(buyerTrace).toBeVisible();
    await expect(
      buyerTrace.locator(".machine-trace-list > li.complete"),
    ).toHaveCount(7);
    await expect(buyerTrace).toContainText("order_fake_demo");
    await buyerTrace
      .getByRole("button", { name: "Close contract trace" })
      .click();
    await page.getByRole("button", { name: "View safety trail" }).click();
    await expect(
      page.getByRole("heading", { name: "Every decision, in order" }),
    ).toBeVisible();
    await expect(page.getByText("₹4,000 spending limit")).toBeVisible();
    await expect(page.getByText("locked ₹2,299 total")).toBeVisible();
    await page.getByRole("button", { name: "Close safety trail" }).click();
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
    await reachPayment(page, "Failure & recovery");
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

  test("returns from clarification to edit the original request", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByText("Try a guided buildathon story", { exact: true })
      .click();
    await page.getByRole("button", { name: /Successful checkout/ }).click();
    await page.getByRole("button", { name: "Find my pair" }).click();
    await expect(page.getByLabel("Your answer")).toBeVisible();
    await page.getByRole("button", { name: "Edit original request" }).click();
    await expect(page.getByLabel("Describe your ideal pair")).toHaveValue(
      "Running shoes under ₹4,000",
    );
  });
});

test("runs a separate autonomous buyer through the live merchant APIs", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const correlatedRequests: string[] = [];
  let paymentOrderRequests = 0;
  page.on("request", (outgoing) => {
    const pathname = new URL(outgoing.url()).pathname;
    if (pathname === "/.well-known/ucp" || pathname.startsWith("/v1/")) {
      const correlation = outgoing.headers()["x-request-id"];
      if (correlation !== undefined) correlatedRequests.push(correlation);
    }
    if (pathname === "/v1/payment-orders") paymentOrderRequests += 1;
  });

  await page.goto("/ai-buyer");
  const viewport = page.viewportSize();
  const shellBounds = await page.locator(".autonomous-shell").boundingBox();
  expect(viewport).not.toBeNull();
  expect(shellBounds).not.toBeNull();
  if (viewport !== null && shellBounds !== null) {
    expect(shellBounds.width).toBeGreaterThan(viewport.width * 0.95);
    if (viewport.width > 1100) {
      const heroBounds = await page.locator(".autonomous-hero").boundingBox();
      const layoutBounds = await page
        .locator(".autonomous-layout")
        .boundingBox();
      expect(heroBounds).not.toBeNull();
      expect(layoutBounds).not.toBeNull();
      if (heroBounds !== null && layoutBounds !== null) {
        expect(layoutBounds.x).toBeGreaterThan(heroBounds.x);
        expect(layoutBounds.y).toBeLessThan(viewport.height * 0.35);
      }
    }
  }
  await page
    .getByRole("checkbox", {
      name: /I delegate product and cart preparation/,
    })
    .check();
  await page.getByRole("button", { name: "Run autonomous buyer" }).click();

  await expect(
    page.getByRole("heading", {
      name: "The buyer prepared this exact cart.",
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Signal Red · UK 8")).toBeVisible();
  await expect(page.locator(".buyer-exchange-list > li.completed")).toHaveCount(
    8,
  );
  await expect(page.getByText("No add-on added")).toBeVisible();
  await expect(page.getByText(/append-only server events/)).toBeVisible();

  await page
    .getByRole("button", { name: /Approve .* and create Razorpay order/ })
    .click();
  await expect
    .poll(
      async () =>
        page.url().includes("/checkout/") ||
        page
          .getByText("Fake-provider order prepared successfully.")
          .isVisible(),
      { timeout: 20_000 },
    )
    .toBe(true);
  if (page.url().includes("/checkout/")) {
    await expect(
      page.getByText("AI-prepared cart · human-secured payment"),
    ).toBeVisible();
  } else {
    await expect(
      page.locator(".buyer-exchange-list > li.completed"),
    ).toHaveCount(12);
    await expect(
      page.getByText(/persisted events include the single provider order/),
    ).toBeVisible();
  }

  expect(paymentOrderRequests).toBe(1);
  expect(correlatedRequests.length).toBeGreaterThanOrEqual(12);
  expect(new Set(correlatedRequests).size).toBe(1);
  expect(correlatedRequests[0]).toMatch(/^buyer-[a-f0-9-]+$/u);
});

test("refines an empty search without restarting the journey", async ({
  page,
}) => {
  let continuedConversation = false;
  await page.route("**/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let result: unknown;
    if (pathname === "/v1/conversations") {
      result = {
        conversationId: "conversation-refine",
        kind: "no_results",
        state: "ready",
        intent: {
          merchantId: "stepup-shoes",
          productType: "running",
          maxPricePaise: 250_000,
          currency: "INR",
          sizeUk: 8,
          colour: "Purple",
        },
        message:
          "I couldn’t find an in-stock product that satisfies all of those constraints.",
        recommendations: [],
        notice: "No valid catalogue products matched all hard constraints.",
      };
    } else if (pathname === "/v1/conversations/conversation-refine/messages") {
      continuedConversation = true;
      result = {
        conversationId: "conversation-refine",
        kind: "recommendations",
        state: "recommendations_shown",
        intent: {
          merchantId: "stepup-shoes",
          productType: "running",
          maxPricePaise: 400_000,
          currency: "INR",
          sizeUk: 8,
        },
        message: "Here are the closest in-stock matches.",
        recommendations: [recommendation(1), recommendation(2)],
        notice: "Two alternatives match the updated request.",
      };
    } else {
      return route.fulfill({ status: 404, body: "{}" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });

  await page.goto("/");
  await page
    .getByLabel("Describe your ideal pair")
    .fill("Running shoes under ₹2,500, UK 8, purple");
  await page.getByRole("button", { name: "Find my pair" }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing exact—yet." }),
  ).toBeVisible();
  await page
    .getByLabel("Update this search")
    .fill("Increase the budget to ₹4,000 and show any colour");
  await page.getByRole("button", { name: "Update current search" }).click();
  await expect(page.getByText("Two alternatives match")).toBeVisible();
  expect(continuedConversation).toBe(true);
});

test("starts a clean request when replacing recommendation filters", async ({
  page,
}) => {
  let conversationRequests = 0;
  let continuedConversation = false;
  await page.route("**/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes("/messages")) {
      continuedConversation = true;
      return route.fulfill({ status: 500, body: "{}" });
    }
    if (pathname !== "/v1/conversations")
      return route.fulfill({ status: 404, body: "{}" });

    conversationRequests += 1;
    const exactColour = conversationRequests === 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversationId: `conversation-${String(conversationRequests)}`,
        kind: "recommendations",
        state: "recommendations_shown",
        intent: {
          merchantId: "stepup-shoes",
          productType: "running",
          maxPricePaise: 800_000,
          currency: "INR",
          sizeUk: 8,
          ...(exactColour ? { colour: "Cloud Grey" } : {}),
        },
        message: "I found three catalogue-grounded options.",
        recommendations: [1, 2, 3].map(recommendation),
        notice: exactColour
          ? "Exact Cloud Grey options found in your UK size, within budget and currently in stock."
          : null,
      }),
    });
  });

  await page.goto("/");
  await page
    .getByLabel("Describe your ideal pair")
    .fill("Grey running shoes under ₹8,000 in UK 8");
  await page.getByRole("button", { name: "Find my pair" }).click();
  await expect(
    page.getByRole("heading", { name: "Exact Cloud Grey matches." }),
  ).toBeVisible();

  await page
    .getByLabel("Want something different?")
    .fill("Any shoe under ₹8,000 in UK 8");
  await page.getByRole("button", { name: "Search as new request" }).click();

  await expect(
    page.getByRole("heading", { name: "Three options across your budget." }),
  ).toBeVisible();
  await expect(page.getByText("Any colour")).toBeVisible();
  expect(conversationRequests).toBe(2);
  expect(continuedConversation).toBe(false);
});

test("routes a captured Razorpay callback to the verified receipt", async ({
  page,
}) => {
  let callbackComplete = false;
  const razorpayPayment = (state: "created" | "paid") => ({
    ...payment(state),
    provider: "razorpay",
    providerOrderId: "order_test_demo",
    providerPaymentId: state === "paid" ? "pay_test_demo" : null,
  });

  await page.addInitScript(() => {
    type CheckoutOptions = {
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => void;
    };
    const browserWindow = window as typeof window & {
      Razorpay?: new (options: CheckoutOptions) => { open: () => void };
    };
    browserWindow.Razorpay = class {
      readonly options: CheckoutOptions;

      constructor(options: CheckoutOptions) {
        this.options = options;
      }

      open() {
        this.options.handler({
          razorpay_order_id: "order_test_demo",
          razorpay_payment_id: "pay_test_demo",
          razorpay_signature: "a".repeat(64),
        });
      }
    };
  });

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let result: unknown;
    if (
      request.method() === "GET" &&
      pathname === "/v1/checkouts/attempt-demo"
    ) {
      result = razorpayPayment(callbackComplete ? "paid" : "created");
    } else if (pathname === "/v1/payment-orders") {
      result = {
        payment: razorpayPayment("created"),
        checkout: {
          keyId: "rzp_test_public",
          orderId: "order_test_demo",
          amountPaise: 229_900,
          currency: "INR",
          merchantName: "StepUp Shoes",
          description: "ShopPilot approved cart",
        },
      };
    } else if (pathname === "/v1/payments/callback") {
      callbackComplete = true;
      result = razorpayPayment("paid");
    } else {
      return route.fulfill({ status: 404, body: "{}" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });

  await page.goto("/checkout/attempt-demo");
  await expect(
    page.getByRole("region", { name: "AI buyer handoff" }),
  ).toContainText("Test order created");
  await page
    .getByRole("button", { name: "Open secure Razorpay checkout" })
    .click();
  await expect(page).toHaveURL(/\/checkout\/attempt-demo\/success$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", { name: "Payment successful." }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("order_test_demo")).toBeVisible();
});

test("a closed Razorpay attempt has a clear route back to shopping", async ({
  page,
}) => {
  await page.route("**/v1/checkouts/attempt-demo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...payment("cancelled"),
        provider: "razorpay",
        providerOrderId: "order_test_cancelled",
      }),
    });
  });

  await page.goto("/checkout/attempt-demo");
  await expect(
    page.getByRole("heading", { name: "Checkout closed safely." }),
  ).toBeVisible();
  await expect(page.getByText("No payment was captured.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open secure Razorpay checkout" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Return to StepUp" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("stops polling when a receipt link has expired", async ({ page }) => {
  let requests = 0;
  await page.route("**/v1/checkouts/missing-attempt", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Payment not found." }),
    });
  });

  await page.goto("/checkout/missing-attempt/success");
  await expect(page.getByText("payment link is no longer")).toBeVisible();
  await page.waitForTimeout(2_500);
  expect(requests).toBe(1);
});

test("release rehearsal completes the live failure-recovery story", async ({
  page,
}) => {
  const startedAt = Date.now();
  let orderRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/v1/payment-orders")
      orderRequests += 1;
  });

  await reachPayment(page, "Failure & recovery");
  await page.getByRole("button", { name: "Complete test payment" }).click();
  await expect(
    page.getByRole("heading", { name: "The demo card was declined." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry same payment safely" }).click();
  await expect(
    page.getByRole("heading", { name: /Paid in test mode/ }),
  ).toBeVisible();
  expect(orderRequests).toBe(1);

  await page.getByRole("button", { name: "See how this stayed safe" }).click();
  await expect(
    page.getByRole("dialog", { name: "Every decision, in order" }),
  ).toBeVisible();
  await expect(
    page.getByText("Policy verified approval, stock, price and budget."),
  ).toBeVisible();

  await page.goto("/merchant");
  await expect(
    page.getByRole("heading", { name: "Growth without hidden cart changes." }),
  ).toBeVisible();
  await expect(page.getByText("95 distinct footwear styles")).toBeVisible();
  await expect(page.getByText("Explicitly accepted, then paid")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What deserves attention now" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Best sellers and demand gaps" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Every live footwear style" }),
  ).toBeVisible();

  const discovery = await page.request.get("/.well-known/ucp");
  expect(discovery.ok()).toBe(true);
  const discoveryBody: unknown = await discovery.json();
  expect(discoveryBody).toMatchObject({ ucpConformance: false });
  const openapi = await page.request.get("/openapi.json");
  expect(openapi.ok()).toBe(true);

  expect(Date.now() - startedAt).toBeLessThan(285_000);
});
