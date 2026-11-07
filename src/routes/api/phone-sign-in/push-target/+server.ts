import { json } from "@sveltejs/kit";
import { describeDevice } from "@austencloud/phone-sign-in";
import {
  MAX_TOKEN_AGE_SECONDS,
  NO_STORE,
} from "@austencloud/phone-sign-in/server";
import type { RequestHandler } from "./$types";
import {
  signInPush,
  trustedPhones,
  verifyPhoneUser,
} from "#lib/server/auth/phone-sign-in.js";
import { isTokenDocId } from "#lib/server/auth/phone-sign-in-push.js";
import { pushTargetMessage } from "#lib/shared/auth/phone-sign-in/values.js";

function answer(body: unknown, status = 200): Response {
  return json(body, { status, headers: NO_STORE });
}

// Which phone gets this account's sign-in notifications. Naming it needs the
// same fresh Google sign-in as trusting a phone, a signature from the account's
// trusted key over this token document's id (so only the phone trusted now can
// claim them, not an old one still holding its key), and a token document that
// belongs to this account. The target remembers which trusted phone set it.
export const POST: RequestHandler = async ({ request }) => {
  const user = await verifyPhoneUser(request);
  if (user.signInProvider !== "google.com") {
    return answer(
      { error: "Turn this on from a phone signed in with Google." },
      403
    );
  }
  if (
    !(Math.floor(Date.now() / 1000) - user.issuedAt <= MAX_TOKEN_AGE_SECONDS)
  ) {
    return answer(
      { error: "Your sign-in is too old. Reload this page and try again." },
      401
    );
  }

  const body = (await request.json().catch(() => null)) as {
    tokenDocId?: unknown;
    signature?: unknown;
  } | null;
  const tokenDocId = body?.tokenDocId;
  const signature = body?.signature;
  if (!isTokenDocId(tokenDocId)) {
    return answer({ error: "Invalid token" }, 400);
  }
  if (typeof signature !== "string") {
    return answer({ error: "Invalid signature" }, 400);
  }

  const keyTag = await signInPush.trustedKeyTag(user.uid);
  if (!keyTag) return answer({ error: "Trust this phone first." }, 409);
  const signed = await trustedPhones.verifyAutoSignature(
    user.uid,
    pushTargetMessage(tokenDocId),
    signature
  );
  if (!signed) {
    return answer(
      {
        error:
          "This phone is not the trusted one. Trust it again to get sign-ins here.",
      },
      403
    );
  }
  const saved = await signInPush.savedToken(user.uid, tokenDocId);
  if (!saved || saved.transport === "android-native") {
    return answer({ error: "Turn on notifications on this phone first." }, 409);
  }

  await signInPush.setTarget({
    uid: user.uid,
    tokenDocId,
    label: describeDevice(request.headers.get("user-agent") ?? ""),
    keyTag,
  });
  return answer({ status: "on" });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const user = await verifyPhoneUser(request);
  await signInPush.deleteTarget(user.uid);
  return answer({ status: "off" });
};
