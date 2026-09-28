/**
 * Fetch wrapper for authenticated first-party endpoints.
 *
 * Attaches the current user's Firebase ID token as a Bearer header. If the
 * server rejects with 401 (stale/expired cached token — the common cause of
 * "Invalid or expired token" flag-toggle rollbacks), it force-refreshes the
 * token once via getIdToken(true) and retries. A second 401 is a genuine
 * auth failure (revoked session, project mismatch) and is returned as-is so
 * callers surface the real reason.
 *
 * getIdToken() returns Firebase's cached token when it believes it's still
 * valid; clock skew or a token minted just before an admin claim change can
 * still fail server verifyIdToken(). The forced-refresh retry closes that gap.
 */
export async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  // Public pages import this helper through the feature-flag admin service.
  // Loading Firebase when a request is made keeps it off their first download.
  const { auth } = await import("../firebase");
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  const withToken = async (forceRefresh: boolean): Promise<Response> => {
    const idToken = await currentUser.getIdToken(forceRefresh);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${idToken}`);
    return fetch(input, { ...init, headers });
  };

  const first = await withToken(false);
  if (first.status !== 401) {
    return first;
  }
  // Stale cached token — force a refresh and retry once.
  return withToken(true);
}
