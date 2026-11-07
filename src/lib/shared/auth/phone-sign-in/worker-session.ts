/**
 * The phone's signed-in session, read from the service worker so a sign-in
 * notification's tap and Deny work with no page open and without the Firebase
 * SDK in the worker, which every visitor's browser downloads. Firebase keeps the
 * session in this origin's IndexedDB, which the worker shares with the pages, so
 * it is the same account the approve page would use.
 *
 * Read-only: a token minted here is used and dropped, never written back, so the
 * pages' Firebase stays the only writer of its own record. Safari keeps the
 * session in localStorage, which a worker cannot read. There this finds no user
 * and the tap opens the review page.
 */

import type { ApiFetch } from "@austencloud/phone-sign-in/client";

const TOKEN_ENDPOINT = "https://securetoken.googleapis.com/v1/token";
/** A saved token this close to expiry could lapse on its way to the server. */
const MINIMUM_TOKEN_LIFE_MS = 60 * 1000;

/** One record from Firebase's store: its key, and the saved user. */
export interface SavedUserRecord {
  key: string;
  value: unknown;
}

interface SavedUser {
  uid: string;
  apiKey: string;
  accessToken: string | null;
  refreshToken: string;
  expirationTime: number;
}

export interface WorkerSessionDeps {
  readUsers: () => Promise<SavedUserRecord[]>;
  fetch?: typeof fetch;
  now?: () => number;
}

/** The record's key is "firebase:authUser:<apiKey>:<appName>". */
function apiKeyFromRecordKey(key: string): string | null {
  return key.split(":")[2] || null;
}

function savedUser(record: SavedUserRecord): SavedUser | null {
  const value = record.value as {
    uid?: unknown;
    isAnonymous?: unknown;
    apiKey?: unknown;
    stsTokenManager?: {
      accessToken?: unknown;
      refreshToken?: unknown;
      expirationTime?: unknown;
    };
  } | null;
  const tokens = value?.stsTokenManager;
  const apiKey =
    typeof value?.apiKey === "string"
      ? value.apiKey
      : apiKeyFromRecordKey(record.key);
  if (
    !value ||
    value.isAnonymous === true ||
    typeof value.uid !== "string" ||
    !apiKey ||
    typeof tokens?.refreshToken !== "string"
  ) {
    return null;
  }
  return {
    uid: value.uid,
    apiKey,
    accessToken:
      typeof tokens.accessToken === "string" ? tokens.accessToken : null,
    refreshToken: tokens.refreshToken,
    expirationTime:
      typeof tokens.expirationTime === "number" ? tokens.expirationTime : 0,
  };
}

export function createWorkerSession(deps: WorkerSessionDeps) {
  const send: typeof fetch = deps.fetch ?? ((...args) => fetch(...args));
  const now = deps.now ?? Date.now;

  async function currentUser(): Promise<SavedUser | null> {
    const users = (await deps.readUsers())
      .map(savedUser)
      .filter((user): user is SavedUser => user !== null);
    // Normally one. If more, the one Firebase refreshed last.
    return users.reduce<SavedUser | null>(
      (latest, user) =>
        !latest || user.expirationTime > latest.expirationTime ? user : latest,
      null
    );
  }

  async function mintToken(user: SavedUser): Promise<string> {
    const response = await send(
      `${TOKEN_ENDPOINT}?key=${encodeURIComponent(user.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: user.refreshToken,
        }).toString(),
      }
    );
    if (!response.ok) {
      throw new Error(`Token exchange answered ${response.status}`);
    }
    const answer = (await response.json()) as { id_token?: unknown };
    if (typeof answer.id_token !== "string") {
      throw new Error("Token exchange gave no token");
    }
    return answer.id_token;
  }

  // Approving needs a token minted within the last five minutes, which a saved
  // token's remaining life says nothing about, so forceRefresh always mints.
  async function idToken(
    user: SavedUser,
    forceRefresh: boolean
  ): Promise<string> {
    const saved =
      !forceRefresh &&
      user.accessToken &&
      user.expirationTime - now() > MINIMUM_TOKEN_LIFE_MS
        ? user.accessToken
        : null;
    return saved ?? mintToken(user);
  }

  return {
    /** The account signed in on this phone, or null when none is. */
    async uid(): Promise<string | null> {
      return (await currentUser())?.uid ?? null;
    },

    /** fetch with the signed-in account's ID token, as the app's apiFetch does. */
    apiFetch: (async (url, init, options) => {
      const user = await currentUser();
      const headers = new Headers(init?.headers);
      if (user) {
        const token = await idToken(user, options?.forceRefresh ?? false);
        headers.set("Authorization", `Bearer ${token}`);
      }
      return send(url, { ...init, headers });
    }) as ApiFetch,
  };
}
