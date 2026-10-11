/** Authoritative admin boundary for Firebase Auth and privileged profile mutations. */
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { requireAdmin } from "#lib/server/auth/requireAdmin.js";
import {
  getFirebaseAuthRest,
  type FirebaseAuthUser,
} from "#lib/server/auth/firebase-auth-rest.js";
import { getAdminAuth, getAdminDb } from "#lib/server/firebaseAdmin.js";
import {
  fromFirestoreFields,
  getFirestoreRest,
  toFirestoreFields,
} from "#lib/server/firestore/firestore-rest.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { logAdminAction } from "#lib/server/security/audit-logger.js";
import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
import type { UserRecord } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { createHash, randomUUID } from "node:crypto";
import {
  PUBLIC_PROFILE_FIELDS,
  PUBLIC_PROFILE_VERSION,
} from "#lib/shared/community/domain/models/public-profile-contract.js";
import { workerEnv } from "#lib/server/cloudflare/worker-env.js";

const VALID_ROLES = new Set<UserRole>(["user", "premium", "tester", "admin"]);
const RESERVED_FIRESTORE_DOCUMENT_ID = /^__.*__$/;
const LAST_ADMIN_LOCK_PATH = "adminMutationLocks/last-admin";
const MUTATION_LOCK_LEASE_MS = 120_000;
const MUTATION_LOCK_RENEWAL_MS = 30_000;

interface MutationLease {
  assertOwned(): Promise<void>;
  release(): Promise<void>;
}

export interface UserAuthData {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  disabled: boolean;
  providers: Array<{
    providerId: string;
    uid: string;
    displayName: string | null;
    email: string | null;
    phoneNumber: string | null;
    photoURL: string | null;
  }>;
  metadata: {
    creationTime: string | undefined;
    lastSignInTime: string | undefined;
  };
  privateProfile: { lastLocation: unknown | null };
  multiFactor: {
    enrolledFactors: Array<{
      uid: string;
      displayName: string | null;
      factorId: string;
      enrollmentTime: string | undefined;
    }>;
  } | null;
  contributor: { active: boolean; id: string | null };
  adminMetadata: AdminMetadata;
}

type AdminMetadata = {
  adminLabel: string | null;
  adminNotes: string | null;
};

type Mutation =
  | { action: "role"; role: UserRole }
  | { action: "disabled"; disabled: boolean }
  | { action: "contributor"; active: boolean }
  | {
      action: "profile";
      adminLabel?: string | null;
      adminNotes?: string | null;
      displayName?: string;
    };

function targetUid(event: Parameters<RequestHandler>[0]): string {
  const uid = event.params.uid;
  // Auth permits arbitrary 1-128 character UIDs. This application also keys
  // Firestore profile documents by UID, so only Firestore-reserved IDs and
  // path separators are excluded; punctuation such as ':' and '.' is valid.
  if (
    !uid ||
    uid.length > 128 ||
    uid.includes("/") ||
    uid === "." ||
    uid === ".." ||
    RESERVED_FIRESTORE_DOCUMENT_ID.test(uid)
  )
    throw error(400, "Valid user ID required");
  return uid;
}

async function authorize(event: Parameters<RequestHandler>[0]) {
  const caller = await requireAdmin(event);
  const blocked = await withRateLimit(
    event,
    RATE_LIMITS.ADMIN,
    "user",
    caller.uid
  );
  return { caller, blocked };
}

