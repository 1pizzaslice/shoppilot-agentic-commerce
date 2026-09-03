import type { ReadinessDependencies } from "@shoppilot/db";
import { makeHealthReport, type HealthReport } from "@shoppilot/domain";

export const checkWorkerReadiness = async (
  readiness: Pick<ReadinessDependencies, "check">,
): Promise<HealthReport> => makeHealthReport("worker", await readiness.check());
