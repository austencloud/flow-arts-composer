/**
 * Detects in-app browsers — Instagram, Messenger, TikTok, and friends — so the
 * app can say which parts of sign-in work here and which do not.
 *
 * This file used to justify itself with "these webviews partition
 * sessionStorage, breaking Firebase's signInWithRedirect." That justification
 * described code the app does not contain: a repo-wide search for
 * signInWithRedirect finds nothing but that sentence. Sign-in runs through
 * signInWithPopup and signInAnonymously, and the thing that actually fails in a
 * webview is the OAuth popup, which Google rejects server-side with
 * 403 disallowed_useragent. Guest identity, construct/assemble/generate, and
 * email-link sign-in all work in here.
 *
 * So detection feeds a dismissible banner and a click-time interception on the
 * two provider buttons. It must never gate page load again — a real visitor
 * from an Instagram DM was told sign-in was impossible while sitting on a page
 * he could have used as a guest.
 *
 * Design: docs/archive/swarm-2026-10-14/architecture/in-app-browser-path.md
 */

import { Capacitor } from "@capacitor/core";
import { resolveEscapeTarget, type EscapeTarget } from "./escape-target";
import {
  isAppLaunched,
  playStoreUrl,
  appStoreUrl,
  stripEscapeTestParams,
} from "../config/app-availability";

interface BrowserPattern {
  pattern: RegExp;
  name: string;
}

