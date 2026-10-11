import type { RequestEvent } from "@sveltejs/kit";
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseIdToken,
} from "./verifyFirebaseIdToken";

export type FirebaseUser = VerifiedFirebaseIdToken;

function getBearerToken(event: Pick<RequestEvent, "request">): string | null {
  const header = event.request.headers.get("authorization")?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireFirebaseUser(
  event: Pick<RequestEvent, "request">
): Promise<FirebaseUser> {
  const token = getBearerToken(event);
  if (!token) {
    throw Object.assign(new Error("Missing Authorization Bearer token"), {
      status: 401,
      code: "missing_token",
    });
  }

  try {
    return await verifyFirebaseIdToken(token);
  } catch (verifyErr: unknown) {
    // Keep the verifier's stable error code so callers can distinguish an
    // expired session from a malformed token without exposing JWT details.
    const firebaseCode =
      typeof verifyErr === "object" && verifyErr && "code" in verifyErr
        ? String((verifyErr as { code: unknown }).code)
        : undefined;
    const detail =
      verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
    console.error(
      `[requireFirebaseUser] verifyIdToken failed (code=${firebaseCode ?? "unknown"}): ${detail}`
    );

    const expired =
      firebaseCode === "auth/id-token-expired" ||
      firebaseCode === "ERR_JWT_EXPIRED";
    throw Object.assign(
      new Error(
        expired
          ? "ID token expired. Sign in again."
          : "Invalid or expired token"
      ),
      {
        status: 401,
        code: "invalid_token",
        firebaseCode,
      }
    );
  }
}
