import * as env from "$app/env/public";
import { dev } from "$app/env";

/** Only localhost / dev hosts may honor the ?appLaunched override. SSR-safe. */
function nonProdHost(): boolean {
  if (typeof window === "undefined") return false;
  return /^(localhost|127\.0\.0\.1|dev\d?\.)/.test(window.location.hostname);
}

/**
 * Whether the native app is live in the stores.
 *
 * The whole app-forward escape path flips on this one value, so store-launch is
 * an env change, not a code change: set PUBLIC_APP_LAUNCHED=1 and the escape
 * resolver starts routing to the app instead of the browser. Dynamic env (not
 * static) so an unset flag reads as undefined at runtime rather than breaking
 * the build. `?appLaunched=1` overrides it only off production — a shared link
 * carrying the flag must not route real visitors to an unbuilt app/store path.
 */
export function isAppLaunched(searchParams?: URLSearchParams): boolean {
  if ((dev || nonProdHost()) && searchParams?.get("appLaunched") === "1") {
    return true;
  }
  const flag = env.PUBLIC_APP_LAUNCHED;
  return flag === "1" || flag === "true";
}

/**
 * Strip the test-only params so a copied or escaped link can't redistribute
 * them — a link with ?forceIAB opened in real Safari would otherwise re-trigger
 * forced detection in a perfectly capable browser.
 */
export function stripEscapeTestParams(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.delete("forceIAB");
    u.searchParams.delete("appLaunched");
    return u.href;
  } catch {
    return href;
  }
}

export function appStoreUrl(): string | undefined {
  return env.PUBLIC_APP_STORE_URL || undefined;
}

export function playStoreUrl(): string | undefined {
  return env.PUBLIC_PLAY_STORE_URL || undefined;
}
