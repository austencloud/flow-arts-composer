import { mergeConfig } from "vitest/config";
import regularConfig from "../../config/vitest.config.ts";

// Kept outside the normal test include glob. Invoke only with explicit evidence.
const config = mergeConfig(regularConfig, {
  test: {
    maxWorkers: 1,
    testTimeout: 1_800_000,
  },
});
config.test!.include = ["tests/manual/3d/front-route-census.manual.test.ts"];
export default config;