function authData(
  userRecord: UserRecord | FirebaseAuthUser,
  contributor: { active: boolean; id: string | null },
  adminMetadata: AdminMetadata,
  privateProfile: { lastLocation: unknown | null }
): UserAuthData {
  return {
    uid: userRecord.uid,
    email: userRecord.email ?? null,
    emailVerified: userRecord.emailVerified,
    displayName: userRecord.displayName ?? null,
    photoURL: userRecord.photoURL ?? null,
    phoneNumber: userRecord.phoneNumber ?? null,
    disabled: userRecord.disabled,
    providers: userRecord.providerData.map((provider) => ({
      providerId: provider.providerId,
      uid: provider.uid,
      displayName: provider.displayName ?? null,
      email: provider.email ?? null,
      phoneNumber: provider.phoneNumber ?? null,
      photoURL: provider.photoURL ?? null,
    })),
    metadata: {
      creationTime: userRecord.metadata.creationTime,
      lastSignInTime: userRecord.metadata.lastSignInTime,
    },
    privateProfile,
    multiFactor: userRecord.multiFactor
      ? {
          enrolledFactors: userRecord.multiFactor.enrolledFactors.map(
            (factor) => ({
              uid: factor.uid,
              displayName: factor.displayName ?? null,
              factorId: factor.factorId,
              enrollmentTime: factor.enrollmentTime,
            })
          ),
        }
      : null,
    contributor,
    adminMetadata,
  };
}

async function readPrivateProfile(uid: string, platformCredential?: string) {
  const document = await getFirestoreRest(platformCredential).getDocument(
    `userPrivateProfiles/${uid}`,
    ["lastLocation"]
  );
  const data = document ? fromFirestoreFields(document.fields ?? {}) : {};
  return { lastLocation: data.lastLocation ?? null };
}

async function readAdminMetadata(
  uid: string,
  platformCredential?: string
): Promise<AdminMetadata> {
  const firestore = getFirestoreRest(platformCredential);
  const [privateDocument, publicDocument] = await Promise.all([
    firestore.getDocument(`userAdminMetadata/${uid}`, [
      "adminLabel",
      "adminNotes",
    ]),
    firestore.getDocument(`users/${uid}`),
  ]);
  const privateData = privateDocument
    ? fromFirestoreFields(privateDocument.fields ?? {})
    : {};
  const publicData = publicDocument
    ? fromFirestoreFields(publicDocument.fields ?? {})
    : {};
  const hasLegacyLabel = Object.hasOwn(publicData, "adminLabel");
  const hasLegacyNotes = Object.hasOwn(publicData, "adminNotes");

  const metadata: AdminMetadata = {
    adminLabel: Object.hasOwn(privateData, "adminLabel")
      ? typeof privateData.adminLabel === "string"
        ? privateData.adminLabel
        : null
      : typeof publicData.adminLabel === "string"
        ? publicData.adminLabel
        : null,
    adminNotes: Object.hasOwn(privateData, "adminNotes")
      ? typeof privateData.adminNotes === "string"
        ? privateData.adminNotes
        : null
      : typeof publicData.adminNotes === "string"
        ? publicData.adminNotes
        : null,
  };

  if (hasLegacyLabel || hasLegacyNotes) {
    // The private write completes first. If stripping the public copy fails,
    // rules keep that legacy profile unreadable until the next admin request
    // retries migration, so private values are never silently lost or exposed.
    await firestore.commit([
      {
        update: {
          name: firestore.documentName(`userAdminMetadata/${uid}`),
          fields: toFirestoreFields(metadata),
        },
        updateMask: { fieldPaths: ["adminLabel", "adminNotes"] },
      },
    ]);
  }
  if (hasLegacyLabel || hasLegacyNotes) {
    const remainingFields = Object.keys(publicData).filter(
      (field) => field !== "adminLabel" && field !== "adminNotes"
    );
    const canMarkPublic = remainingFields.every((field) =>
      PUBLIC_PROFILE_FIELDS.has(field)
    );
    const publicUpdate: Record<string, unknown> = {};
    const fieldPaths: string[] = [];
    if (canMarkPublic) {
      publicUpdate.publicProfileVersion = PUBLIC_PROFILE_VERSION;
      fieldPaths.push("publicProfileVersion");
    } else if (publicData.publicProfileVersion === PUBLIC_PROFILE_VERSION) {
      fieldPaths.push("publicProfileVersion");
    }
    if (hasLegacyLabel) fieldPaths.push("adminLabel");
    if (hasLegacyNotes) fieldPaths.push("adminNotes");
    await firestore.commit([
      {
        update: {
          name: firestore.documentName(`users/${uid}`),
          fields: toFirestoreFields(publicUpdate),
        },
        updateMask: { fieldPaths },
      },
    ]);
  }

  return metadata;
}

