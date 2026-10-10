import { describe, it, expect } from "vitest";
import {
  buildAppBridgePath,
  resolveEscapeTarget,
  safeInternalPath,
} from "#lib/shared/auth/services/escape-target.js";

const base = { currentUrl: "https://tkaflowarts.com/create/construct" };

describe("resolveEscapeTarget", () => {
  it("android pre-launch → browser intent, browser label", () => {
    const t = resolveEscapeTarget({
      ...base,
      platform: "android",
      iosMajorVersion: null,
      appLaunched: false,
    });
    expect(t.method).toBe("android_intent");
    expect(t.isAppTarget).toBe(false);
    expect(t.url).toContain("intent://");
    expect(t.url).toContain("scheme=https");
    expect(t.url).not.toContain("package=");
    expect(t.label).toBe("Open in browser");
  });

  it("android post-launch → app intent with package + play-store fallback", () => {
    const t = resolveEscapeTarget({
      ...base,
      platform: "android",
      iosMajorVersion: null,
      appLaunched: true,
    });
    expect(t.method).toBe("android_intent");
    expect(t.isAppTarget).toBe(true);
    expect(t.url).toContain("package=com.tkaflowarts.composer");
    expect(t.url).toContain("S.browser_fallback_url=");
    expect(t.label).toBe("Open in the app");
  });

  it("ios 17+ → x-safari-https scheme, Safari label", () => {
    const t = resolveEscapeTarget({
      ...base,
      platform: "ios",
      iosMajorVersion: 18,
      appLaunched: false,
    });
    expect(t.method).toBe("ios_scheme");
    expect(t.url).toBe("x-safari-https://tkaflowarts.com/create/construct");
    expect(t.label).toBe("Open in Safari");
  });

  it("ios 16 → instructions only, NO scheme fired (avoids invalid-page dialog)", () => {
    const t = resolveEscapeTarget({
      ...base,
      platform: "ios",
      iosMajorVersion: 16,
      appLaunched: false,
    });
    expect(t.method).toBe("ios_instructions");
    expect(t.url).toBeNull();
  });

  it("ios unknown version → instructions only", () => {
    const t = resolveEscapeTarget({
      ...base,
      platform: "ios",
      iosMajorVersion: null,
      appLaunched: false,
    });
    expect(t.method).toBe("ios_instructions");
    expect(t.url).toBeNull();
  });

  it("other platform → generic instructions, no scheme", () => {
    const t = resolveEscapeTarget({
      ...base,
      platform: "other",
      iosMajorVersion: null,
      appLaunched: false,
    });
    expect(t.method).toBe("generic_instructions");
    expect(t.url).toBeNull();
  });
});

