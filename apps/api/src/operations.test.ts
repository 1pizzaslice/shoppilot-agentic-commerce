import { describe, expect, it } from "vitest";

import {
  createJsonLogger,
  ratePolicyFor,
  redactLogValue,
} from "./operations.js";

describe("API operations", () => {
  it("redacts nested credentials, personal fields, and credential-shaped values", () => {
    expect(
      redactLogValue({
        authorization: "Bearer should-never-appear",
        nested: {
          email: "shopper@example.test",
          harmless: "postgresql://user:pass@db.internal/shop",
        },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { email: "[REDACTED]", harmless: "[REDACTED]" },
    });
  });

  it("writes one structured, redacted JSON record", () => {
    let output = "";
    const logger = createJsonLogger(
      { write: (chunk) => ((output += String(chunk)), true) },
      () => new Date("2026-09-04T00:00:00.000Z"),
    );
    logger.log("info", "request_completed", {
      correlationId: "req-1",
      token: "secret-token",
      statusCode: 200,
    });
    expect(JSON.parse(output)).toEqual({
      timestamp: "2026-09-04T00:00:00.000Z",
      level: "info",
      service: "api",
      event: "request_completed",
      correlationId: "req-1",
      token: "[REDACTED]",
      statusCode: 200,
    });
  });

  it("uses separate limits for agent, money, and webhook boundaries", () => {
    expect(ratePolicyFor("POST", "/v1/conversations")?.limit).toBe(20);
    expect(ratePolicyFor("POST", "/v1/checkouts")?.limit).toBe(10);
    expect(ratePolicyFor("POST", "/v1/webhooks/razorpay")?.limit).toBe(120);
    expect(ratePolicyFor("GET", "/v1/checkouts/id")).toBeNull();
  });
});
