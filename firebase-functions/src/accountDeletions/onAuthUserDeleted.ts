/**
 * Account deletion tombstone — Auth onDelete trigger.
 *
 * Fires on ANY Firebase Auth user deletion (in-app self-delete, console,
 * future admin tooling). v2 identity triggers are blocking-only (no delete
 * event), so this is v1: `firebase-functions/v1` → `auth.user().onDelete()`.
 * That handler receives the full UserRecord (email, displayName,
 * metadata.creationTime, providerData) — the console/other-path deletions
 * this trigger also has to cover have no other source for those fields.
 *
 * Required cleanup failures reject the trigger so Firebase retries them.
 * Admin notification remains best-effort because it is not data cleanup.
 */

import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import type { UserRecord } from "firebase-admin/auth";
import { defineSecret } from "firebase-functions/params";
import { notifyAdmins } from "../pulse/notifyAdmins";
import { deleteByPrefix, getR2Client } from "../r2/r2-client";

const RETENTION_DAYS = 365;
const r2AccountId = defineSecret("R2_ACCOUNT_ID");
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");
const r2BucketName = defineSecret("R2_BUCKET_NAME");

function displayNameOf(user: UserRecord): string {
  return user.displayName || user.email || user.uid;
}

async function writeTombstone(user: UserRecord): Promise<void> {
  const db = admin.firestore();
  const deletedAt = admin.firestore.Timestamp.now();
  const expireAt = admin.firestore.Timestamp.fromMillis(
    deletedAt.toMillis() + RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  // Merge preserves a `reason` the client wrote to this doc pre-deletion
  // (see AccountManager.deleteAccount) while the trigger fills in the
  // identity fields only the Admin SDK / UserRecord can see.
  await db
    .collection("accountDeletions")
    .doc(user.uid)
    .set(
      {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        providerIds: [
          ...user.providerData.map((p) => p.providerId),
          ...(user.customClaims?.instagram === true ? ["instagram.com"] : []),
        ],
        accountCreatedAt: user.metadata.creationTime
          ? admin.firestore.Timestamp.fromDate(
              new Date(user.metadata.creationTime)
            )
          : null,
        deletedAt,
        expireAt,
      },
      { merge: true }
    );
}

export async function _cascadeDeleteFirestore(
  uid: string,
  db: admin.firestore.Firestore = admin.firestore()
): Promise<void> {
  const userRef = db.doc(`users/${uid}`);
  const [following, followers, connections] = await Promise.all([
    userRef.collection("following").listDocuments(),
    userRef.collection("followers").listDocuments(),
    userRef.collection("connections").listDocuments(),
  ]);

  const reciprocalRefs = new Map<string, admin.firestore.DocumentReference>();
  for (const ref of following) {
    const reciprocal = db.doc(`users/${ref.id}/followers/${uid}`);
    reciprocalRefs.set(reciprocal.path, reciprocal);
  }
  for (const ref of followers) {
    const reciprocal = db.doc(`users/${ref.id}/following/${uid}`);
    reciprocalRefs.set(reciprocal.path, reciprocal);
  }
  for (const ref of connections) {
    const reciprocal = db.doc(`users/${ref.id}/connections/${uid}`);
    reciprocalRefs.set(reciprocal.path, reciprocal);
  }
  await deleteReferences([...reciprocalRefs.values()], db);

  await Promise.all([
    deleteQuery(
      db.collection("publicSequences").where("ownerId", "==", uid),
      db
    ),
    deleteQuery(
      db.collection("publicSequenceHashes").where("ownerId", "==", uid),
      db
    ),
    deleteQuery(db.collection("contributors").where("userId", "==", uid), db),
    // The handle is free again, and the map pin goes with the person. A pin
    // left behind joined to a missing profile and could break the map.
    deleteQuery(db.collection("usernames").where("userId", "==", uid), db),
    db.doc(`userLocations/${uid}`).delete(),
  ]);

  // Removes the profile and every current or future user subcollection.
  await db.recursiveDelete(db.doc(`users/${uid}`));
}

async function deleteReferences(
  refs: admin.firestore.DocumentReference[],
  db: admin.firestore.Firestore = admin.firestore()
): Promise<void> {
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(offset, offset + 400)) batch.delete(ref);
    await batch.commit();
  }
}

async function deleteQuery(
  query: admin.firestore.Query,
  db: admin.firestore.Firestore = admin.firestore()
): Promise<void> {
  while (true) {
    const snapshot = await query.limit(400).get();
    if (snapshot.empty) return;
    await deleteReferences(
      snapshot.docs.map((doc) => doc.ref),
      db
    );
  }
}

async function removePresence(uid: string): Promise<void> {
  await admin.database().ref(`presence/${uid}`).remove();
}

async function removeInstagramAuthLinks(uid: string): Promise<void> {
  const db = admin.firestore();
  await deleteQuery(
    db.collection("instagramAuthLinks").where("uid", "==", uid)
  );
}