async function contributorState(uid: string, platformCredential?: string) {
  const documents = await getFirestoreRest(platformCredential).queryDocuments({
    collectionId: "contributors",
    fieldPath: "userId",
    value: uid,
    limit: 1000,
  });
  const ids = documents.map((document) => {
    const encodedId = document.name.split("/").at(-1) ?? "";
    return decodeURIComponent(encodedId);
  });
  return {
    active: ids.length > 0,
    id: ids[0] ?? null,
    ids,
  };
}

async function assertNotOnlyAdmin(uid: string): Promise<void> {
  const auth = getAdminAuth();
  const target = await auth.getUser(uid);
  if (target.disabled || !hasLiveAdminClaim(target)) return;

  let enabledAdminCount = 0;
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    enabledAdminCount += page.users.filter(
      (candidate) => !candidate.disabled && hasLiveAdminClaim(candidate)
    ).length;
    if (enabledAdminCount > 1) return;
    pageToken = page.pageToken;
  } while (pageToken);

  if (enabledAdminCount === 1) {
    throw error(
      409,
      "The last administrator cannot be demoted, disabled, or deleted"
    );
  }
}

function timestampMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    return (value as { toMillis(): number }).toMillis();
  }
  return Number.NaN;
}

function userMutationLockPath(uid: string): string {
  const key = createHash("sha256").update(uid).digest("base64url");
  return `adminMutationLocks/user-${key}`;
}

async function acquireMutationLock(
  path: string,
  targetUid: string,
  conflictMessage: string
): Promise<MutationLease> {
  const db = getAdminDb();
  const lockRef = db.doc(path);
  const owner = randomUUID();
  let lost = false;
  let renewal = Promise.resolve();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    if (
      snapshot.exists &&
      timestampMillis(snapshot.data()?.expiresAt) > Date.now()
    ) {
      throw error(409, conflictMessage);
    }
    transaction.set(lockRef, {
      owner,
      targetUid,
      expiresAt: Timestamp.fromMillis(Date.now() + MUTATION_LOCK_LEASE_MS),
    });
  });

  async function renew(): Promise<void> {
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lockRef);
        if (!snapshot.exists || snapshot.data()?.owner !== owner) {
          lost = true;
          return;
        }
        transaction.update(lockRef, {
          expiresAt: Timestamp.fromMillis(Date.now() + MUTATION_LOCK_LEASE_MS),
        });
      });
    } catch (cause) {
      lost = true;
      console.error("[admin/user-auth] Failed to renew mutation lock:", cause);
    }
  }

  function queueRenewal(): Promise<void> {
    renewal = renewal.then(renew, renew);
    return renewal;
  }

  const renewalTimer = setInterval(
    () => void queueRenewal(),
    MUTATION_LOCK_RENEWAL_MS
  );
  if (typeof renewalTimer === "object" && "unref" in renewalTimer) {
    renewalTimer.unref();
  }

  return {
    async assertOwned() {
      await queueRenewal();
      if (lost) throw error(409, "Mutation lock ownership was lost");
    },
    async release() {
      clearInterval(renewalTimer);
      await renewal;
      try {
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(lockRef);
          if (snapshot.exists && snapshot.data()?.owner === owner) {
            transaction.delete(lockRef);
          }
        });
      } catch (cause) {
        // The TTL-backed lease expires automatically. A release failure must
        // not turn an already-committed mutation into a false 500 response.
        console.error(
          "[admin/user-auth] Failed to release mutation lock:",
          cause
        );
      }
    },
  };
}