const IN_APP_BROWSER_PATTERNS: BrowserPattern[] = [
  // Meta platforms
  { pattern: /FBAN|FBAV/i, name: "Facebook" },
  { pattern: /FB_IAB/i, name: "Facebook" },
  { pattern: /Messenger/i, name: "Messenger" },
  { pattern: /Instagram/i, name: "Instagram" },

  // Google's own iOS app embeds a webview that Google's OAuth policy blocks the
  // same way; without this it reads as a normal browser and a provider tap dies
  // at disallowed_useragent with no escape offered.
  { pattern: /GSA\//i, name: "Google App" },

  // Other social apps
  { pattern: /Twitter/i, name: "Twitter" },
  { pattern: /Line\//i, name: "Line" },
  { pattern: /KAKAOTALK/i, name: "KakaoTalk" },
  { pattern: /Snapchat/i, name: "Snapchat" },
  { pattern: /TikTok/i, name: "TikTok" },
  { pattern: /BytedanceWebview/i, name: "TikTok" },
  { pattern: /WeChat|MicroMessenger/i, name: "WeChat" },
  { pattern: /Telegram/i, name: "Telegram" },
  { pattern: /Discord/i, name: "Discord" },
  { pattern: /Slack/i, name: "Slack" },

  // Generic webview indicators
  { pattern: /\bwv\b/i, name: "WebView" },
  { pattern: /WebView/i, name: "WebView" },
];

export type InAppBrowserPlatform = "ios" | "android" | "other";

export class InAppBrowserDetector {
  private cachedResult: { isInApp: boolean; name: string | null } | null = null;

  isInAppBrowser(): boolean {
    return this.detect().isInApp;
  }

  /** Which escape hatch applies. Android gets a scheme; iOS gets instructions. */
  getPlatform(): InAppBrowserPlatform {
    if (this.isAndroid()) return "android";
    if (this.isIOS()) return "ios";
    return "other";
  }

  /**
   * The ?forceIAB test hook, resolved here rather than at each call site.
   *
   * It has to sit BEHIND the same native short-circuit detect() applies, not be
   * OR'd on after it. Android App Links claim https://tkaflowarts.com/q/*,
   * /sequence/*, and /store/* with autoVerify (AndroidManifest.xml), and the
   * native deep-link target preserves the query while resolving the destination.
   * A claimed link carrying ?forceIAB therefore opens the packaged app with the
   * param intact. Read naively, the app then tells its own users that
   * Google sign-in is blocked here and returns before ever calling
   * signInWithGoogle(), which is a dead button rather than merely wrong copy.
   * Four call sites each re-deriving this is four chances to forget the check.
   */
  getForcedValue(searchParams?: Pick<URLSearchParams, "get">): string | null {
    if (Capacitor.isNativePlatform()) return null;
    return searchParams?.get("forceIAB") ?? null;
  }

  /** Real detection, plus the test hook. The only form call sites should use. */
  isInAppBrowserOrForced(searchParams?: Pick<URLSearchParams, "get">): boolean {
    return this.isInAppBrowser() || this.getForcedValue(searchParams) !== null;
  }

  /**
   * The platform to resolve escapes against, honoring ?forceIAB=ios|android so
   * the test matrix actually exercises those paths on a desktop. A forced value
   * that isn't a platform (true/false) falls back to real detection.
   */
  getEffectivePlatform(
    searchParams?: Pick<URLSearchParams, "get">
  ): InAppBrowserPlatform {
    const forced = this.getForcedValue(searchParams);
    if (forced === "ios" || forced === "android") return forced;
    return this.getPlatform();
  }

  private detect(): { isInApp: boolean; name: string | null } {
    if (this.cachedResult) {
      return this.cachedResult;
    }

    if (typeof navigator === "undefined") {
      this.cachedResult = { isInApp: false, name: null };
      return this.cachedResult;
    }

    // The Capacitor native shell IS a WebView (its UA contains "; wv)"), but
    // it's our own app, not a hostile in-app browser: sign-in runs through the
    // native Firebase plugin there, so the "open in Chrome" prompt must never
    // fire.
    if (Capacitor.isNativePlatform()) {
      this.cachedResult = { isInApp: false, name: null };
      return this.cachedResult;
    }

    const ua = navigator.userAgent || "";
    const vendor = (navigator as { vendor?: string }).vendor || "";
    const combined = `${ua} ${vendor}`;

    // Named apps only. There used to be a last-resort "iOS UA with no Safari
    // token" heuristic here, but that flagged real browsers that drop the
    // vestigial token (Opera for iOS ships OPT/ with no Safari/), and the whole
    // point of detection is to never lie to a capable browser. A named match
    // cannot false-positive; an unnamed webview simply isn't handled, which is
    // the safe direction — the visitor gets the full app, no escape chrome.
    for (const { pattern, name } of IN_APP_BROWSER_PATTERNS) {
      if (pattern.test(combined)) {
        this.cachedResult = { isInApp: true, name };
        return this.cachedResult;
      }
    }

    this.cachedResult = { isInApp: false, name: null };
    return this.cachedResult;
  }

  /** iOS major version parsed from the UA, or null when not iOS / unparseable. */
  getIosMajorVersion(): number | null {
    if (typeof navigator === "undefined") return null;
    // "CPU iPhone OS 18_7 like Mac OS X", or "CPU OS 26_5" on iPad.
    const match = navigator.userAgent.match(/OS (\d+)[_.]/);
    return this.isIOS() && match ? Number(match[1]) : null;
  }

  /**
   * The escape action for this environment, composed from the detector's own
   * signals plus the launch flag. One call so every escape surface stays in
   * lockstep and nothing hardcodes a browser-vs-app decision.
   */
  getEscapeTarget(searchParams?: Pick<URLSearchParams, "get">): EscapeTarget {
    return resolveEscapeTarget({
      platform: this.getEffectivePlatform(searchParams),
      iosMajorVersion: this.getIosMajorVersion(),
      appLaunched: isAppLaunched(searchParams),
      // Strip test params so the fired escape URL can't carry ?forceIAB into a
      // real browser and re-trigger forced detection there.
      currentUrl:
        typeof window !== "undefined"
          ? stripEscapeTestParams(window.location.href)
          : "",
      playStoreUrl: playStoreUrl(),
      appStoreUrl: appStoreUrl(),
    });
  }

  private isAndroid(): boolean {
    if (typeof navigator === "undefined") return false;
    return /Android/i.test(navigator.userAgent);
  }

  private isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    // iPadOS 13+ desktop mode sends a Mac UA; touch points disambiguate it from
    // a real Mac, which reports maxTouchPoints 0. Such an iPad has no iOS
    // version in its UA, so getIosMajorVersion stays null and the resolver hands
    // back the safe iOS guide rather than firing a scheme it can't vouch for.
    const nav = navigator as Navigator & { maxTouchPoints?: number };
    return (
      /Macintosh/i.test(navigator.userAgent) && (nav.maxTouchPoints ?? 0) > 1
    );
  }
}
