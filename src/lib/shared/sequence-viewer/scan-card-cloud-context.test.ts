import { describe, expect, it } from "vitest";
import {
  resolveScanCardCloudPolicy,
  scanCellsAreCloudOnly,
} from "./scan-card-cloud-context";

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

  // A scanner hid the left hand on a phone; every cell threw "Canonical
  // pictograph ... is unavailable" because only the two-hand card is published.
  it("renders cells locally once the scanner hides a hand", () => {
    const scan = resolveScanCardCloudPolicy(true, false);
    const both = {
      handPathMode: false,
      showLeftMotion: true,
      showRightMotion: true,
    };
    expect(scanCellsAreCloudOnly(scan, both)).toBe(true);
    expect(
      scanCellsAreCloudOnly(scan, { ...both, showLeftMotion: false })
    ).toBe(false);
    expect(
      scanCellsAreCloudOnly(scan, { ...both, showRightMotion: false })
    ).toBe(false);
    expect(scanCellsAreCloudOnly(scan, { ...both, handPathMode: true })).toBe(
      false
    );
  });
});