async function acquireUserMutationLocks(
  targetUid: string,
  serializeAdminSet: boolean
): Promise<MutationLease> {
  const leases: MutationLease[] = [];
  try {
    if (serializeAdminSet) {
      leases.push(
        await acquireMutationLock(
          LAST_ADMIN_LOCK_PATH,
          targetUid,
          "Another administrator account change is in progress"
        )
      );
    }
    leases.push(
      await acquireMutationLock(
        userMutationLockPath(targetUid),
        targetUid,
        "Another change for this account is in progress"
      )
    );
  } catch (cause) {
    for (const lease of leases.reverse()) await lease.release();
    throw cause;
  }

  return {
    async assertOwned() {
      for (const lease of leases) await lease.assertOwned();
    },
    async release() {
      for (const lease of leases.reverse()) await lease.release();
    },
  };
}

async function attemptAuthRollback(
  lease: MutationLease,
  label: string,
  rollback: () => Promise<unknown>
): Promise<void> {
  try {
    // Re-check the fencing lease immediately before compensation. A stale
    // holder must never overwrite Auth state committed by its successor.
    await lease.assertOwned();
  } catch (cause) {
    console.error(
      `[admin/user-auth] Skipped stale ${label} rollback after ownership loss:`,
      cause
    );
    return;
  }

  try {
    await rollback();
  } catch (cause) {
    console.error(`[admin/user-auth] Failed to roll back ${label}:`, cause);
  }
}

function hasLiveAdminClaim(user: UserRecord): boolean {
  const claims = user.customClaims ?? {};
  return (
    claims.admin === true || claims.isAdmin === true || claims.role === "admin"
  );
}

function mutationBody(value: unknown): Mutation {
  if (!value || typeof value !== "object" || !("action" in value))
    throw error(400, "Mutation action required");
  const body = value as Record<string, unknown>;
  if (
    body.action === "role" &&
    typeof body.role === "string" &&
    VALID_ROLES.has(body.role as UserRole)
  ) {
    return { action: "role", role: body.role as UserRole };
  }
  if (body.action === "disabled" && typeof body.disabled === "boolean")
    return { action: "disabled", disabled: body.disabled };
  if (body.action === "contributor" && typeof body.active === "boolean")
    return { action: "contributor", active: body.active };
  if (body.action === "profile") {
    const allowed = new Set([
      "action",
      "adminLabel",
      "adminNotes",
      "displayName",
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key)))
      throw error(400, "Unsupported profile field");
    const result: Mutation = { action: "profile" };
    if ("adminLabel" in body) {
      if (body.adminLabel !== null && typeof body.adminLabel !== "string")
        throw error(400, "Invalid admin label");
      result.adminLabel =
        typeof body.adminLabel === "string"
          ? body.adminLabel.trim().slice(0, 100) || null
          : null;
    }
    if ("adminNotes" in body) {
      if (body.adminNotes !== null && typeof body.adminNotes !== "string")
        throw error(400, "Invalid admin notes");
      result.adminNotes =
        typeof body.adminNotes === "string"
          ? body.adminNotes.trim().slice(0, 4000) || null
          : null;
    }
    if ("displayName" in body) {
      if (typeof body.displayName !== "string" || !body.displayName.trim())
        throw error(400, "Display name required");
      result.displayName = body.displayName.trim().slice(0, 50);
    }
    if (Object.keys(result).length === 1)
      throw error(400, "Profile field required");
    return result;
  }
  throw error(400, "Invalid mutation payload");
}

export const GET: RequestHandler = async (event) => {
  try {
    const { caller, blocked } = await authorize(event);
    if (blocked) return blocked;
    const uid = targetUid(event);
    const platformCredential = workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON;
    const [record, contributor, adminMetadata, privateProfile] =
      await Promise.all([
        getFirebaseAuthRest(platformCredential).getUser(uid),
        contributorState(uid, platformCredential),
        readAdminMetadata(uid, platformCredential),
        readPrivateProfile(uid, platformCredential),
      ]);
    await logAdminAction(
      {
        uid: caller.uid,
        action: "user_auth_query",
        target: uid,
        ip: event.getClientAddress(),
      },
      platformCredential
    );
    return Response.json(
      authData(record, contributor, adminMetadata, privateProfile)
    );
  } catch (cause) {
    return handleFailure(cause, "fetch user auth data");
  }
};

