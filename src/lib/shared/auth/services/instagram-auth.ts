import type { User } from "firebase/auth";
import { signInWithCustomToken } from "firebase/auth";
import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  configureAuthPersistence,
  getAuthInstance,
  getFirestoreInstance,
  getFunctionsInstance,
} from "#lib/shared/auth/firebase.js";

export type InstagramAuthIntent = "signin" | "link" | "reauth";

export interface InstagramAuthResult {
  collision: boolean;
  instagramUsername: string | null;
}

interface StartInstagramAuthResponse {
  authorizationUrl: string;
  state: string;
  expiresAtMs: number;
}

type CompleteInstagramAuthResponse =
  | { status: "pending" }
  | { status: "error"; errorCode: string }
  | {
      status: "complete";
      customToken: string;
      collision: boolean;
      instagramUsername: string | null;
    };

type InstagramStateOutcome =
  | { status: "waiting" }
  | { status: "complete" }
  | { status: "error"; errorCode: string };

const KNOWN_ERROR_CODES = new Set([
  "instagram/account-type-required",
  "instagram/already-linked",
  "instagram/cancelled",
  "instagram/invalid-response",
  "instagram/network",
  "instagram/not-configured",
  "instagram/only-method",
  "instagram/origin-not-allowed",
  "instagram/popup-blocked",
  "instagram/provider-error",
  "instagram/reauth-mismatch",
  "instagram/session-required",
  "instagram/state-expired",
  "instagram/state-invalid",
  "instagram/timeout",
  "instagram/unsupported-platform",
]);

export class InstagramAuthError extends Error {
  constructor(
    public readonly code: string,
    message?: string
  ) {
    super(
      message ??
        instagramErrorMessage(code) ??
        "Instagram authorization was cancelled."
    );
    this.name = "InstagramAuthError";
  }
}

export function getInstagramAuthErrorCode(error: unknown): string {
  if (error instanceof InstagramAuthError) return error.code;

  const details = (error as { details?: unknown } | null)?.details;
  const reason =
    typeof details === "object" &&
    details !== null &&
    "reason" in details &&
    typeof details.reason === "string"
      ? details.reason
      : "";
  if (KNOWN_ERROR_CODES.has(reason)) return reason;

  const code = (error as { code?: unknown } | null)?.code;
  if (
    code === "functions/unavailable" ||
    code === "auth/network-request-failed"
  ) {
    return "instagram/network";
  }
  return "instagram/provider-error";
}

function instagramErrorMessage(code: string): string | null {
  switch (code) {
    case "instagram/cancelled":
      return null;
    case "instagram/account-type-required":
      return "Instagram login requires a creator or business account.";
    case "instagram/already-linked":
      return "That Instagram account is connected to another TKA account.";
    case "instagram/only-method":
      return "Add another sign-in method before disconnecting Instagram.";
    case "instagram/popup-blocked":
      return "Your browser blocked the Instagram window. Allow popups for this site and try again.";
    case "instagram/reauth-mismatch":
      return "Use the Instagram account already connected to this TKA account.";
    case "instagram/session-required":
      return "Sign-in is still loading. Try again in a moment.";
    case "instagram/state-expired":
    case "instagram/timeout":
      return "Instagram sign-in expired. Open it again when you're ready.";
    case "instagram/not-configured":
      return "Instagram sign-in is not available yet.";
    case "instagram/unsupported-platform":
      return "Instagram sign-in is not available in the mobile app yet. Open TKA in your browser.";
    case "instagram/network":
      return "Instagram could not connect. Check your connection and try again.";
    default:
      return "Instagram could not complete sign-in. Please try again.";
  }
}

export function getInstagramAuthErrorMessage(error: unknown): string | null {
  return instagramErrorMessage(getInstagramAuthErrorCode(error));
}

export function readInstagramOAuthState(
  data: DocumentData | undefined
): InstagramStateOutcome {
  if (!data || data.status === "pending" || data.status === "processing") {
    return { status: "waiting" };
  }
  if (data.status === "complete") return { status: "complete" };
  if (data.status === "error") {
    return {
      status: "error",
      errorCode:
        typeof data.errorCode === "string"
          ? data.errorCode
          : "instagram/provider-error",
    };
  }
  return { status: "waiting" };
}

function openInstagramWindow(): Window {
  const width = 520;
  const height = 760;
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - width) / 2)
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - height) / 2)
  );
  const popup = window.open(
    "",
    "_blank",
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );
  if (!popup) throw new InstagramAuthError("instagram/popup-blocked");

  try {
    popup.document.title = "Connecting to Instagram";
    popup.document.body.textContent = "Opening Instagram…";
  } catch {
    // The window is still usable if a browser denies access to about:blank.
  }
  return popup;
}

