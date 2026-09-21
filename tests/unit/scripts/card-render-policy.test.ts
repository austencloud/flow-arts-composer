import { describe, expect, it } from "vitest";
import {
  changedCardPolicyFiles,
  needsCardPolicyApproval,
} from "../../../scripts/card-render-policy.mjs";

describe("card rendering policy approval", () => {
  it("requires review when changing the oracle, release gate, or approval gate itself", () => {
    for (const path of [
      "tests/render-parity/card-parity-metrics.ts",
      "tests/render-parity/card-parity-cases.ts",
      "tests/render-parity/baselines/start.png",
      "mcp-server-pkg/scripts/release-package.mjs",
      ".github/workflows/card-render-policy-review.yml",
      "scripts/card-render-policy.mjs",
    ])
      expect(needsCardPolicyApproval(path)).toBe(true);
    expect(
      needsCardPolicyApproval(
        "src/lib/shared/render/services/image-composer.ts"
      )
    ).toBe(false);
  });
  it("cannot evade approval by moving a protected file elsewhere", () => {
    expect(
      changedCardPolicyFiles([
        {
          filename: "unprotected.ts",
          previous_filename: "tests/render-parity/card-parity-metrics.ts",
        },
      ])
    ).toEqual(["tests/render-parity/card-parity-metrics.ts"]);
  });
});
