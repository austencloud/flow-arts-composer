/**
 * Meta publishing policy — every decision the publish path makes that does not
 * need the network.
 *
 * Kept pure so the rules that actually bite in production (a caption Meta will
 * reject, a container status that means "keep waiting" versus "give up", a
 * media URL Meta must never be asked to fetch) are unit-testable without a
 * Graph API credential.
 *
 * Phase 2 of docs/superpowers/specs/active/2026-08-09-social-post-handoff-design.md.
 */

export type MetaPublishTarget = "instagram" | "facebook-page";
export type MetaPublishMediaType = "image" | "video";

export type MetaPublishFailureCode =
  | "meta/not-connected"
  /** Connected, but administers several Pages and none has been chosen. */
  | "meta/page-required"
  | "meta/token-expired"
  | "meta/account-mismatch"
  | "meta/account-type-required"
  | "meta/account-type-unverified"
  | "meta/facebook-capability-required"
  | "meta/permission-missing"
  | "meta/media-rejected"
  | "meta/media-url-not-allowed"
  | "meta/rate-limited"
  | "meta/timed-out"
  | "meta/provider-error";

export class MetaPublishError extends Error {
  constructor(
    readonly code: MetaPublishFailureCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "MetaPublishError";
  }
}

/**
 * Instagram's documented ceiling. Facebook Pages allow far more, so one cap
 * covers both and keeps a caption portable between the two targets.
 */
export const CAPTION_MAX_LENGTH = 2200;

/** Instagram rejects a post carrying more than 30 hashtags outright. */
export const CAPTION_MAX_HASHTAGS = 30;

export interface CaptionCheck {
  caption: string;
  hashtagCount: number;
}

/**
 * Normalizes a caption to what Meta will accept.
 *
 * Truncation is deliberate over rejection: a caption one character over the
 * limit should still post. Excess hashtags are dropped from the END, which is
 * where the tag block lives in every caption this app produces.
 */
export function sanitizeCaption(raw: string): CaptionCheck {
  const collapsed = raw.replace(/\r\n/g, "\n").trim();
  const hashtags = collapsed.match(/#[\p{L}\p{N}_]+/gu) ?? [];

  let caption = collapsed;
  if (hashtags.length > CAPTION_MAX_HASHTAGS) {
    // Walk from the end so the earliest (most intentional) tags survive.
    const matches = [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)];
    const doomed = matches.slice(CAPTION_MAX_HASHTAGS).reverse();
    for (const match of doomed) {
      if (match.index === undefined) continue;
      caption =
        caption.slice(0, match.index) +
        caption.slice(match.index + match[0].length);
    }
    caption = caption.replace(/[ \t]{2,}/g, " ").trim();
  }

  if (caption.length > CAPTION_MAX_LENGTH) {
    caption = caption.slice(0, CAPTION_MAX_LENGTH).trimEnd();
  }

  return {
    caption,
    hashtagCount: Math.min(hashtags.length, CAPTION_MAX_HASHTAGS),
  };
}

/**
 * Instagram's container endpoint accepts JPEG only — a PNG image_url fails at
 * container creation with an opaque error. The card artifact is rendered as a
 * PNG, so the upload step converts before it ever reaches here; this is the
 * guard that keeps a regression from becoming a Meta support ticket.
 */
export function assertInstagramImageFormat(url: string): void {
  const path = safePathname(url).toLowerCase();
  if (!path.endsWith(".jpg") && !path.endsWith(".jpeg")) {
    throw new MetaPublishError(
      "meta/media-rejected",
      "Instagram accepts JPEG images only"
    );
  }
}

/**
 * Meta fetches the media itself, server side, from whatever URL it is handed.
 * That makes the URL an outbound-fetch instruction, so it is validated against
 * the app's own R2 host rather than trusted from the client.
 */
export function assertAllowedMediaUrl(url: string, publicBase: string): void {
  const base = safeUrl(publicBase);
  const target = safeUrl(url);

  if (!base || !target) {
    throw new MetaPublishError("meta/media-url-not-allowed");
  }
  if (target.protocol !== "https:") {
    throw new MetaPublishError("meta/media-url-not-allowed");
  }
  if (target.host !== base.host) {
    throw new MetaPublishError("meta/media-url-not-allowed");
  }
  const basePath = base.pathname.replace(/\/+$/, "");
  if (basePath && !target.pathname.startsWith(`${basePath}/`)) {
    throw new MetaPublishError("meta/media-url-not-allowed");
  }
}

export type ContainerProgress =
  | { state: "ready" }
  | { state: "pending" }
  | { state: "failed"; code: MetaPublishFailureCode; message: string };

/**
 * Interprets `status_code` from a container poll.
 *
 * PUBLISHED counts as ready: a container can transition straight to published
 * when a retry re-publishes a container that already went through, and treating
 * that as an error would surface a failure for a post that exists.
 */
