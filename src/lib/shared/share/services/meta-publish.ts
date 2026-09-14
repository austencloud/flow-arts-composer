/**
 * Client half of Meta auto-posting.
 *
 * Phase 1 of the share sheet hands an artifact to Instagram or Facebook and
 * lets the person finish the post by hand. This is the path where they do not:
 * connect an account once, then post straight from the sheet.
 *
 * Nothing here holds a credential. The popup handshake mirrors the Instagram
 * sign-in flow — start a callable, watch a random state document, complete —
 * and every token stays server side. See
 * docs/superpowers/specs/active/2026-08-09-social-post-handoff-design.md.
 */

import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  getAuthInstance,
  getFirestoreInstance,
  getFunctionsInstance,
} from "$lib/shared/auth/firebase";
import {
  InstagramCapabilitySnapshotSchema,
  type InstagramCapabilitySnapshot,
} from "$lib/shared/share/domain/instagram/instagram-capability-schema";

/**
 * Gates every interactive posting entry point: the connect chips, the post
 * buttons, and the Firestore status listener behind them.
 *
 * Same reasoning as INSTAGRAM_LOGIN_ENABLED in auth-providers.config.ts.
 * Pushing `main` deploys the site but NOT the functions, so a connect chip that
 * reached production before `docs/reference/meta-posting-e2e-checklist.md`
 * passes would open a popup at a callable that is not there.
 *
 * On in dev so the whole sheet is reachable at localhost, off in the build.
 * Connecting will still fail against a project whose functions and secrets are
 * not deployed — that is what the checklist is for — but the UI is testable.
 * Hardcode `true` once review lands.
 */
export const META_POSTING_ENABLED = import.meta.env.DEV;

export type MetaPublishTarget = "instagram" | "facebook-page";
export type MetaPublishMediaType = "image" | "video";

export interface MetaPublishStatus {
  instagram: {
    accountId: string;
    username: string;
    accountType: "BUSINESS" | "CREATOR" | "UNKNOWN";
    route: "instagram-login";
    expiresAtMs: number;
    capabilities: InstagramCapabilitySnapshot | null;
  } | null;
  facebookPage: {
    selectedPageId: string;
    selectedPageName: string;
    pages: Array<{ id: string; name: string }>;
    expiresAtMs: number;
  } | null;
}

export const EMPTY_META_PUBLISH_STATUS: MetaPublishStatus = {
  instagram: null,
  facebookPage: null,
};

export class MetaPublishClientError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? metaErrorMessage(code));
    this.name = "MetaPublishClientError";
  }
}

export function metaErrorMessage(code: string): string {
  switch (code) {
    case "meta/cancelled":
      return "Connection cancelled.";
    case "meta/popup-blocked":
      return "Your browser blocked the Meta window. Allow popups and try again.";
    case "meta/account-required":
      return "Sign in with a full account to post directly.";
    case "meta/account-type-required":
      return "Direct posting needs an Instagram creator or business account. You can still finish the post in Instagram.";
    case "meta/account-type-unverified":
      return "Reconnect Instagram so Flow Arts Composer can verify this professional account.";
    case "meta/account-mismatch":
      return "This connection controls a different Instagram account.";
    case "meta/capabilities-missing":
      return "Reconnect Instagram so Flow Arts Composer can verify what this account supports.";
    case "meta/facebook-capability-required":
      return "Connect Facebook to use this Instagram option.";
    case "meta/review-required":
      return "Review this post for Instagram before publishing.";
    case "meta/app-configuration-mismatch":
      return "Instagram's connection settings need an app update. Trying again will not fix this.";
    case "meta/session-required":
      return "Sign-in is still loading. Try again in a moment.";
    case "meta/no-pages":
      // Meta shares Pages per-authorization, so an empty list far more often
      // means none were ticked in its dialog than that there are none to tick.
      return "No Pages came through. Try again and share all your Pages.";
    case "meta/not-connected":
      return "Connect the account first.";
    case "meta/page-required":
      return "Choose which Page to post to first.";
    case "meta/token-expired":
      return "That connection expired. Reconnect and try again.";
    case "meta/permission-missing":
      return "This account hasn't granted permission to post.";
    case "meta/media-rejected":
      return "Meta wouldn't accept this media.";
    case "meta/rate-limited":
      return "Meta is rate limiting posts. Try again in a few minutes.";
    case "meta/timed-out":
      return "Meta took too long processing the upload.";
    case "meta/not-configured":
      return "Direct posting isn't switched on yet.";
    case "meta/state-expired":
      return "That connection request expired. Try again.";
    default:
      return "Meta couldn't complete that. Try again.";
  }
}

