import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";

// These physical acceptance checks retain known failures as lab evidence. They
// run only when explicitly requested and never certify the ordinary test gate.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/experimental/contact-correct/**/*.test.ts"],
  },
});
