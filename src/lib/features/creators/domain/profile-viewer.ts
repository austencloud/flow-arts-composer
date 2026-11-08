/**
 * What the person looking at a profile may do, and how to word a load failure.
 *
 * Pure, because these decisions are easy to get wrong silently. Every Browse
 * visitor holds an anonymous Firebase uid, so "has a uid" does not mean "has an
 * account": that check gave guests a Follow the rules always refuse, plus a
 * private notes box they could never save.
 */
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";

export interface ProfileViewer {
  viewerId: string | null | undefined;
  /** `authState.isFullAccount`: signed in, and not an anonymous guest. */
  isFullAccount: boolean;
  isOwnProfile: boolean;
}

export interface ProfileActions {
  /**
   * `gate` keeps the button and asks for an account when pressed. The account
   * is asked for at the action (guest-access-config.ts), so a guest still sees
   * that following is possible.
   */
  follow: "toggle" | "gate" | "none";
  showReport: boolean;
  showConnection: boolean;
}

export function profileActionsFor(viewer: ProfileViewer): ProfileActions {
  if (viewer.isOwnProfile) {
    return { follow: "none", showReport: false, showConnection: false };
  }
  if (!viewer.viewerId || !viewer.isFullAccount) {
    return { follow: "gate", showReport: false, showConnection: false };
  }
  return { follow: "toggle", showReport: true, showConnection: true };
}

export type LoadFailure = "denied" | "offline" | "unknown";

/** Sort a load error into a sentence we can show. Never show `err.message`. */
export function classifyLoadFailure(
  error: unknown,
  isOnline: boolean = typeof navigator === "undefined" || navigator.onLine
): LoadFailure {
  if (isPermissionDeniedError(error)) return "denied";
  const code = (error as { code?: string } | null)?.code ?? "";
  if (!isOnline || code === "unavailable" || code.endsWith("/unavailable")) {
    return "offline";
  }
  return "unknown";
}
