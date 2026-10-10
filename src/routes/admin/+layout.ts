/**
 * Admin Route Guard
 *
 * Client-side guard that prevents non-admin users from loading admin pages.
 * Waits for Firebase Auth to initialize, then checks admin status.
 * Redirects non-admins to the home page.
 *
 * Note: This is a defense-in-depth measure. All admin operations are also
 * protected server-side by Firestore rules and API endpoint guards (requireAdmin).
 */

import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";

// Firebase Auth is browser-backed. Disabling SSR ensures direct URL loads run
// this guard in the browser before any admin route can render.
export const ssr = false;

export const load: LayoutLoad = async () => {
  // Only run in browser (SSR has no Firebase auth context)
  if (typeof window === "undefined") {
    return {};
  }

  const { isInitialized, isAdmin, initializeAuthListener } =
    await import("#lib/shared/auth/state/auth-state.svelte.js");

  // On a direct load / hard refresh this guard runs BEFORE the root layout
  // mounts, so nothing has started auth init yet — polling alone would time
  // out and bounce real admins. Kick it off here; the call is memoized, so
  // the root layout's later initialize() reuses the same in-flight promise.
  try {
    await initializeAuthListener();
  } catch {
    // Init failure falls through to the poll + isAdmin check below,
    // which redirects — same outcome as an unauthenticated user.
  }

  // Wait for auth to initialize (the listener callback flips `initialized`
  // once the user's role/claims are resolved)
  if (!isInitialized()) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (isInitialized()) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      // Timeout after 5 seconds - if auth hasn't initialized, reject
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });
  }

  if (!isAdmin()) {
    throw redirect(303, "/");
  }

  return {};
};
