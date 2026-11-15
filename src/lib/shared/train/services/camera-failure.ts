/**
 * Why a camera start failed, as a kind a caller can word for itself.
 *
 * CameraManager.start() rethrows with a translated message and keeps the
 * browser's own error on `cause`, so the native name (NotAllowedError,
 * NotFoundError, NotReadableError) is read from there first. A NotAllowedError
 * means two different things to a person: the question was closed without an
 * answer, or the site is blocked. Only the Permissions API tells those apart,
 * so the caller passes the permission state it read after the failure.
 */

export type CameraFailureKind = "not-started" | "blocked" | "missing" | "busy";

export type CameraPermission = "granted" | "denied" | "prompt" | "unknown";

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    const name = (cause as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

export function classifyCameraFailure(
  error: unknown,
  permission: CameraPermission
): CameraFailureKind {
  const name = errorName(error);
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "missing";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "busy";
  }
  if (permission === "denied") return "blocked";
  return "not-started";
}

/** The camera permission state, or "unknown" where the browser can't say. */
export async function readCameraPermission(): Promise<CameraPermission> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return "unknown";
    }
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    const state = status.state;
    return state === "granted" || state === "denied" || state === "prompt"
      ? state
      : "unknown";
  } catch {
    // Firefox and older Safari reject the "camera" name.
    return "unknown";
  }
}