describe("resolveEscapeTarget — boundaries", () => {
  const hashUrl = "https://tkaflowarts.com/glossary?x=1#term";

  it("android intent data URI never contains the page hash (it breaks #Intent)", () => {
    const t = resolveEscapeTarget({
      platform: "android",
      iosMajorVersion: null,
      appLaunched: false,
      currentUrl: hashUrl,
    });
    const dataPart = t.url!.split("#Intent")[0]; // everything before the intent block
    expect(dataPart).not.toContain("#term");
    expect(t.url).toContain("#Intent;");
    // full url (hash included) survives in the fallback
    expect(decodeURIComponent(t.url!)).toContain("#term");
  });

  it("ios scheme preserves query and hash", () => {
    const t = resolveEscapeTarget({
      platform: "ios",
      iosMajorVersion: 18,
      appLaunched: false,
      currentUrl: hashUrl,
    });
    expect(t.url).toBe("x-safari-https://tkaflowarts.com/glossary?x=1#term");
  });

  it("non-HTTPS url → instruction-only target, never a fired url", () => {
    for (const platform of ["ios", "android"] as const) {
      const t = resolveEscapeTarget({
        platform,
        iosMajorVersion: 18,
        appLaunched: false,
        currentUrl: "http://tkaflowarts.com/create",
      });
      expect(t.url).toBeNull();
      expect(t.method).toMatch(/instructions$/);
    }
  });

  it("malformed url → instruction-only target, does not throw", () => {
    expect(() =>
      resolveEscapeTarget({
        platform: "android",
        iosMajorVersion: null,
        appLaunched: false,
        currentUrl: "not a url",
      })
    ).not.toThrow();
    const t = resolveEscapeTarget({
      platform: "android",
      iosMajorVersion: null,
      appLaunched: false,
      currentUrl: "not a url",
    });
    expect(t.url).toBeNull();
  });

  it("pre-launch android label says browser, not Chrome", () => {
    const t = resolveEscapeTarget({
      platform: "android",
      iosMajorVersion: null,
      appLaunched: false,
      currentUrl: "https://tkaflowarts.com/x",
    });
    expect(t.label).toBe("Open in browser");
  });

  it("android app-target on the scan route uses the directly claimed path", () => {
    const t = resolveEscapeTarget({
      platform: "android",
      iosMajorVersion: null,
      appLaunched: true,
      currentUrl: "https://tkaflowarts.com/q/ABCD",
    });
    const dataPart = t.url!.split("#Intent")[0];
    expect(dataPart).toContain("/q/ABCD");
    expect(dataPart).not.toContain("/store/open?to=");
  });

  it("android app-target on an UNcovered route bridges through /store/open", () => {
    const t = resolveEscapeTarget({
      platform: "android",
      iosMajorVersion: null,
      appLaunched: true,
      currentUrl: "https://tkaflowarts.com/create/construct?x=1",
    });
    const dataPart = t.url!.split("#Intent")[0];
    // The app doesn't App-Link /create, so it routes through a claimed bridge
    // path carrying the real destination.
    expect(dataPart).toContain("/store/open?to=");
    expect(decodeURIComponent(dataPart)).toContain("/create/construct?x=1");
  });

  it("ios appLaunched=true surfaces an App Store action", () => {
    const t = resolveEscapeTarget({
      platform: "ios",
      iosMajorVersion: 18,
      appLaunched: true,
      currentUrl: "https://tkaflowarts.com/create",
      appStoreUrl: "https://apps.apple.com/app/id123",
    });
    expect(t.isAppTarget).toBe(true);
    expect(t.appStoreUrl).toBe("https://apps.apple.com/app/id123");
  });
});

describe("safeInternalPath (bridge open-redirect guard)", () => {
  it("passes a normal internal path with query and hash", () => {
    expect(safeInternalPath("/create/construct?x=1#t")).toBe(
      "/create/construct?x=1#t"
    );
  });
  it("passes the bare root", () => {
    expect(safeInternalPath("/")).toBe("/");
  });
  it("rejects protocol-relative //evil.com", () => {
    expect(safeInternalPath("//evil.com")).toBe("/");
  });
  it("rejects backslash-relative path", () => {
    expect(safeInternalPath("/\\evil.com")).toBe("/");
  });
  it("rejects an absolute external url", () => {
    expect(safeInternalPath("https://evil.com")).toBe("/");
  });
  it("rejects a relative path with no leading slash", () => {
    expect(safeInternalPath("create/construct")).toBe("/");
  });
  it("falls back to root on null/empty", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
  });
});

describe("buildAppBridgePath", () => {
  it("carries an internal destination through the claimed app route", () => {
    const bridge = buildAppBridgePath("/browse/gallery?v=ABCD&bp=club&rp=club");
    expect(bridge).toBe(
      "/store/open?to=%2Fbrowse%2Fgallery%3Fv%3DABCD%26bp%3Dclub%26rp%3Dclub"
    );
  });

  it("does not carry an external destination", () => {
    expect(buildAppBridgePath("https://evil.example")).toBe(
      "/store/open?to=%2F"
    );
  });
});
