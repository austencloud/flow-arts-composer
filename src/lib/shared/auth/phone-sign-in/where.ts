/**
 * Where phone sign-in shows itself, and where a computer goes once it is in.
 * Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
 */

import { isApprovePagePath } from "@austencloud/phone-sign-in";

export const PHONE_SIGN_IN_PATH = "/phone-sign-in";

const LOCAL_HOSTS = new Set([
  "localhost",
  "[::1]",
  "::1",
  "dev.tkaflowarts.com",
]);

// 127.0.0.0/8, and the private LAN ranges a phone or a second computer uses to
// reach a copy running on Austen's own machines.
const PRIVATE_IPV4 =
  /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/;

/**
 * True where the sign-in sheet offers "Sign in with your phone": a copy of the
 * app on Austen's own machines, a worktree preview, or dev.tkaflowarts.com.
 * The live site never shows it (he opens the page from a bookmark there), nor
 * does the native app, and neither do the two phone sign-in pages themselves.
 */
export function offersPhoneSignIn(
  location: { hostname: string; pathname: string },
  native: boolean
): boolean {
  if (native) return false;
  if (
    location.pathname === PHONE_SIGN_IN_PATH ||
    isApprovePagePath(location.pathname)
  ) {
    return false;
  }
  const host = location.hostname.toLowerCase();
  return (
    LOCAL_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    PRIVATE_IPV4.test(host)
  );
}

/** The phone sign-in page, set to come back to `here` afterwards. */
export function phoneSignInHref(here: { pathname: string; search: string }) {
  const next = here.pathname + here.search;
  return next === "/"
    ? PHONE_SIGN_IN_PATH
    : `${PHONE_SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Where the computer goes after signing in: the page in `?next=` when it is a
 * path on this site, otherwise the home page. Anyone can put `next` in a link,
 * so a value that leaves the site, even only once the browser decodes or
 * cleans it up, falls back to home.
 */
export function pathAfterPhoneSignIn(search: {
  get(name: string): string | null;
}): string {
  const next = search.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  const base = "https://flow-arts.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return "/";
  }
  if (url.origin !== base || url.pathname === PHONE_SIGN_IN_PATH) return "/";
  return url.pathname + url.search + url.hash;
}
