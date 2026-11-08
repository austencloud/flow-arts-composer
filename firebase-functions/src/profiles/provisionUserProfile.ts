/**
 * Server-side minting of `users/{uid}` — the public profile document.
 *
 * This used to be a client-side write in `createOrUpdateUserDocument`
 * (src/lib/shared/auth/services/user-document-manager.ts), whose failure was
 * swallowed by a `.catch(console.error)` in auth-state. On 2026-08-05 two real
 * Google signups produced an Auth record and a `userPrivateProfiles` doc but no
 * `users/{uid}` doc: the public-profile write reported success from the SDK's
 * local cache and never reached the server before the tab closed. Both users
 * were invisible to the admin panel AND to the signup notification, because
 * both key off this one document.
 *
 * The Admin SDK writes straight to the server with no offline cache and no
 * rules evaluation, so a signup can no longer produce an auth record with no
 * profile. The client write stays — it is faster when it works, and it is
 * idempotent with this one (both no-op when the doc already exists).
 *
 * Field set and shape deliberately mirror the client's create payload so a
 * server-minted profile is indistinguishable from a client-minted one, and
 * satisfies the schema-2 contract enforced in firestore.rules.
 */

import * as admin from "firebase-admin";
import type { UserRecord } from "firebase-admin/auth";
import { handleBaseFromName, handleCandidates } from "./handleFromName";

/** Matches PUBLIC_PROFILE_VERSION in src/lib/shared/community/domain/models/public-profile-contract.ts */
const PUBLIC_PROFILE_VERSION = 2;
const USERNAMES_COLLECTION = "usernames";

export type ProvisionOutcome = "created" | "already-exists" | "skipped-anonymous";

/** Port of capitalizeName in user-document-manager.ts. */
function capitalizeName(name: string): string {
  return name
    .split(" ")
    .map((word) => {
      if (word.includes("'")) {
        return word
          .split("'")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join("'");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Same cleaning as the client's displayName in user-document-manager.ts:
 * control characters become spaces, trimmed, at most 50 characters, and
 * "Creator" when nothing is left. The Admin SDK skips the rules, so the server
 * must not write a name the rules (1 to 50 plain characters) would refuse.
 */
export function cleanDisplayName(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001F\u007F]+/g, " ")
      .trim()
      .slice(0, 50)
      .trim() || "Creator"
  );
}

/**
 * Claim the first free handle the name gives, transactionally. Never from the
 * email. The read and the write share one transaction, so two concurrent signups
 * on the same name can never both win.
 */
async function claimAvailableUsername(
  db: admin.firestore.Firestore,
  name: string | null,
  uid: string
): Promise<string> {
  const candidates = handleCandidates(name);

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase().trim();
    const ref = db.collection(USERNAMES_COLLECTION).doc(lower);
    const won = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.get("userId") !== uid) return false;
      tx.set(ref, {
        userId: uid,
        username: candidate,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (won) return candidate;
  }

  // Every candidate collided — fall back to something that cannot: the same
  // cleaned base the candidates came from plus a slice of the uid, kept inside
  // the 30-character handle limit.
  const stem = (handleBaseFromName(name) ?? "creator")
    .slice(0, 23)
    .replace(/[._]+$/, "");
  return `${stem}_${uid.substring(0, 6).toLowerCase()}`;
}

/**
 * Ensure `users/{uid}` exists for this account. Idempotent: returns
 * "already-exists" without writing when the profile is already there, so it is
 * safe to call from a trigger, a sweep, and a backfill over the same account.
 */
export async function provisionUserProfile(
  user: UserRecord
): Promise<ProvisionOutcome> {
  const isAnonymous = user.providerData.length === 0 && !user.email;
  if (isAnonymous) return "skipped-anonymous";

  const db = admin.firestore();
  const userDocRef = db.collection("users").doc(user.uid);

  if ((await userDocRef.get()).exists) return "already-exists";

  // Google sign-ins routinely land with an empty top-level displayName and the
  // real name only on the provider record. Same order as the client, and never
  // the email: the part before the @ named two real users "Jasminehartart" and
  // "Hairbykevin127" in public.
  const authName =
    user.displayName ||
    user.providerData.find((p) => p.displayName)?.displayName ||
    null;
  const displayName = cleanDisplayName(capitalizeName(authName || "Creator"));
  // No photo stores null, as the client does: the generated picture is a
  // data: URL the rules refuse, and avatars draw it at render time.
  const photo = user.photoURL ?? null;

  const username = await claimAvailableUsername(db, authName, user.uid);

  // `create` (not `set`) so a client write that lands in the same instant wins
  // the race and this one aborts, rather than both writing and the loser
  // clobbering a profile the user has already started editing.
  try {
    await userDocRef.create({
      publicProfileVersion: PUBLIC_PROFILE_VERSION,
      displayName,
      username,
      usernameLowercase: username.toLowerCase().trim(),
      photoURL: photo,
      avatar: photo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivityDate: admin.firestore.FieldValue.serverTimestamp(),
      sequenceCount: 0,
      collectionCount: 0,
      followerCount: 0,
      totalXP: 0,
      currentLevel: 1,
      achievementCount: 0,
      currentStreak: 0,
      longestStreak: 0,
      pronouns: null,
      isAdmin: false,
      isAnonymous: false,
    });
  } catch (err: unknown) {
    // ALREADY_EXISTS = the client got there first. That is a success.
    if ((err as { code?: number }).code === 6) return "already-exists";
    throw err;
  }

  // Private profile is a merge — the client may already have written it, as it
  // did for both 2026-08-05 signups whose public profile was lost.
  await db
    .collection("userPrivateProfiles")
    .doc(user.uid)
    .set(
      {
        email: user.email ?? null,
        googleId:
          user.providerData.find((p) => p.providerId === "google.com")?.uid ??
          null,
        googlePhotoURL:
          user.providerData.find((p) => p.providerId === "google.com")
            ?.photoURL ?? null,
        facebookId:
          user.providerData.find((p) => p.providerId === "facebook.com")?.uid ??
          null,
      },
      { merge: true }
    );

  return "created";
}