/** Callables surface their reason inside `details`; anything else is generic. */
export function metaErrorCode(error: unknown): string {
  if (error instanceof MetaPublishClientError) return error.code;

  const details = (error as { details?: unknown } | null)?.details;
  if (
    typeof details === "object" &&
    details !== null &&
    "reason" in details &&
    typeof details.reason === "string" &&
    details.reason.startsWith("meta/")
  ) {
    return details.reason;
  }
  return "meta/provider-error";
}

/**
 * Live connection state, straight from the token-free mirror the functions
 * maintain. Returns an unsubscribe; callers own the lifetime.
 */
export function subscribeMetaPublishStatus(
  uid: string,
  onStatus: (status: MetaPublishStatus) => void
): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | undefined;

  void (async () => {
    const firestore = await getFirestoreInstance();
    if (cancelled) return;

    unsubscribe = onSnapshot(
      doc(firestore, "metaPublishStatus", uid),
      (snapshot) => {
        onStatus(
          readMetaPublishStatus(snapshot.exists() ? snapshot.data() : undefined)
        );
      },
      () => onStatus(EMPTY_META_PUBLISH_STATUS)
    );
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export function readMetaPublishStatus(
  data: DocumentData | undefined
): MetaPublishStatus {
  if (!data) return EMPTY_META_PUBLISH_STATUS;

  const instagram = data.instagram;
  const facebookPage = data.facebookPage;
  const capabilityResult = InstagramCapabilitySnapshotSchema.safeParse(
    instagram?.capabilities
  );

  return {
    instagram:
      instagram && typeof instagram.username === "string"
        ? {
            accountId:
              typeof instagram.accountId === "string"
                ? instagram.accountId
                : "",
            username: instagram.username,
            accountType:
              instagram.accountType === "BUSINESS" ||
              instagram.accountType === "CREATOR"
                ? instagram.accountType
                : "UNKNOWN",
            route: "instagram-login",
            expiresAtMs: Number(instagram.expiresAtMs) || 0,
            capabilities: capabilityResult.success
              ? capabilityResult.data
              : null,
          }
        : null,
    facebookPage:
      facebookPage && typeof facebookPage.selectedPageId === "string"
        ? {
            selectedPageId: facebookPage.selectedPageId,
            selectedPageName:
              typeof facebookPage.selectedPageName === "string"
                ? facebookPage.selectedPageName
                : "",
            pages: Array.isArray(facebookPage.pages)
              ? facebookPage.pages.flatMap((page: unknown) =>
                  typeof page === "object" &&
                  page !== null &&
                  typeof (page as { id?: unknown }).id === "string"
                    ? [
                        {
                          id: (page as { id: string }).id,
                          name:
                            typeof (page as { name?: unknown }).name ===
                            "string"
                              ? (page as { name: string }).name
                              : (page as { id: string }).id,
                        },
                      ]
                    : []
                )
              : [],
            expiresAtMs: Number(facebookPage.expiresAtMs) || 0,
          }
        : null,
  };
}

interface StartMetaConnectResponse {
  authorizationUrl: string;
  state: string;
  expiresAtMs: number;
}

type CompleteMetaConnectResponse =
  | { status: "pending" }
  | { status: "error"; errorCode: string }
  | { status: "complete"; target: MetaPublishTarget; accountName: string };

const ALLOWED_AUTHORIZE_ORIGINS = new Set([
  "https://www.instagram.com",
  "https://www.facebook.com",
]);

function openConnectWindow(): Window {
  const width = 560;
  const height = 780;
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
  if (!popup) throw new MetaPublishClientError("meta/popup-blocked");

  try {
    popup.document.title = "Connecting to Meta";
    popup.document.body.textContent = "Opening Meta…";
  } catch {
    // Still usable if the browser denies access to about:blank.
  }
  return popup;
}

/** The popup is sent to whatever URL the function returns, so the shape of
 *  that URL is checked before a window is pointed at it. */
function validateStartResponse(response: StartMetaConnectResponse): void {
  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(response.authorizationUrl);
  } catch {
    throw new MetaPublishClientError("meta/provider-error");
  }

  if (
    !ALLOWED_AUTHORIZE_ORIGINS.has(authorizationUrl.origin) ||
    authorizationUrl.searchParams.get("state") !== response.state ||
    !/^[A-Za-z0-9_-]{43}$/.test(response.state) ||
    !Number.isFinite(response.expiresAtMs)
  ) {
    throw new MetaPublishClientError("meta/provider-error");
  }
}

export function readMetaConnectState(
  data: DocumentData | undefined
):
  | { status: "waiting" }
  | { status: "complete" }
  | { status: "error"; errorCode: string } {
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
          : "meta/provider-error",
    };
  }
  return { status: "waiting" };
}

