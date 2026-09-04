import { createHash, randomUUID } from "node:crypto";

import type { FastifyRequest } from "fastify";

import type { RateLimiter } from "@shoppilot/db";

const sensitiveKey =
  /(address|authorization|cookie|email|key|password|phone|prompt|secret|signature|token)/iu;
const sensitiveValuePatterns = [
  /Bearer\s+[^\s]+/giu,
  /(?:postgresql|redis):\/\/[^\s"']+/giu,
  /rzp_(?:live|test)_[A-Za-z0-9]+/gu,
  /sk-(?:proj-)?[A-Za-z0-9_-]{12,}/gu,
];

const redactString = (value: string): string =>
  sensitiveValuePatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  );

export const redactLogValue = (
  value: unknown,
  key = "",
  depth = 0,
): unknown => {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value).slice(0, 500);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => redactLogValue(item, "", depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([entryKey, entryValue]) => [
          entryKey,
          redactLogValue(entryValue, entryKey, depth + 1),
        ]),
    );
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? "[SYMBOL]";
  if (typeof value === "function") return "[FUNCTION]";
  return null;
};

export type LogLevel = "info" | "warn" | "error";

export interface OperationalLogger {
  log: (
    level: LogLevel,
    event: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => void;
}

export const silentLogger: OperationalLogger = { log: () => undefined };

export const createJsonLogger = (
  output: Pick<NodeJS.WritableStream, "write"> = process.stdout,
  now: () => Date = () => new Date(),
): OperationalLogger => ({
  log: (level, event, fields = {}) => {
    const redactedFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        redactLogValue(value, key),
      ]),
    );
    output.write(
      `${JSON.stringify({
        timestamp: now().toISOString(),
        level,
        service: "api",
        event,
        ...redactedFields,
      })}\n`,
    );
  },
});

export interface RequestOperations {
  logger: OperationalLogger;
  rateLimiter: RateLimiter;
  nextCorrelationId?: () => string;
  now?: () => number;
}

export interface RequestOperationalState {
  correlationId: string;
  startedAt: number;
}

const acceptedCorrelationId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

export const correlationIdFor = (
  request: FastifyRequest,
  nextCorrelationId: () => string = randomUUID,
): string => {
  const supplied = request.headers["x-request-id"];
  return typeof supplied === "string" && acceptedCorrelationId.test(supplied)
    ? supplied
    : nextCorrelationId();
};

interface RatePolicy {
  name: string;
  limit: number;
  windowMs: number;
}

export const ratePolicyFor = (
  method: string,
  route: string,
): RatePolicy | null => {
  if (method !== "POST") return null;
  if (route === "/v1/conversations") {
    return { name: "conversation-start", limit: 20, windowMs: 60_000 };
  }
  if (/^\/v1\/conversations\/[^/]+\/messages$/u.test(route)) {
    return { name: "conversation-turn", limit: 60, windowMs: 60_000 };
  }
  if (/^\/v1\/carts\/[^/]+\/approve$/u.test(route)) {
    return { name: "approval", limit: 10, windowMs: 60_000 };
  }
  if (route === "/v1/checkouts" || route === "/v1/payment-orders") {
    return { name: "checkout", limit: 10, windowMs: 60_000 };
  }
  if (route === "/v1/webhooks/razorpay") {
    return { name: "webhook", limit: 120, windowMs: 60_000 };
  }
  return null;
};

export const rateBucketFor = (
  policyName: string,
  request: FastifyRequest,
): string =>
  `${policyName}:${createHash("sha256").update(request.ip).digest("hex").slice(0, 24)}`;
