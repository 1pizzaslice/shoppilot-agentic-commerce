import { z } from "zod";

const emptyStringToUndefined = (value: unknown): unknown =>
  value === "" ? undefined : value;

const optionalSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
);

const port = (fallback: number) =>
  z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1).max(65_535).default(fallback),
  );

const commonEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    RAZORPAY_MODE: z.literal("test").default("test"),
    RAZORPAY_KEY_ID: optionalSecret,
    RAZORPAY_KEY_SECRET: optionalSecret,
    RAZORPAY_WEBHOOK_SECRET: optionalSecret,
    PAYMENT_PROVIDER: z.enum(["fake", "razorpay"]).default("fake"),
    MODEL_PROVIDER: z.enum(["fake", "anthropic"]).default("fake"),
    ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
    ANTHROPIC_API_KEY: optionalSecret,
  })
  .superRefine((environment, context) => {
    if (
      environment.RAZORPAY_KEY_ID !== undefined &&
      !environment.RAZORPAY_KEY_ID.startsWith("rzp_test_")
    ) {
      context.addIssue({
        code: "custom",
        message: "RAZORPAY_KEY_ID must be a Razorpay test key",
        path: ["RAZORPAY_KEY_ID"],
      });
    }

    if (
      environment.PAYMENT_PROVIDER === "razorpay" &&
      (environment.RAZORPAY_KEY_ID === undefined ||
        environment.RAZORPAY_KEY_SECRET === undefined ||
        environment.RAZORPAY_WEBHOOK_SECRET === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Razorpay test key ID, key secret, and webhook secret are required when PAYMENT_PROVIDER=razorpay",
        path: ["PAYMENT_PROVIDER"],
      });
    }

    if (
      environment.MODEL_PROVIDER === "anthropic" &&
      environment.ANTHROPIC_API_KEY === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic",
        path: ["ANTHROPIC_API_KEY"],
      });
    }
  });

const dependencyEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  REDIS_URL: z.string().url().startsWith("redis://"),
});

const apiEnvironmentSchema = z.intersection(
  commonEnvironmentSchema,
  dependencyEnvironmentSchema.extend({
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: port(3001),
  }),
);

const workerEnvironmentSchema = z.intersection(
  commonEnvironmentSchema,
  dependencyEnvironmentSchema,
);

const webEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3001"),
  WEB_HOST: z.string().min(1).default("127.0.0.1"),
  WEB_PORT: port(3000),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const parseApiEnvironment = (
  source: NodeJS.ProcessEnv,
): ApiEnvironment => apiEnvironmentSchema.parse(source);

export const parseWebEnvironment = (
  source: NodeJS.ProcessEnv,
): WebEnvironment => webEnvironmentSchema.parse(source);

export const parseWorkerEnvironment = (
  source: NodeJS.ProcessEnv,
): WorkerEnvironment => workerEnvironmentSchema.parse(source);
