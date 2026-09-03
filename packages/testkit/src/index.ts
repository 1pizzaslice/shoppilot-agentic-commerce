export interface DeterministicIdGenerator {
  next: () => string;
}

export const createDeterministicIdGenerator = (
  prefix = "test",
): DeterministicIdGenerator => {
  let sequence = 0;

  return {
    next: () => `${prefix}-${String(++sequence).padStart(4, "0")}`,
  };
};

export const fixedClock = (instant: string): (() => Date) => {
  const timestamp = new Date(instant);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new Error("fixedClock requires an ISO-compatible instant");
  }

  return () => new Date(timestamp);
};
