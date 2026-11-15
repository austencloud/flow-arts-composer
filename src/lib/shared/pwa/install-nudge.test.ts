import { describe, expect, it } from "vitest";
import {
  chromeIntentUrl,
  resolveInstallRoute,
  safariHidesShareInMoreMenu,
  type InstallEnvironment,
} from "./install-route";
import {
  canAutoShow,
  emptyMemory,
  INSTALL_NUDGE_STORAGE_KEY,
  readMemory,
  QUIET_DAYS_AFTER_DISMISS,
} from "./install-nudge-memory";

const base: InstallEnvironment = {
  platform: "android",
  browser: "chrome",
  inAppBrowser: "none",
  isStandalone: false,
  canPrompt: false,
};

describe("resolveInstallRoute", () => {
  it("offers nothing once the app runs from the home screen", () => {
    expect(
      resolveInstallRoute({ ...base, isStandalone: true, canPrompt: true })
    ).toBe("installed");
  });

  it("sends Instagram's browser out before trusting its Chrome engine", () => {
    // Instagram on Android reports Chrome underneath and can even fire the
    // prompt event, but installing from there never sticks.
    expect(
      resolveInstallRoute({ ...base, inAppBrowser: "instagram", canPrompt: true })
    ).toBe("in-app");
    expect(
      resolveInstallRoute({
        ...base,
        platform: "ios",
        browser: "safari",
        inAppBrowser: "facebook",
      })
    ).toBe("in-app");
  });

  it("uses Chrome's own prompt on a phone when it is available", () => {
    expect(resolveInstallRoute({ ...base, canPrompt: true })).toBe("native");
    expect(resolveInstallRoute(base)).toBe("android-menu");
  });

  it("splits iPhone Safari from other iPhone browsers", () => {
    expect(
      resolveInstallRoute({ ...base, platform: "ios", browser: "safari" })
    ).toBe("ios-safari");
    expect(
      resolveInstallRoute({ ...base, platform: "ios", browser: "chrome" })
    ).toBe("ios-browser");
  });

  it("keeps computers out of the phone card", () => {
    expect(
      resolveInstallRoute({ ...base, platform: "desktop", canPrompt: true })
    ).toBe("desktop");
  });
});

describe("safariHidesShareInMoreMenu", () => {
  it("reads the Safari version, not the frozen iOS number", () => {
    const safari26 =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
    const safari18 =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
    expect(safariHidesShareInMoreMenu(safari26)).toBe(true);
    expect(safariHidesShareInMoreMenu(safari18)).toBe(false);
  });
});

describe("chromeIntentUrl", () => {
  it("keeps the path and query and falls back to the page itself", () => {
    const url = chromeIntentUrl("https://tkaflowarts.com/create?s=abc");
    expect(url).toBe(
      "intent://tkaflowarts.com/create?s=abc#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Ftkaflowarts.com%2Fcreate%3Fs%3Dabc;end"
    );
  });
});

describe("canAutoShow", () => {
  const now = Date.UTC(2026, 10, 13);
  const day = 24 * 60 * 60 * 1000;

  it("shows to a fresh visitor", () => {
    expect(canAutoShow(emptyMemory(), now)).toBe(true);
  });

  it("stays quiet for two weeks after a dismissal, then tries once more", () => {
    const dismissed = { autoShows: 1, lastDismissedAt: now, installedAt: null };
    expect(canAutoShow(dismissed, now + 3 * day)).toBe(false);
    expect(
      canAutoShow(dismissed, now + QUIET_DAYS_AFTER_DISMISS * day + 1)
    ).toBe(true);
  });

  it("gives up after two showings and never returns after an install", () => {
    expect(
      canAutoShow({ autoShows: 2, lastDismissedAt: null, installedAt: null }, now)
    ).toBe(false);
    expect(
      canAutoShow({ autoShows: 0, lastDismissedAt: null, installedAt: now }, now)
    ).toBe(false);
  });

  it("reads damaged storage as a fresh visitor instead of throwing", () => {
    const storage = {
      getItem: (key: string) =>
        key === INSTALL_NUDGE_STORAGE_KEY ? "{not json" : null,
    } as Storage;
    expect(readMemory(storage)).toEqual(emptyMemory());
  });
});
