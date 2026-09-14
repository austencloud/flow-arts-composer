import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@tka/domain": "../packages/domain/src/index.ts",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
