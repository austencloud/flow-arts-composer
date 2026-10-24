import * as crypto from "crypto";
import { defineSecret } from "firebase-functions/params";

export const UNSUBSCRIBE_SECRET_NAME = "EMAIL_UNSUBSCRIBE_SECRET";
/** Bind this on every function that queues email or serves the link. */
export const unsubscribeSecret = defineSecret(UNSUBSCRIBE_SECRET_NAME);
export const UNSUBSCRIBE_ENDPOINT =
  "https://us-central1-the-kinetic-alphabet.cloudfunctions.net/emailUnsubscribe";

/** Preferences a signed link may turn off; it can never turn anything on. */
export const UNSUBSCRIBE_KEYS = [
  "emailMessages",
  "emailFeedback",
  "emailPlatformUpdates",
] as const;
export type UnsubscribeKey = (typeof UNSUBSCRIBE_KEYS)[number];

export interface UnsubscribeClaim {
  userId: string;
  preferenceKey: UnsubscribeKey;
}

function sign(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

/**
 * A link in an old email must keep working, so the token has no expiry. It
 * carries the user and the one preference it switches off, signed with a
 * server secret, so a bare uid can never unsubscribe anyone.
 */
export function createUnsubscribeToken(
  claim: UnsubscribeClaim,
  secret: string
): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, u: claim.userId, k: claim.preferenceKey })
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readUnsubscribeToken(
  token: unknown,
  secret: string
): UnsubscribeClaim | null {
  if (typeof token !== "string" || token.length > 1024 || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return null;
  }

  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      claim?.v === 1 &&
      typeof claim.u === "string" &&
      claim.u &&
      (UNSUBSCRIBE_KEYS as readonly string[]).includes(claim.k)
    ) {
      return { userId: claim.u, preferenceKey: claim.k };
    }
  } catch {
    // Falls through: a signed but malformed payload is still rejected.
  }
  return null;
}

export function unsubscribeUrl(token: string): string {
  return `${UNSUBSCRIBE_ENDPOINT}?t=${encodeURIComponent(token)}`;
}

/** RFC 2369 + RFC 8058 headers for the extension's top-level `headers` field. */
export function listUnsubscribeHeaders(
  claim: UnsubscribeClaim,
  secret: string
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(createUnsubscribeToken(claim, secret))}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
