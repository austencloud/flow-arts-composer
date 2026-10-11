import { describe, it, expect, afterEach, vi } from "vitest";
import { InAppBrowserDetector } from "#lib/shared/auth/services/in-app-browser-detector.js";

// The native shell IS a WebView; the carve-out must suppress detection there so
// the packaged app never shows its own users an "open in browser" prompt.
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

function withUA(ua: string) {
  vi.stubGlobal("navigator", { userAgent: ua, vendor: "" });
}
afterEach(() => vi.unstubAllGlobals());

describe("InAppBrowserDetector — native carve-out", () => {
  it("never flags an in-app browser inside the Capacitor native shell", () => {
    withUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0"
    );
    expect(new InAppBrowserDetector().isInAppBrowser()).toBe(false);
  });

  it("ignores a forced value in the native shell", () => {
    withUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)");
    const d = new InAppBrowserDetector();
    expect(d.getForcedValue(new URLSearchParams("forceIAB=ios"))).toBeNull();
    expect(d.isInAppBrowserOrForced(new URLSearchParams("forceIAB=ios"))).toBe(false);
  });
});
