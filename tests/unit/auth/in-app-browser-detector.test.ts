import { describe, it, expect, afterEach, vi } from "vitest";
import { InAppBrowserDetector } from "#lib/shared/auth/services/in-app-browser-detector.js";

// Capacitor.isNativePlatform() is called first in detect(); force it false so
// these UA cases exercise the web-detection path, not the native carve-out.
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

function withUA(ua: string) {
  vi.stubGlobal("navigator", { userAgent: ua, vendor: "" });
}
afterEach(() => vi.unstubAllGlobals());

const IG_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0";
const OPERA_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 OPT/3.3.3 Mobile/15E148";
const IOS26_IG =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0";

describe("InAppBrowserDetector", () => {
  it("flags Instagram iOS", () => {
    withUA(IG_IOS);
    expect(new InAppBrowserDetector().isInAppBrowser()).toBe(true);
  });

  it("does NOT flag Opera for iOS (the deleted generic heuristic's false positive)", () => {
    withUA(OPERA_IOS);
    expect(new InAppBrowserDetector().isInAppBrowser()).toBe(false);
  });

  it("parses iOS major version from the UA", () => {
    withUA(IG_IOS);
    expect(new InAppBrowserDetector().getIosMajorVersion()).toBe(18);
    withUA(IOS26_IG);
    expect(new InAppBrowserDetector().getIosMajorVersion()).toBe(26);
  });

  it("returns null iOS version on a non-iOS UA", () => {
    withUA("Mozilla/5.0 (Linux; Android 13) Instagram 300.0");
    expect(new InAppBrowserDetector().getIosMajorVersion()).toBeNull();
  });

  it("flags the Google iOS app (GSA)", () => {
    withUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 GSA/300.0 Mobile/15E148 Safari/604.1"
    );
    expect(new InAppBrowserDetector().isInAppBrowser()).toBe(true);
  });

  it("treats a touch iPad in desktop mode as iOS (safe: → guide, no error dialog)", () => {
    // iPadOS desktop mode sends a Mac UA with no iOS version. Classifying it as
    // iOS routes it to the iOS guide instead of the generic 'other' path; the
    // version stays null, which is correct — we can't prove 17+, so no scheme.
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15 Instagram 300.0",
      vendor: "",
      maxTouchPoints: 5,
    });
    const d = new InAppBrowserDetector();
    expect(d.getPlatform()).toBe("ios");
  });

  it("a real Mac (no touch) is NOT iOS", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      vendor: "",
      maxTouchPoints: 0,
    });
    expect(new InAppBrowserDetector().getPlatform()).toBe("other");
  });

  it("a forced value yields a typed effective platform on desktop", () => {
    withUA("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537");
    const d = new InAppBrowserDetector();
    expect(d.getEffectivePlatform(new URLSearchParams("forceIAB=ios"))).toBe("ios");
    expect(d.getEffectivePlatform(new URLSearchParams("forceIAB=android"))).toBe("android");
    // A non-platform forced value falls back to real detection.
    expect(d.getEffectivePlatform(new URLSearchParams("forceIAB=true"))).toBe("other");
  });
});