export const PATCH: RequestHandler = async (event) => {
  try {
    const { caller, blocked } = await authorize(event);
    if (blocked) return blocked;
    const uid = targetUid(event);
    const platformCredential = workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON;
    const mutation = mutationBody(await event.request.json());
    const auth = getAdminAuth();
    const db = getAdminDb();
    let before = await auth.getUser(uid);

    if (
      caller.uid === uid &&
      (mutation.action === "role" || mutation.action === "disabled")
    ) {
      throw error(
        409,
        "Administrators cannot change their own role or account status"
      );
    }

    const needsAdminLock =
      mutation.action === "role" || mutation.action === "disabled";
    const mutationLease = await acquireUserMutationLocks(uid, needsAdminLock);

    try {
      if (needsAdminLock) {
        // Refresh inside the serialized section so rollback data and the guard
        // observe the same authoritative Auth state.
        before = await auth.getUser(uid);
      }
      if (
        (mutation.action === "role" && mutation.role !== "admin") ||
        (mutation.action === "disabled" && mutation.disabled)
      ) {
        await assertNotOnlyAdmin(uid);
      }
      await mutationLease.assertOwned();

      if (mutation.action === "role") {
        const claims = before.customClaims ?? {};
        const nextClaims = {
          ...claims,
          role: mutation.role,
          admin: mutation.role === "admin",
          isAdmin: mutation.role === "admin",
        };
        if (mutation.role !== "admin") await auth.revokeRefreshTokens(uid);
        await auth.setCustomUserClaims(uid, nextClaims);
        try {
          await mutationLease.assertOwned();
          await db.doc(`users/${uid}`).update({
            role: mutation.role,
            isAdmin: mutation.role === "admin",
          });
        } catch (cause) {
          await attemptAuthRollback(mutationLease, "role claims", () =>
            auth.setCustomUserClaims(uid, claims)
          );
          throw cause;
        }
      } else if (mutation.action === "disabled") {
        if (mutation.disabled) await auth.revokeRefreshTokens(uid);
        await auth.updateUser(uid, { disabled: mutation.disabled });
        try {
          await mutationLease.assertOwned();
          await db
            .doc(`users/${uid}`)
            .update({ isDisabled: mutation.disabled });
        } catch (cause) {
          await attemptAuthRollback(mutationLease, "account status", () =>
            auth.updateUser(uid, { disabled: before.disabled })
          );
          throw cause;
        }
      } else if (mutation.action === "contributor") {
        const state = await contributorState(uid, platformCredential);
        const contributors = db.collection("contributors");
        const batch = db.batch();
        if (mutation.active) {
          const profile = await db.doc(`users/${uid}`).get();
          if (!profile.exists) throw error(404, "User profile not found");
          const data = profile.data() ?? {};
          batch.set(contributors.doc(uid), {
            userId: uid,
            displayName: data.displayName ?? data.name ?? "Unknown",
            avatarUrl: data.photoURL ?? data.avatar ?? "",
          });
          for (const id of new Set(state.ids)) {
            if (id !== uid) batch.delete(contributors.doc(id));
          }
        } else {
          for (const id of new Set([...state.ids, uid])) {
            batch.delete(contributors.doc(id));
          }
        }
        await mutationLease.assertOwned();
        await batch.commit();
      } else {
        const profileUpdate: Record<string, string | null> = {};
        const adminUpdate: Record<string, string | null> = {};
        let contributorForRename:
          | {
              ids: string[];
              data: Record<string, unknown>;
            }
          | undefined;
        if ("adminLabel" in mutation)
          adminUpdate.adminLabel = mutation.adminLabel ?? null;
        if ("adminNotes" in mutation)
          adminUpdate.adminNotes = mutation.adminNotes ?? null;
        if (mutation.displayName) {
          const [profile, contributor] = await Promise.all([
            db.doc(`users/${uid}`).get(),
            contributorState(uid, platformCredential),
          ]);
          if (!profile.exists) throw error(404, "User profile not found");
          profileUpdate.displayName = mutation.displayName;
          if (contributor.active) {
            contributorForRename = {
              ids: contributor.ids,
              data: profile.data() ?? {},
            };
          }
          await mutationLease.assertOwned();
          await auth.updateUser(uid, { displayName: mutation.displayName });
        }
        try {
          const batch = db.batch();
          if (Object.keys(profileUpdate).length) {
            batch.update(db.doc(`users/${uid}`), profileUpdate);
          }
          if (Object.keys(adminUpdate).length) {
            batch.set(db.doc(`userAdminMetadata/${uid}`), adminUpdate, {
              merge: true,
            });
          }
          if (mutation.displayName && contributorForRename) {
            const contributors = db.collection("contributors");
            batch.set(contributors.doc(uid), {
              userId: uid,
              displayName: mutation.displayName,
              avatarUrl:
                contributorForRename.data.photoURL ??
                contributorForRename.data.avatar ??
                "",
            });
            for (const id of new Set(contributorForRename.ids)) {
              if (id !== uid) batch.delete(contributors.doc(id));
            }
          }
          await mutationLease.assertOwned();
          await batch.commit();
        } catch (cause) {
          if (mutation.displayName) {
            await attemptAuthRollback(mutationLease, "display name", () =>
              auth.updateUser(uid, {
                displayName: before.displayName ?? null,
              })
            );
          }
          throw cause;
        }
      }
    } finally {
      await mutationLease.release();
    }

    await logAdminAction(
      {
        uid: caller.uid,
        action: `user_${mutation.action}_update`,
        target: uid,
        metadata: {
          changedFields: Object.keys(mutation).filter(
            (key) => key !== "action"
          ),
        },
        ip: event.getClientAddress(),
      },
      platformCredential
    );
    const [record, contributor, adminMetadata, privateProfile] =
      await Promise.all([
        auth.getUser(uid),
        contributorState(uid, platformCredential),
        readAdminMetadata(uid, platformCredential),
        readPrivateProfile(uid, platformCredential),
      ]);
    return Response.json({
      success: true,
      auth: authData(record, contributor, adminMetadata, privateProfile),
    });
  } catch (cause) {
    return handleFailure(cause, "update user");
  }
};

