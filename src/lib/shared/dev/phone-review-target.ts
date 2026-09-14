export const DEFAULT_PHONE_REVIEW_PATH = "/create";

export interface PhoneReviewTarget {
  path: string;
  /** Increase this only when the same path must deliberately reload. */
  revision: number;
  updatedAt: string;
}

export interface PhoneReviewDisplayState {
  following: boolean;
  displayedPath: string;
  displayedRevision: number;
}

function isSafePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("#")) {
    return false;
  }

  try {
    const parsed = new URL(path, "https://review.local");
    if (parsed.origin !== "https://review.local") return false;
    const pathname = decodeURIComponent(parsed.pathname);
    return pathname !== "/review" && !pathname.startsWith("/review/");
  } catch {
    return false;
  }
}

export function parsePhoneReviewTarget(
  value: unknown
): PhoneReviewTarget | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const { path, revision, updatedAt } = candidate;
  if (
    typeof path !== "string" ||
    !isSafePath(path) ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof updatedAt !== "string" ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    return null;
  }
  return { path, revision, updatedAt };
}

export function defaultPhoneReviewTarget(): PhoneReviewTarget {
  return {
    path: DEFAULT_PHONE_REVIEW_PATH,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

export function followPhoneReviewTarget(
  target: PhoneReviewTarget
): PhoneReviewDisplayState {
  return {
    following: true,
    displayedPath: target.path,
    displayedRevision: target.revision,
  };
}

export function pausePhoneReview(
  state: PhoneReviewDisplayState
): PhoneReviewDisplayState {
  return { ...state, following: false };
}

export function applyPhoneReviewTarget(
  state: PhoneReviewDisplayState,
  target: PhoneReviewTarget
): PhoneReviewDisplayState {
  return state.following ? followPhoneReviewTarget(target) : state;
}
