/**
 * Centralized admin authorization guard.
 *
 * Verifies the caller is an authenticated Firebase user AND has admin role.
 * Replaces the duplicated isAdmin() pattern across admin endpoints.
 *
 * Usage:
 *   const caller = await requireAdmin(event);
 *   // caller is a FirebaseUser with verified admin role
 */

import type { RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { requireFirebaseUser, type FirebaseUser } from "./requireFirebaseUser";
import { getFirebaseAuthRest } from "./firebase-auth-rest";
import { workerEnv } from "../cloudflare/worker-env";

export function hasAdminClaim(user: {
  admin?: unknown;
  isAdmin?: unknown;
  role?: unknown;
}): boolean {
  return user.admin === true || user.isAdmin === true || user.role === "admin";
}

function firebaseErrorCode(cause: unknown): string | null {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return null;
  }
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" && code ? code : null;
}

export async function requireAdmin(event: RequestEvent): Promise<FirebaseUser> {
  const caller = await requireFirebaseUser(event);
  let liveUser;
  try {
    liveUser = await getFirebaseAuthRest(
      workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON
    ).getUser(caller.uid);
  } catch (cause) {
    const code = firebaseErrorCode(cause);
    console.error("[requireAdmin] Failed to resolve live Auth user:", {
      uid: caller.uid,
      code: code ?? "unknown",
      message: cause instanceof Error ? cause.message : String(cause),
    });

    if (code === "auth/user-not-found") {
      throw error(401, "Admin session is no longer valid");
    }

    // A Firebase outage, bad server credential, or permission failure says
    // nothing about the browser's login. Access still fails closed, but the
    // caller gets a retryable service response instead of being told to sign
    // in again for a session that may be healthy.
    throw error(503, "Admin authorization is temporarily unavailable");
  }

  if (liveUser.disabled) {
    throw error(403, "Admin account is disabled");
  }

  const authenticatedAt = caller.authTime * 1000;
  const tokensValidAfter = Date.parse(liveUser.tokensValidAfterTime ?? "");
  if (
    Number.isFinite(tokensValidAfter) &&
    authenticatedAt > 0 &&
    authenticatedAt <= tokensValidAfter
  ) {
    throw error(401, "Admin session was revoked");
  }

  const liveClaims = liveUser.customClaims ?? {};
  if (!hasAdminClaim(liveClaims)) {
    throw error(403, "Admin access required");
  }

  return caller;
}
