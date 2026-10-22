import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@vscge/engine": new URL("./packages/engine/src/index.ts", import.meta.url).pathname,
    },
  },
  test: { include: ["packages/*/src/**/*.test.ts", "tests/unit/**/*.test.ts"] },
});
