import { describe, expect, it } from "vitest";

import {
  parseApiEnvironment,
  parseWebEnvironment,
  parseWorkerEnvironment,
} from "./environment.js";

const dependencies = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/shoppilot",
  REDIS_URL: "redis://localhost:6379",
};

describe("environment parsing", () => {
  it("applies safe local defaults", () => {
    const environment = parseApiEnvironment(dependencies);

    expect(environment.RAZORPAY_MODE).toBe("test");
    expect(environment.MODEL_PROVIDER).toBe("fake");
    expect(environment.OPENAI_MODEL).toBe("gpt-5.4-mini");
    expect(environment.API_PORT).toBe(3001);
  });

  it("rejects Razorpay live mode and live key identifiers", () => {
    expect(() =>
      parseWorkerEnvironment({ ...dependencies, RAZORPAY_MODE: "live" }),
    ).toThrow();
    expect(() =>
      parseWorkerEnvironment({
        ...dependencies,
        RAZORPAY_KEY_ID: ["rzp", "live", "do_not_allow"].join("_"),
      }),
    ).toThrow(/test key/);
  });

  it("requires an API key only for the real model provider", () => {
    expect(() =>
      parseWorkerEnvironment({
        ...dependencies,
        MODEL_PROVIDER: "openai",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("validates public web configuration", () => {
    expect(
      parseWebEnvironment({
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001",
      }),
    ).toMatchObject({ WEB_PORT: 3000 });
    expect(() =>
      parseWebEnvironment({ NEXT_PUBLIC_API_BASE_URL: "not-a-url" }),
    ).toThrow();
  });
});
