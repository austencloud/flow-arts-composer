import { describe, expect, it } from "vitest";
import { resolveScanCardCloudPolicy } from "./scan-card-cloud-context";

describe("scan card cloud policy", () => {
  it("probes canonical cells but permits local recovery for shop demos", () => {
    expect(resolveScanCardCloudPolicy(true, true)).toEqual({
      probeCloud: true,
      cloudOnly: false,
    });
  });

  it("keeps real scans cloud-only", () => {
    expect(resolveScanCardCloudPolicy(true, false)).toEqual({
      probeCloud: true,
      cloudOnly: true,
    });
  });

  it("does not enable cloud resolution for ordinary viewer cards", () => {
    expect(resolveScanCardCloudPolicy(false, true)).toEqual({
      probeCloud: false,
      cloudOnly: false,
    });
  });
});
