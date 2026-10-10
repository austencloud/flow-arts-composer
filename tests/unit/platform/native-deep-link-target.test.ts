import { describe, expect, it } from "vitest";
import { resolveNativeDeepLinkTarget } from "#lib/shared/platform/services/native-deep-link-target.js";

describe("native deep-link targets", () => {
  it("keeps printed-card prop and identity parameters on QR handoff", () => {
    expect(
      resolveNativeDeepLinkTarget(
        "https://tkaflowarts.com/q/CLUB42?bp=club&rp=club&pid=23456789ABCD"
      )
    ).toBe("/browse/gallery?bp=club&rp=club&pid=23456789ABCD&v=CLUB42");
  });

  it("opens the bare short-domain URL encoded in printed QR codes", () => {
    expect(
      resolveNativeDeepLinkTarget(
        "https://tka.run/CLUB42?bp=club&rp=club&pid=23456789ABCD"
      )
    ).toBe("/browse/gallery?bp=club&rp=club&pid=23456789ABCD&v=CLUB42");
  });

  it("preserves ordinary app links unchanged", () => {
    expect(
      resolveNativeDeepLinkTarget(
        "https://tkaflowarts.com/sequence/AB12?sheet=animation#viewer"
      )
    ).toBe("/sequence/AB12?sheet=animation#viewer");
  });

  it("ignores malformed and root URLs", () => {
    expect(resolveNativeDeepLinkTarget("not a URL")).toBeNull();
    expect(resolveNativeDeepLinkTarget("https://tkaflowarts.com/")).toBeNull();
  });
});
