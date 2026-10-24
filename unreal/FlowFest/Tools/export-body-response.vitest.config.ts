// body response (2026-10-23): the project's Vitest config, running only the sidecar export job.
import base from "../../../tests/config/vitest.config.ts";

export default {
  ...base,
  test: {
    ...base.test,
    include: ["unreal/FlowFest/Tools/export-body-response.job.ts"],
    testTimeout: 600_000,
  },
};
