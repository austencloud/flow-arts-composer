/**
 * Which way a visitor can put Flow Arts Composer on their home screen.
 *
 * Pure: the caller detects the device (platform-detector.ts) and whether
 * Chrome handed us its install event (mobile-fullscreen-manager.ts), and this
 * picks the path the install card shows.
 */
import type {
  Browser,
  InAppBrowser,
  Platform,
} from "#lib/shared/mobile/services/types.js";

export type InstallRoute =
  /** Already running from the home screen. Nothing to offer. */
  | "installed"
  /** Chrome, Edge or Samsung gave us its install prompt: one tap. */
  | "native"
  /** iPhone Safari: Share, then Add to Home Screen. */
  | "ios-safari"
  /** iPhone Chrome, Firefox or Edge: their own Share button, same steps. */
  | "ios-browser"
  /** Instagram, Facebook and friends can't install. Open a real browser. */
  | "in-app"
  /** Android browser without a prompt (yet): its own menu has Install. */
  | "android-menu"
  /** A computer. The nudge is for phones; desktop keeps the old guide. */
  | "desktop";

export interface InstallEnvironment {
  platform: Platform;
  browser: Browser;
  inAppBrowser: InAppBrowser;
  isStandalone: boolean;
  canPrompt: boolean;
}

export function resolveInstallRoute(env: InstallEnvironment): InstallRoute {
  if (env.isStandalone) return "installed";
  // An in-app browser can report itself as Chrome or Safari underneath, so
  // it is checked before the browser itself.
  if (env.inAppBrowser !== "none" && env.platform !== "desktop") {
    return "in-app";
  }
  if (env.canPrompt) return env.platform === "desktop" ? "desktop" : "native";
  if (env.platform === "ios") {
    return env.browser === "safari" ? "ios-safari" : "ios-browser";
  }
  if (env.platform === "android") return "android-menu";
  return "desktop";
}

/** The card offers itself only on phones still in a browser tab. */
export function isPhoneRoute(route: InstallRoute): boolean {
  return route !== "installed" && route !== "desktop";
}

/**
 * Safari 26 moved Share behind the ⋯ button beside the address bar. Its user
 * agent keeps an old iOS number but carries the Safari version, so read that.
 */
export function safariHidesShareInMoreMenu(userAgent: string): boolean {
  const match = /Version\/(\d+)/.exec(userAgent);
  return match ? Number(match[1]) >= 26 : false;
}

/**
 * Chrome on Android opens an `intent:` link in Chrome itself, which is the one
 * way out of Instagram's or Facebook's browser without copying the link.
 */
export function chromeIntentUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  const scheme = url.protocol.replace(":", "");
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`;
}

/** How analytics names the way the app is running. */
export type DisplayMode = "installed" | "browser";

export function displayModeOf(isStandalone: boolean): DisplayMode {
  return isStandalone ? "installed" : "browser";
}