async function waitForConnectState(
  state: string,
  expiresAtMs: number
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const stateRef = doc(firestore, "metaConnectStates", state);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const timeoutMs = Math.max(1_000, expiresAtMs - Date.now() + 2_000);
    const timeout = window.setTimeout(() => {
      finish(() => reject(new MetaPublishClientError("meta/state-expired")));
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
        const outcome = readMetaConnectState(
          snapshot.exists() ? snapshot.data() : undefined
        );
        if (outcome.status === "complete") finish(resolve);
        if (outcome.status === "error") {
          finish(() => reject(new MetaPublishClientError(outcome.errorCode)));
        }
      },
      () => finish(() => reject(new MetaPublishClientError("meta/network")))
    );
  });
}

/** Opens the consent popup and resolves with the connected account's name. */
/**
 * @param options.reselect Drop the existing grant before opening the dialog,
 *   so Meta asks which Pages to share instead of silently reusing the previous
 *   answer. The only way to reach a Page that was not shared the first time.
 */
export async function connectMetaAccount(
  target: MetaPublishTarget,
  options: { reselect?: boolean } = {}
): Promise<string> {
  if (typeof window === "undefined") {
    throw new MetaPublishClientError("meta/provider-error");
  }
  const auth = await getAuthInstance();
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new MetaPublishClientError("meta/account-required");
  }

  const popup = openConnectWindow();
  try {
    const functions = await getFunctionsInstance();
    const start = httpsCallable<
      { target: MetaPublishTarget; returnOrigin: string; reselect?: boolean },
      StartMetaConnectResponse
    >(functions, "startMetaConnect");
    const started = await start({
      target,
      returnOrigin: window.location.origin,
      reselect: options.reselect === true,
    });
    validateStartResponse(started.data);

    popup.location.replace(started.data.authorizationUrl);
    await waitForConnectState(started.data.state, started.data.expiresAtMs);

    const complete = httpsCallable<
      { state: string },
      CompleteMetaConnectResponse
    >(functions, "completeMetaConnect");
    const completed = (await complete({ state: started.data.state })).data;
    if (completed.status === "error") {
      throw new MetaPublishClientError(completed.errorCode);
    }
    if (completed.status !== "complete") {
      throw new MetaPublishClientError("meta/provider-error");
    }
    return completed.accountName;
  } catch (error) {
    if (error instanceof MetaPublishClientError) throw error;
    throw new MetaPublishClientError(metaErrorCode(error));
  } finally {
    try {
      popup.close();
    } catch {
      // The callback page closes itself; COOP may sever this reference.
    }
  }
}

export async function disconnectMetaAccount(
  target: MetaPublishTarget
): Promise<void> {
  const functions = await getFunctionsInstance();
  const disconnect = httpsCallable<
    { target: MetaPublishTarget },
    { disconnected: boolean }
  >(functions, "disconnectMetaAccount");
  await disconnect({ target });
}

export async function selectFacebookPage(pageId: string): Promise<void> {
  const functions = await getFunctionsInstance();
  const select = httpsCallable<{ pageId: string }, { selected: boolean }>(
    functions,
    "selectMetaFacebookPage"
  );
  await select({ pageId });
}

// ----------------------------------------------------------------- publish

export interface PublishRequest {
  target: MetaPublishTarget;
  mediaType: MetaPublishMediaType;
  /** Public URL Meta will fetch the media from. */
  mediaUrl: string;
  caption: string;
  instagram?: {
    format: "image" | "reel";
    selectedAccountId: string;
    capabilitySnapshotId: string | null;
    shareToFeed: boolean;
    thumbOffsetMs: number | null;
  };
}

export interface PublishResult {
  target: MetaPublishTarget;
  permalink: string | null;
  postId: string;
}

export async function publishToMeta(
  request: PublishRequest
): Promise<PublishResult> {
  const functions = await getFunctionsInstance();
  const publish = httpsCallable<PublishRequest, PublishResult>(
    functions,
    "publishToMeta"
  );
  try {
    return (await publish(request)).data;
  } catch (error) {
    throw new MetaPublishClientError(metaErrorCode(error));
  }
}

/**
 * Instagram accepts JPEG only, and the card renders as a PNG. Converting on
 * the client keeps the server out of image processing entirely — the file that
 * gets uploaded is already the file Instagram will accept.
 */
export async function toInstagramJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === "image/jpeg") return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");
    if (!context) throw new MetaPublishClientError("meta/media-rejected");

    // JPEG has no alpha; without this the transparent card corners composite
    // to black instead of the white Instagram users expect behind a card.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);

    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!jpeg) throw new MetaPublishClientError("meta/media-rejected");
    return jpeg;
  } finally {
    bitmap.close();
  }
}
