import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@shoppilot/db": fileURLToPath(
        new URL("./packages/db/src/index.ts", import.meta.url),
      ),
      "@shoppilot/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    fileParallelism: false,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