function validateStartResponse(response: StartInstagramAuthResponse): void {
  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(response.authorizationUrl);
  } catch {
    throw new InstagramAuthError("instagram/invalid-response");
  }

  if (
    authorizationUrl.origin !== "https://www.instagram.com" ||
    authorizationUrl.pathname !== "/oauth/authorize" ||
    authorizationUrl.searchParams.get("state") !== response.state ||
    !/^[A-Za-z0-9_-]{43}$/.test(response.state) ||
    !Number.isFinite(response.expiresAtMs)
  ) {
    throw new InstagramAuthError("instagram/invalid-response");
  }
}

async function waitForInstagramState(
  state: string,
  expiresAtMs: number
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const stateRef = doc(firestore, "instagramOAuthStates", state);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const timeoutMs = Math.max(1_000, expiresAtMs - Date.now() + 2_000);
    const timeout = window.setTimeout(() => {
      finish(() => reject(new InstagramAuthError("instagram/timeout")));
    }, timeoutMs);

    function finish(action: () => void): void {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe?.();
      action();
    }

    unsubscribe = onSnapshot(
      stateRef,
      (snapshot) => {
        const outcome = readInstagramOAuthState(
          snapshot.exists() ? snapshot.data() : undefined
        );
        if (outcome.status === "complete") finish(resolve);
        if (outcome.status === "error") {
          finish(() => reject(new InstagramAuthError(outcome.errorCode)));
        }
      },
      () => {
        finish(() => reject(new InstagramAuthError("instagram/network")));
      }
    );
  });
}

async function setReliablePersistence(): Promise<void> {
  const auth = await getAuthInstance();
  await configureAuthPersistence(auth);
}

/** Run the custom Instagram OAuth flow and finish with a Firebase custom token. */
export async function authenticateWithInstagram(
  intent: InstagramAuthIntent
): Promise<InstagramAuthResult> {
  if (typeof window === "undefined") {
    throw new InstagramAuthError("instagram/unsupported-platform");
  }

  const { isNative } =
    await import("#lib/shared/platform/services/platform-detector.js");
  if (isNative()) {
    throw new InstagramAuthError("instagram/unsupported-platform");
  }

  const auth = await getAuthInstance();
  const originalUid = auth.currentUser?.uid;
  if (!originalUid) throw new InstagramAuthError("instagram/session-required");

  const popup = openInstagramWindow();
  try {
    await setReliablePersistence();
    const functions = await getFunctionsInstance();
    const start = httpsCallable<
      { intent: InstagramAuthIntent; returnOrigin: string },
      StartInstagramAuthResponse
    >(functions, "startInstagramAuth");
    const started = await start({
      intent,
      returnOrigin: window.location.origin,
    });
    validateStartResponse(started.data);

    popup.location.replace(started.data.authorizationUrl);
    await waitForInstagramState(started.data.state, started.data.expiresAtMs);

    const complete = httpsCallable<
      { state: string },
      CompleteInstagramAuthResponse
    >(functions, "completeInstagramAuth");
    const completed = (await complete({ state: started.data.state })).data;
    if (completed.status === "error") {
      throw new InstagramAuthError(completed.errorCode);
    }
    if (completed.status !== "complete" || !completed.customToken) {
      throw new InstagramAuthError("instagram/invalid-response");
    }

    const credential = await signInWithCustomToken(auth, completed.customToken);
    if (intent !== "signin" && credential.user.uid !== originalUid) {
      throw new InstagramAuthError("instagram/reauth-mismatch");
    }

    return {
      collision: completed.collision,
      instagramUsername: completed.instagramUsername,
    };
  } catch (error) {
    if (error instanceof InstagramAuthError) throw error;
    throw new InstagramAuthError(getInstagramAuthErrorCode(error));
  } finally {
    try {
      popup.close();
    } catch {
      // The callback page also closes itself; COOP may sever this reference.
    }
  }
}

export async function hasInstagramAccount(
  user: User,
  forceRefresh = false
): Promise<boolean> {
  const token = await user.getIdTokenResult(forceRefresh);
  return token.claims.instagram === true;
}

export async function disconnectInstagramAccount(): Promise<void> {
  const functions = await getFunctionsInstance();
  const unlink = httpsCallable<void, { unlinked: boolean }>(
    functions,
    "unlinkInstagramAuth"
  );
  await unlink();

  const auth = await getAuthInstance();
  await auth.currentUser?.getIdToken(true);
}
