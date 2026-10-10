import { detectPlatformAndBrowser } from "#lib/shared/mobile/services/platform-detector.js";
import type { Browser, Platform } from "#lib/shared/mobile/services/types.js";

export interface IndexedDbPersistenceEnvironment {
  browser: Browser;
  platform: Platform;
}

/**
 * WebKit can lose its IndexedDB server connection for the rest of a page
 * lifetime. Firebase Auth has a localStorage backend and Firestore has a
 * memory cache, so Apple-browser sessions use those supported backends rather
 * than letting one WebKit process failure break every authenticated request.
 */
export function shouldAvoidIndexedDbPersistence(
  environment: IndexedDbPersistenceEnvironment = detectPlatformAndBrowser()
): boolean {
  return environment.browser === "safari" || environment.platform === "ios";
}