interface DocumentDeletingDb {
  doc(path: string): { delete(): Promise<unknown> };
}

export async function _removeAdminMetadata(
  uid: string,
  db: DocumentDeletingDb = admin.firestore()
): Promise<void> {
  await Promise.all([
    db.doc(`userAdminMetadata/${uid}`).delete(),
    db.doc(`userPrivateProfiles/${uid}`).delete(),
  ]);
}

interface PrefixDeletingBucket {
  deleteFiles(options: { prefix: string }): Promise<unknown>;
}

export async function _removeFirebaseStorage(
  uid: string,
  bucket: PrefixDeletingBucket = admin.storage().bucket()
): Promise<void> {
  const prefixes = [
    `users/${uid}/`,
    `avatars/${uid}/`,
    `feedback/${uid}/`,
    `feedback-staging/${uid}/`,
    `screenshots/${uid}/`,
    `acts/${uid}/`,
    `workshops/${uid}/`,
    `message-image-staging/${uid}/`,
  ];
  await Promise.all(prefixes.map((prefix) => bucket.deleteFiles({ prefix })));
}

export async function _removeR2Storage(uid: string): Promise<void> {
  const client = getR2Client(
    r2AccountId.value().trim(),
    r2AccessKeyId.value().trim(),
    r2SecretAccessKey.value().trim()
  );
  await deleteByPrefix(client, r2BucketName.value().trim(), `users/${uid}/`);
}

async function pingAdmins(
  user: UserRecord,
  reason: string | null
): Promise<void> {
  const name = displayNameOf(user);
  const message = reason
    ? `${name} deleted their account — reason: "${reason}"`
    : `${name} deleted their account`;

  await notifyAdmins({
    type: "admin-account-deleted",
    message,
    fromUserId: null, // the account no longer exists; never suppress via self-noise check
    data: { deletedUserId: user.uid, deletedUserEmail: user.email ?? null },
  });
}

interface AccountDeletionOperations {
  readReason(user: UserRecord): Promise<string | null>;
  writeTombstone(user: UserRecord): Promise<void>;
  cascadeDeleteFirestore(uid: string): Promise<void>;
  removePresence(uid: string): Promise<void>;
  removeInstagramAuthLinks(uid: string): Promise<void>;
  removeAdminMetadata(uid: string): Promise<void>;
  removeStorage(uid: string): Promise<void>;
  removeR2Storage(uid: string): Promise<void>;
  pingAdmins(user: UserRecord, reason: string | null): Promise<void>;
}

const accountDeletionOperations: AccountDeletionOperations = {
  async readReason(user) {
    try {
      const existing = await admin
        .firestore()
        .collection("accountDeletions")
        .doc(user.uid)
        .get();
      return (existing.data()?.reason as string | undefined) ?? null;
    } catch (err) {
      functionsV1.logger.error(
        "onAuthUserDeleted: failed to read pre-existing tombstone reason",
        { uid: user.uid, err }
      );
      return null;
    }
  },
  writeTombstone,
  cascadeDeleteFirestore: _cascadeDeleteFirestore,
  removePresence,
  removeInstagramAuthLinks,
  removeAdminMetadata: _removeAdminMetadata,
  removeStorage: _removeFirebaseStorage,
  removeR2Storage: _removeR2Storage,
  pingAdmins,
};

export async function _handleAuthUserDeleted(
  user: UserRecord,
  operations: AccountDeletionOperations = accountDeletionOperations
): Promise<null> {
  // Anonymous accounts (no linked provider) are deleted in bulk by the
  // daily cleanupStaleAnonymousAccounts sweep. Tombstoning them is noise
  // (no email/name to remember) and would ping admins once per swept
  // account. Required cleanup still runs for every path because guests can
  // upload media and leave a users/{uid} subtree behind.
  const isAnonymous =
    (!user.providerData || user.providerData.length === 0) &&
    user.customClaims?.instagram !== true;

  let reason: string | null = null;
  if (!isAnonymous) {
    reason = await operations.readReason(user);
    await operations.writeTombstone(user);
  }

  await Promise.all([
    operations.cascadeDeleteFirestore(user.uid),
    operations.removePresence(user.uid),
    operations.removeInstagramAuthLinks(user.uid),
    operations.removeAdminMetadata(user.uid),
    operations.removeStorage(user.uid),
    operations.removeR2Storage(user.uid),
  ]);

  if (!isAnonymous) {
    try {
      await operations.pingAdmins(user, reason);
    } catch (err) {
      functionsV1.logger.error("onAuthUserDeleted: failed to notify admins", {
        uid: user.uid,
        err,
      });
    }
  }

  return null;
}

export const onAuthUserDeleted = functionsV1
  .runWith({
    secrets: [r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName],
    failurePolicy: true,
  })
  .auth.user()
  .onDelete(async (user: UserRecord) => _handleAuthUserDeleted(user));
