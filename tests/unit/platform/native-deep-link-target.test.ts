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

  it("opens a shared sequence link in the in-app viewer", () => {
    expect(
      resolveNativeDeepLinkTarget(
        "https://tkaflowarts.com/sequence/G30Q?pane=cards#viewer"
      )
    ).toBe("/browse/gallery?pane=cards&v=G30Q#viewer");
  });

  it("leaves sequence links that carry no short code unchanged", () => {
    const encoded = "https://tkaflowarts.com/sequence/s~abc123xyz";
    expect(resolveNativeDeepLinkTarget(encoded)).toBe("/sequence/s~abc123xyz");
  });

  it("preserves ordinary app links unchanged", () => {
    expect(
      resolveNativeDeepLinkTarget(
        "https://tkaflowarts.com/store/open?code=AB12#viewer"
      )
    ).toBe("/store/open?code=AB12#viewer");
  });

  it("ignores malformed and root URLs", () => {
    expect(resolveNativeDeepLinkTarget("not a URL")).toBeNull();
    expect(resolveNativeDeepLinkTarget("https://tkaflowarts.com/")).toBeNull();
  });
});
