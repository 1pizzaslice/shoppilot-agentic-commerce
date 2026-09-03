import { z } from "zod";

export const dependencyStatusSchema = z.object({
  name: z.enum(["postgres", "redis"]),
  status: z.enum(["up", "down"]),
});

export const healthReportSchema = z.object({
  service: z.enum(["api", "web", "worker"]),
  status: z.enum(["ready", "degraded"]),
  dependencies: z.array(dependencyStatusSchema).max(2),
});

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type HealthReport = z.infer<typeof healthReportSchema>;

export const makeHealthReport = (
  service: HealthReport["service"],
  dependencies: readonly DependencyStatus[] = [],
): HealthReport =>
  healthReportSchema.parse({
    service,
    status: dependencies.every((dependency) => dependency.status === "up")
      ? "ready"
      : "degraded",
    dependencies,
  });
