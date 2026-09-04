import { describe, expect, it } from "vitest";

import {
  redactAuditMetadata,
  transitionCartState,
  transitionCheckoutState,
} from "./commerce.js";

describe("commerce state machines", () => {
  it("requires cart review before approval and permits mutation invalidation", () => {
    expect(transitionCartState("draft", "review")).toBe("review");
    expect(transitionCartState("review", "approved")).toBe("approved");
    expect(transitionCartState("approved", "draft")).toBe("draft");
    expect(() => transitionCartState("draft", "approved")).toThrow(
      "Invalid cart transition",
    );
  });

  it("does not permit checkout to skip authorization or regress after paid", () => {
    expect(transitionCheckoutState("not_created", "authorized")).toBe(
      "authorized",
    );
    expect(() => transitionCheckoutState("not_created", "created")).toThrow(
      "Invalid checkout transition",
    );
    expect(() => transitionCheckoutState("paid", "failed")).toThrow(
      "Invalid checkout transition",
    );
    expect(transitionCheckoutState("cancelled", "paid")).toBe("paid");
  });
});

describe("audit redaction", () => {
  it("redacts sensitive values without dropping useful decision evidence", () => {
    expect(
      redactAuditMetadata({
        cartVersion: 2,
        reason: "allowed",
        deliveryAddress: "private",
        rawPrompt: "private",
        paymentToken: "private",
      }),
    ).toEqual({
      cartVersion: 2,
      reason: "allowed",
      deliveryAddress: "[REDACTED]",
      rawPrompt: "[REDACTED]",
      paymentToken: "[REDACTED]",
    });
  });
});
