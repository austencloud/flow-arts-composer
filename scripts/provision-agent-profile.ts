/**
 * Provisions the shared Codex + Claude browser identity.
 *
 * The password is accepted only over stdin. It is never stored or printed by
 * this script. On Windows, scripts/agent-profile-credential.ps1 owns the
 * user-scoped encrypted copy used for future sign-ins.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Auth, UserRecord } from "firebase-admin/auth";
import type {
  FieldValue as AdminFieldValue,
  Firestore,
} from "firebase-admin/firestore";
import {
  ADMIN_PRIVATE_PROFILE_FIELDS,
  OWNER_PRIVATE_PROFILE_FIELDS,
  PUBLIC_PROFILE_FIELDS,
  PUBLIC_PROFILE_VERSION,
} from "../src/lib/shared/community/domain/models/public-profile-contract";

export const AGENT_PROFILE = Object.freeze({
  uid: "agent-codex-claude",
  email: "codex-claude@agents.invalid",
  displayName: "Codex + Claude",
  username: "codex-claude",
  bio: "Shared test profile for Codex and Claude. Used only for Austen-approved verification.",
  testAccountPurpose: "Approved browser verification by Codex and Claude",
  adminLabel: "Codex + Claude agent profile",
  adminNotes:
    "Dedicated shared browser identity. Keep at ordinary user access.",
});

interface ProvisionInput {
  password: string;
  rotatePassword?: boolean;
}

interface FirebaseProvider {
  db: Firestore;
  FieldValue: {
    serverTimestamp(): AdminFieldValue;
  };
  auth: Auth | null;
  isAdmin: boolean;
  sdk: string;
}

interface ProvisionResult {
  ok: true;
  created: boolean;
  passwordRotated: boolean;
  uid: string;
  email: string;
  displayName: string;
  username: string;
  verification: {
    authEnabled: boolean;
    emailVerified: boolean;
    role: "user";
    adminClaim: false;
    publicProfileSafe: boolean;
    hiddenFromCreatorListings: boolean;
    privateTestMetadata: boolean;
    usernameOwned: boolean;
  };
}

type Data = Record<string, unknown>;

export function buildAgentPublicProfile(
  timestamp: unknown,
  existingProfile: Data | null = null
): Data {
  const identity = {
    publicProfileVersion: PUBLIC_PROFILE_VERSION,
    displayName: AGENT_PROFILE.displayName,
    username: AGENT_PROFILE.username,
    usernameLowercase: AGENT_PROFILE.username,
    bio: AGENT_PROFILE.bio,
    updatedAt: timestamp,
    lastActivityDate: timestamp,
    role: "user",
    isAdmin: false,
    isHidden: true,
    isFeatured: false,
    isAnonymous: false,
  };

  if (existingProfile) return identity;

  return {
    ...identity,
    createdAt: timestamp,
    sequenceCount: 0,
    collectionCount: 0,
    followerCount: 0,
    followingCount: 0,
    totalXP: 0,
    currentLevel: 1,
    achievementCount: 0,
    currentStreak: 0,
    longestStreak: 0,
    pronouns: null,
  };
}

export function buildAgentOwnerPrivateProfile(): Data {
  return { email: AGENT_PROFILE.email };
}

export function buildAgentAdminMetadata(timestamp: unknown): Data {
  return {
    isTestAccount: true,
    testAccountPurpose: AGENT_PROFILE.testAccountPurpose,
    adminLabel: AGENT_PROFILE.adminLabel,
    adminNotes: AGENT_PROFILE.adminNotes,
    updatedAt: timestamp,
  };
}

export function assertSafeAgentPublicProfile(profile: Data): void {
  const keys = Object.keys(profile);
  const nonPublicFields = keys.filter(
    (field) => !PUBLIC_PROFILE_FIELDS.has(field)
  );
  const leakedPrivateFields = keys.filter(
    (field) =>
      OWNER_PRIVATE_PROFILE_FIELDS.has(field) ||
      ADMIN_PRIVATE_PROFILE_FIELDS.has(field)
  );

  if (nonPublicFields.length > 0 || leakedPrivateFields.length > 0) {
    throw new Error(
      `Agent public profile contains non-public fields: ${[
        ...new Set([...nonPublicFields, ...leakedPrivateFields]),
      ].join(", ")}`
    );
  }
  if (profile.publicProfileVersion !== PUBLIC_PROFILE_VERSION) {
    throw new Error("Agent public profile has the wrong contract version.");
  }
  if (profile.role !== "user" || profile.isAdmin !== false) {
    throw new Error("Agent public profile must remain an ordinary user.");
  }
  if (profile.isHidden !== true || profile.isFeatured !== false) {
    throw new Error("Agent public profile must stay out of creator listings.");
  }
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

async function optionalUserByUid(
  auth: Auth,
  uid: string
): Promise<UserRecord | null> {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (errorCode(error) === "auth/user-not-found") return null;
    throw error;
  }
}

async function optionalUserByEmail(
  auth: Auth,
  email: string
): Promise<UserRecord | null> {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (errorCode(error) === "auth/user-not-found") return null;
    throw error;
  }
}

async function resolveExistingAgent(auth: Auth): Promise<UserRecord | null> {
  const [byUid, byEmail] = await Promise.all([
    optionalUserByUid(auth, AGENT_PROFILE.uid),
    optionalUserByEmail(auth, AGENT_PROFILE.email),
  ]);

  if (byUid && byUid.email !== AGENT_PROFILE.email) {
    throw new Error(
      `Refusing to reuse ${AGENT_PROFILE.uid}: it belongs to another email.`
    );
  }
  if (byEmail && byEmail.uid !== AGENT_PROFILE.uid) {
    throw new Error(
      `Refusing to reuse ${AGENT_PROFILE.email}: it belongs to another uid.`
    );
  }
  const existing = byUid ?? byEmail;
  if (existing && existing.displayName !== AGENT_PROFILE.displayName) {
    throw new Error(
      "Refusing to reuse the agent identity because its display name does not match."
    );
  }
  return existing;
}

async function writeProfileDocuments(
  db: Firestore,
  FieldValue: FirebaseProvider["FieldValue"]
): Promise<void> {
  const userRef = db.doc(`users/${AGENT_PROFILE.uid}`);
  const usernameRef = db.doc(`usernames/${AGENT_PROFILE.username}`);
  const ownerPrivateRef = db.doc(`userPrivateProfiles/${AGENT_PROFILE.uid}`);
  const adminPrivateRef = db.doc(`userAdminMetadata/${AGENT_PROFILE.uid}`);

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, usernameSnapshot] = await transaction.getAll(
      userRef,
      usernameRef
    );
    const existingProfile = userSnapshot.exists
      ? (userSnapshot.data() as Data)
      : null;

    if (existingProfile) assertSafeAgentPublicProfile(existingProfile);
    if (
      usernameSnapshot.exists &&
      usernameSnapshot.data()?.userId !== AGENT_PROFILE.uid
    ) {
      throw new Error(`Username ${AGENT_PROFILE.username} is already taken.`);
    }

    const timestamp = FieldValue.serverTimestamp();
    const publicProfile = buildAgentPublicProfile(timestamp, existingProfile);
    assertSafeAgentPublicProfile({
      ...(existingProfile ?? {}),
      ...publicProfile,
    });

    transaction.set(userRef, publicProfile, { merge: true });
    transaction.set(ownerPrivateRef, buildAgentOwnerPrivateProfile(), {
      merge: true,
    });
    transaction.set(adminPrivateRef, buildAgentAdminMetadata(timestamp), {
      merge: true,
    });
    transaction.set(
      usernameRef,
      {
        userId: AGENT_PROFILE.uid,
        ...(usernameSnapshot.exists ? {} : { createdAt: timestamp }),
        updatedAt: timestamp,
      },
      { merge: true }
    );
  });
}

async function verifyProvisionedState(
  auth: Auth,
  db: Firestore
): Promise<ProvisionResult["verification"]> {
  const user = await auth.getUser(AGENT_PROFILE.uid);
  const [publicProfile, ownerPrivate, adminPrivate, username] = await db.getAll(
    db.doc(`users/${AGENT_PROFILE.uid}`),
    db.doc(`userPrivateProfiles/${AGENT_PROFILE.uid}`),
    db.doc(`userAdminMetadata/${AGENT_PROFILE.uid}`),
    db.doc(`usernames/${AGENT_PROFILE.username}`)
  );

  if (!publicProfile.exists)
    throw new Error("Agent public profile is missing.");
  const publicData = publicProfile.data() as Data;
  assertSafeAgentPublicProfile(publicData);

  const claims = user.customClaims ?? {};
  const adminClaim =
    claims.admin === true || claims.isAdmin === true || claims.role === "admin";
  if (claims.role !== "user" || adminClaim) {
    throw new Error("Agent authentication claims are not least privilege.");
  }
  if (user.disabled || !user.emailVerified) {
    throw new Error("Agent authentication record is not enabled and verified.");
  }
  if (ownerPrivate.data()?.email !== AGENT_PROFILE.email) {
    throw new Error("Agent owner-private email record is missing.");
  }
  if (
    adminPrivate.data()?.isTestAccount !== true ||
    adminPrivate.data()?.testAccountPurpose !== AGENT_PROFILE.testAccountPurpose
  ) {
    throw new Error("Agent test-account metadata is missing.");
  }
  if (username.data()?.userId !== AGENT_PROFILE.uid) {
    throw new Error("Agent username ownership is missing.");
  }

  return {
    authEnabled: true,
    emailVerified: true,
    role: "user",
    adminClaim: false,
    publicProfileSafe: true,
    hiddenFromCreatorListings: publicData.isHidden === true,
    privateTestMetadata: true,
    usernameOwned: true,
  };
}

export async function provisionAgentProfile(
  input: ProvisionInput
): Promise<ProvisionResult> {
  if (typeof input.password !== "string" || input.password.length < 20) {
    throw new Error(
      "A generated password of at least 20 characters is required."
    );
  }
  if (
    input.rotatePassword !== undefined &&
    typeof input.rotatePassword !== "boolean"
  ) {
    throw new Error("rotatePassword must be a boolean when provided.");
  }

  process.env.TKA_ADMIN = "1";
  const { initFirestore } = await import("./lib/firestore-provider.js");
  const provider = (await initFirestore()) as FirebaseProvider;
  if (!provider.isAdmin || !provider.auth) {
    throw new Error("Agent provisioning requires Firebase Admin credentials.");
  }

  const auth = provider.auth;
  const existing = await resolveExistingAgent(auth);
  let created = false;
  let user: UserRecord;

  if (existing) {
    user = await auth.updateUser(existing.uid, {
      email: AGENT_PROFILE.email,
      emailVerified: true,
      displayName: AGENT_PROFILE.displayName,
      disabled: false,
      ...(input.rotatePassword ? { password: input.password } : {}),
    });
  } else {
    user = await auth.createUser({
      uid: AGENT_PROFILE.uid,
      email: AGENT_PROFILE.email,
      emailVerified: true,
      password: input.password,
      displayName: AGENT_PROFILE.displayName,
      disabled: false,
    });
    created = true;
  }

  try {
    await auth.setCustomUserClaims(user.uid, { role: "user" });
    await writeProfileDocuments(provider.db, provider.FieldValue);
  } catch (error) {
    if (created) {
      await auth.deleteUser(user.uid).catch(() => undefined);
    }
    throw error;
  }

  const verification = await verifyProvisionedState(auth, provider.db);
  return {
    ok: true,
    created,
    passwordRotated: Boolean(existing && input.rotatePassword),
    uid: AGENT_PROFILE.uid,
    email: AGENT_PROFILE.email,
    displayName: AGENT_PROFILE.displayName,
    username: AGENT_PROFILE.username,
    verification,
  };
}

async function readInput(): Promise<ProvisionInput> {
  let raw = "";
  for await (const chunk of process.stdin) raw += String(chunk);
  // Windows PowerShell 5.1 prefixes every native stdin pipe with a UTF-8 BOM,
  // which JSON.parse rejects. pwsh 7 does not, so strip it rather than require
  // a particular host shell.
  raw = raw.replace(/^\uFEFF/, "");
  if (!raw.trim()) throw new Error("Provisioning input is required on stdin.");
  const parsed = JSON.parse(raw) as ProvisionInput;
  return parsed;
}

async function main(): Promise<void> {
  const result = await provisionAgentProfile(await readInput());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Agent profile provisioning failed: ${message}`);
    process.exitCode = 1;
  });
}