export function interpretContainerStatus(
  statusCode: string | undefined
): ContainerProgress {
  switch (statusCode) {
    case "FINISHED":
    case "PUBLISHED":
      return { state: "ready" };
    case "IN_PROGRESS":
    case undefined:
      return { state: "pending" };
    case "EXPIRED":
      return {
        state: "failed",
        code: "meta/timed-out",
        message: "Instagram let the upload expire before it was published",
      };
    case "ERROR":
      return {
        state: "failed",
        code: "meta/media-rejected",
        message: "Instagram could not process this media",
      };
    default:
      return {
        state: "failed",
        code: "meta/provider-error",
        message: `Instagram returned an unexpected status (${statusCode})`,
      };
  }
}

export interface MetaErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
  /**
   * api.instagram.com's OAuth host answers in a flat envelope of its own,
   * with different key names than every Graph call.
   */
  error_type?: string;
  error_message?: string;
}

/**
 * Instagram's OAuth errors, read into the Graph shape.
 *
 * Reading only `error.message` meant a failed Instagram connect reported
 * "Meta returned HTTP 400" and discarded the one sentence naming the cause,
 * which is the difference between a fixable error and a mystery. The flat
 * envelope also carries a `code`, but that is the HTTP status, not a Graph
 * error code, so it is deliberately left out rather than classified wrongly.
 */
function instagramOAuthError(
  payload: MetaErrorPayload | null
): MetaErrorPayload["error"] | undefined {
  const message = payload?.error_message?.trim();
  if (!message) return undefined;
  return { message, type: payload?.error_type };
}

/**
 * Maps a Graph API error body onto the small set of outcomes the UI can act
 * on. Anything unrecognized stays `provider-error` with Meta's own message —
 * a wrong-but-specific classification is worse than an honest passthrough.
 */
export function mapMetaError(
  payload: MetaErrorPayload | null,
  httpStatus: number
): MetaPublishError {
  const error = payload?.error ?? instagramOAuthError(payload);
  const code = error?.code;
  const subcode = error?.error_subcode;
  const message = error?.message?.trim();

  // 190 is the whole OAuth-token family; 102 is a lapsed session.
  if (code === 190 || code === 102 || httpStatus === 401) {
    return new MetaPublishError(
      "meta/token-expired",
      "The connection to Meta expired. Reconnect and try again."
    );
  }
  // 200/10 is "your app does not have this permission for this object".
  if (code === 200 || code === 10 || subcode === 1349125) {
    return new MetaPublishError(
      "meta/permission-missing",
      message ?? "This Meta account has not granted publishing permission"
    );
  }
  // 4 = app-level throttle, 17 = user-level, 32/613 = page/API throttle.
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new MetaPublishError(
      "meta/rate-limited",
      "Meta is rate limiting posts right now. Try again in a few minutes."
    );
  }
  if (code === 36003 || code === 2207026 || subcode === 2207032) {
    return new MetaPublishError(
      "meta/media-rejected",
      message ?? "Meta rejected this media"
    );
  }

  return new MetaPublishError(
    "meta/provider-error",
    message ?? `Meta returned HTTP ${httpStatus}`
  );
}

export function publishFailureMessage(code: MetaPublishFailureCode): string {
  switch (code) {
    case "meta/not-connected":
      return "Connect the account first.";
    case "meta/token-expired":
      return "That connection expired. Reconnect and try again.";
    case "meta/account-mismatch":
      return "This connection controls a different Instagram account.";
    case "meta/account-type-required":
      return "Direct posting needs an Instagram creator or business account.";
    case "meta/account-type-unverified":
      return "Reconnect Instagram so Flow Arts Composer can verify this professional account.";
    case "meta/facebook-capability-required":
      return "Connect Facebook to use this Instagram option.";
    case "meta/permission-missing":
      return "This account has not granted Flow Arts Composer permission to post.";
    case "meta/media-rejected":
      return "Meta would not accept this media.";
    case "meta/media-url-not-allowed":
      return "That media is not hosted where posting expects it.";
    case "meta/rate-limited":
      return "Meta is rate limiting posts. Try again in a few minutes.";
    case "meta/timed-out":
      return "Meta took too long to process the upload.";
    default:
      return "Meta could not publish this post.";
  }
}

/**
 * A 60-day token is refreshable only once it is 24 hours old, and refreshing on
 * the last day leaves no room for a failed attempt. Seven days of headroom
 * means a week of daily retries before anything user-visible breaks.
 */
export const TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_MIN_AGE_MS = 25 * 60 * 60 * 1000;

export function shouldRefreshToken(
  token: { issuedAtMs: number; expiresAtMs: number },
  nowMs: number
): boolean {
  if (nowMs - token.issuedAtMs < TOKEN_REFRESH_MIN_AGE_MS) return false;
  return token.expiresAtMs - nowMs <= TOKEN_REFRESH_WINDOW_MS;
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safePathname(value: string): string {
  return safeUrl(value)?.pathname ?? "";
}