export const DELETE: RequestHandler = async (event) => {
  try {
    const { caller, blocked } = await authorize(event);
    if (blocked) return blocked;
    const uid = targetUid(event);
    const platformCredential = workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (caller.uid === uid)
      throw error(409, "Administrators cannot delete their own account here");
    const mutationLease = await acquireUserMutationLocks(uid, true);
    try {
      await assertNotOnlyAdmin(uid);
      await mutationLease.assertOwned();
      await getAdminAuth().deleteUser(uid);
    } finally {
      await mutationLease.release();
    }
    await logAdminAction(
      {
        uid: caller.uid,
        action: "user_deleted",
        target: uid,
        ip: event.getClientAddress(),
      },
      platformCredential
    );
    return Response.json({ success: true });
  } catch (cause) {
    return handleFailure(cause, "delete user");
  }
};

function handleFailure(cause: unknown, action: string): never {
  if (typeof cause === "object" && cause && "status" in cause) throw cause;
  if (
    typeof cause === "object" &&
    cause &&
    "code" in cause &&
    (cause as { code: string }).code === "auth/user-not-found"
  ) {
    throw error(404, "User not found");
  }
  console.error(`[admin/user-auth] Failed to ${action}:`, cause);
  throw error(500, `Failed to ${action}`);
}
