import {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import * as admin from "firebase-admin";

const MAGIC_LINK_STATE_COLLECTION = "magicLinkSignInStates";
const MAGIC_LINK_EMAIL_GUARD_COLLECTION = "magicLinkEmailGuards";
const MAGIC_LINK_CALLER_GUARD_COLLECTION = "magicLinkCallerGuards";
export const MAGIC_LINK_STATE_LIFETIME_MS = 30 * 60 * 1000;
export const MAGIC_LINK_CODE_MAX_ATTEMPTS = 5;
const MAGIC_LINK_CODE_LENGTH = 6;
const CODE_HASH_BYTES = 32;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Sending limits. Each send creates a state with a fresh code, so without a
 * cap every new state was five more guesses at a six-digit code. The limits
 * hold for every address alike, so being limited says nothing about whether
 * an account exists.
 */
export const MAGIC_LINK_SEND_LIMITS = {
  emailPerHour: 5,
  emailPerDay: 20,
  callerPerHour: 20,
} as const;

/**
 * Wrong typed codes are counted per email across every state. Reaching the
 * limit inside the window locks typed codes for that email. The emailed link
 * does not go through this lock, so a stranger who burns the tries cannot
 * stop the owner from signing in with the link.
 */
export const MAGIC_LINK_CODE_FAILURE_LIMIT = 10;
export const MAGIC_LINK_CODE_FAILURE_WINDOW_MS = HOUR_MS;
export const MAGIC_LINK_CODE_LOCK_MS = HOUR_MS;

// Firestore TTL cleanup can lag behind the timestamp. Resolution checks the
// timestamp itself, so a document waiting to be deleted never extends a link.

interface MagicLinkSignInStateDocument {
  email: string;
  requestId: string;
  codeSalt: string;
  codeHash: string;
  codeAttempts: number;
  codeConsumedAt: admin.firestore.Timestamp | null;
  initiatingUid: string | null;
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
}

interface WindowCounter {
  start: number;
  count: number;
}

/**
 * One document per email, keyed by a hash of the address. It holds the send
 * counters, the single live state, and the typed-code failure counter.
 */
export interface MagicLinkEmailGuard {
  sendHour?: WindowCounter;
  sendDay?: WindowCounter;
  liveState?: string | null;
  codeFailures?: WindowCounter;
  codeLockedUntil?: number | null;
}

/** One document per caller address, keyed by a hash of the address. */
export interface MagicLinkCallerGuard {
  sendHour?: WindowCounter;
}

export interface MagicLinkSignInState {
  state: string;
  expiresAtMs: number;
  oneTimeCode: string;
}

export type MagicLinkSignInStateResult =
  | ({ status: "created" } & MagicLinkSignInState)
  | { status: "rate-limited" };

export interface ResolvedMagicLinkSignInState {
  email: string;
  expiresAtMs: number;
}

export interface RedeemedMagicLinkCode {
  email: string;
  initiatingUid: string | null;
}

export type MagicLinkCodeRedemption =
  | ({ status: "redeemed" } & RedeemedMagicLinkCode)
  | { status: "invalid" }
  | { status: "locked" };

interface ParsedMagicLinkCodeState extends RedeemedMagicLinkCode {
  codeSalt: string;
  codeHash: string;
  codeAttempts: number;
}

/**
 * The store's Firestore and clock. Production uses the admin SDK; tests pass
 * an in-memory stand-in so every rule here is exercised without an emulator.
 */
export interface MagicLinkStoreDeps {
  db: admin.firestore.Firestore;
  now: () => number;
}

function defaultDeps(): MagicLinkStoreDeps {
  return { db: admin.firestore(), now: Date.now };
}

export function isMagicLinkStateId(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isMagicLinkRequestId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function isMagicLinkCode(value: string): boolean {
  return new RegExp(`^\\d{${MAGIC_LINK_CODE_LENGTH}}$`).test(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Guard key for an email. Raw addresses never become document ids. */
export function magicLinkEmailKey(email: string): string {
  return sha256Hex(`email:${email.trim().toLowerCase()}`);
}

/** Guard key for a caller address. Raw addresses are never stored. */
export function magicLinkCallerKey(address: string): string {
  return sha256Hex(`caller:${address.trim().toLowerCase()}`);
}

function hashMagicLinkCode(code: string, salt: Buffer): Buffer {
  return scryptSync(code, salt, CODE_HASH_BYTES, {
    N: 16_384,
    r: 8,
    p: 1,
  });
}

export function verifyMagicLinkCode(
  code: string,
  saltBase64: string,
  hashBase64: string
): boolean {
  if (!isMagicLinkCode(code)) return false;

  try {
    const expected = Buffer.from(hashBase64, "base64");
    const actual = hashMagicLinkCode(code, Buffer.from(saltBase64, "base64"));
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

function currentWindow(
  value: unknown,
  windowMs: number,
  nowMs: number
): WindowCounter {
  const candidate = value as Partial<WindowCounter> | undefined;
  if (
    !candidate ||
    typeof candidate.start !== "number" ||
    typeof candidate.count !== "number" ||
    candidate.count < 0 ||
    candidate.start > nowMs ||
    nowMs - candidate.start >= windowMs
  ) {
    return { start: nowMs, count: 0 };
  }
  return { start: candidate.start, count: candidate.count };
}

export type MagicLinkSendPlan =
  | { allowed: false }
  | {
      allowed: true;
      email: { sendHour: WindowCounter; sendDay: WindowCounter };
      caller: { sendHour: WindowCounter };
    };

/** Decide whether one more send fits the per-email and per-caller limits. */
export function planMagicLinkSend(
  emailGuard: MagicLinkEmailGuard | undefined,
  callerGuard: MagicLinkCallerGuard | undefined,
  nowMs: number
): MagicLinkSendPlan {
  const emailHour = currentWindow(emailGuard?.sendHour, HOUR_MS, nowMs);
  const emailDay = currentWindow(emailGuard?.sendDay, DAY_MS, nowMs);
  const callerHour = currentWindow(callerGuard?.sendHour, HOUR_MS, nowMs);

  if (
    emailHour.count >= MAGIC_LINK_SEND_LIMITS.emailPerHour ||
    emailDay.count >= MAGIC_LINK_SEND_LIMITS.emailPerDay ||
    callerHour.count >= MAGIC_LINK_SEND_LIMITS.callerPerHour
  ) {
    return { allowed: false };
  }

  return {
    allowed: true,
    email: {
      sendHour: { ...emailHour, count: emailHour.count + 1 },
      sendDay: { ...emailDay, count: emailDay.count + 1 },
    },
    caller: { sendHour: { ...callerHour, count: callerHour.count + 1 } },
  };
}

export function isMagicLinkCodeLocked(
  guard: MagicLinkEmailGuard | undefined,
  nowMs: number
): boolean {
  return (
    typeof guard?.codeLockedUntil === "number" && guard.codeLockedUntil > nowMs
  );
}

/** Count one wrong typed code for an email; lock when the window fills. */
export function planMagicLinkCodeFailure(
  guard: MagicLinkEmailGuard | undefined,
  nowMs: number
): { codeFailures: WindowCounter; codeLockedUntil: number | null } {
  const window = currentWindow(
    guard?.codeFailures,
    MAGIC_LINK_CODE_FAILURE_WINDOW_MS,
    nowMs
  );
  const codeFailures = { ...window, count: window.count + 1 };
  return {
    codeFailures,
    codeLockedUntil:
      codeFailures.count >= MAGIC_LINK_CODE_FAILURE_LIMIT
        ? nowMs + MAGIC_LINK_CODE_LOCK_MS
        : null,
  };
}

/** Only the newest state for an email is usable; older ones are superseded. */
export function isLiveMagicLinkState(
  guard: MagicLinkEmailGuard | undefined,
  stateId: string
): boolean {
  return typeof guard?.liveState === "string" && guard.liveState === stateId;
}

export function parseMagicLinkSignInState(
  value: unknown,
  nowMs: number
): ResolvedMagicLinkSignInState | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as {
    email?: unknown;
    expiresAt?: { toMillis?: () => number };
  };
  const expiresAtMs = candidate.expiresAt?.toMillis?.();
  if (
    typeof candidate.email !== "string" ||
    !candidate.email ||
    typeof expiresAtMs !== "number" ||
    expiresAtMs <= nowMs
  ) {
    return null;
  }

  return { email: candidate.email, expiresAtMs };
}

function guardExpiry(nowMs: number): admin.firestore.Timestamp {
  // Long enough to outlive the daily send window; a TTL policy on this field
  // (if one is configured) clears idle guards.
  return admin.firestore.Timestamp.fromMillis(nowMs + DAY_MS + HOUR_MS);
}

/**
 * Create a sign-in state if the send limits allow it, and make it the only
 * live state for its email. Limit check, counter increments, the state write
 * and the live-state switch happen in one transaction. A Firestore failure
 * throws, so a send is refused when the limits cannot be read.
 */
export async function createMagicLinkSignInState(
  email: string,
  requestId: string,
  initiatingUid: string | null = null,
  callerAddress = "unknown",
  deps: MagicLinkStoreDeps = defaultDeps()
): Promise<MagicLinkSignInStateResult> {
  const { db } = deps;
  const state = randomBytes(32).toString("base64url");
  const oneTimeCode = randomInt(0, 1_000_000)
    .toString()
    .padStart(MAGIC_LINK_CODE_LENGTH, "0");
  const codeSalt = randomBytes(16);
  const codeHash = hashMagicLinkCode(oneTimeCode, codeSalt).toString("base64");

  const stateRef = db.collection(MAGIC_LINK_STATE_COLLECTION).doc(state);
  const emailRef = db
    .collection(MAGIC_LINK_EMAIL_GUARD_COLLECTION)
    .doc(magicLinkEmailKey(email));
  const callerRef = db
    .collection(MAGIC_LINK_CALLER_GUARD_COLLECTION)
    .doc(magicLinkCallerKey(callerAddress));

  return db.runTransaction(async (transaction) => {
    const now = deps.now();
    const expiresAtMs = now + MAGIC_LINK_STATE_LIFETIME_MS;
    const emailSnapshot = await transaction.get(emailRef);
    const callerSnapshot = await transaction.get(callerRef);
    const plan = planMagicLinkSend(
      emailSnapshot.data() as MagicLinkEmailGuard | undefined,
      callerSnapshot.data() as MagicLinkCallerGuard | undefined,
      now
    );
    if (!plan.allowed) return { status: "rate-limited" as const };

    transaction.set(stateRef, {
      email,
      requestId,
      codeSalt: codeSalt.toString("base64"),
      codeHash,
      codeAttempts: 0,
      codeConsumedAt: null,
      initiatingUid,
      createdAt: admin.firestore.Timestamp.fromMillis(now),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
    } satisfies MagicLinkSignInStateDocument);
    transaction.set(
      emailRef,
      {
        ...plan.email,
        liveState: state,
        expiresAt: guardExpiry(now),
      },
      { merge: true }
    );
    transaction.set(
      callerRef,
      { ...plan.caller, expiresAt: guardExpiry(now) },
      { merge: true }
    );

    return {
      status: "created" as const,
      state,
      expiresAtMs,
      oneTimeCode,
    };
  });
}

/**
 * Resolve the email behind an emailed link. Superseded states are refused,
 * but the typed-code lock is deliberately not consulted here: the link must
 * keep working while typed codes are locked.
 */
export async function resolveMagicLinkSignInState(
  state: string,
  deps: MagicLinkStoreDeps = defaultDeps()
): Promise<ResolvedMagicLinkSignInState | null> {
  if (!isMagicLinkStateId(state)) return null;

  const { db } = deps;
  const snapshot = await db
    .collection(MAGIC_LINK_STATE_COLLECTION)
    .doc(state)
    .get();
  if (!snapshot.exists) return null;

  const parsed = parseMagicLinkSignInState(snapshot.data(), deps.now());
  if (!parsed) return null;

  const guard = await db
    .collection(MAGIC_LINK_EMAIL_GUARD_COLLECTION)
    .doc(magicLinkEmailKey(parsed.email))
    .get();
  if (!isLiveMagicLinkState(guard.data() as MagicLinkEmailGuard, state)) {
    return null;
  }
  return parsed;
}

export function parseMagicLinkCodeState(
  value: unknown,
  nowMs: number
): ParsedMagicLinkCodeState | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as {
    email?: unknown;
    initiatingUid?: unknown;
    codeSalt?: unknown;
    codeHash?: unknown;
    codeAttempts?: unknown;
    codeConsumedAt?: unknown;
    expiresAt?: { toMillis?: () => number };
  };
  const expiresAtMs = candidate.expiresAt?.toMillis?.();
  if (
    typeof candidate.email !== "string" ||
    !candidate.email ||
    (candidate.initiatingUid !== null &&
      typeof candidate.initiatingUid !== "string") ||
    typeof candidate.codeSalt !== "string" ||
    typeof candidate.codeHash !== "string" ||
    typeof candidate.codeAttempts !== "number" ||
    candidate.codeAttempts < 0 ||
    candidate.codeAttempts >= MAGIC_LINK_CODE_MAX_ATTEMPTS ||
    candidate.codeConsumedAt != null ||
    typeof expiresAtMs !== "number" ||
    expiresAtMs <= nowMs
  ) {
    return null;
  }

  return {
    email: candidate.email,
    initiatingUid: candidate.initiatingUid,
    codeSalt: candidate.codeSalt,
    codeHash: candidate.codeHash,
    codeAttempts: candidate.codeAttempts,
  };
}

/**
 * Consume the code bound to a request. Invalid, expired, used, superseded and
 * per-state-exhausted codes share one "invalid" result so callers do not
 * expose account state. "locked" means typed codes for this email are paused
 * after too many wrong tries; it is the same for every address.
 */
export async function redeemMagicLinkCode(
  requestId: string,
  code: string,
  deps: MagicLinkStoreDeps = defaultDeps()
): Promise<MagicLinkCodeRedemption> {
  if (!isMagicLinkRequestId(requestId) || !isMagicLinkCode(code)) {
    return { status: "invalid" };
  }

  const { db } = deps;
  const snapshot = await db
    .collection(MAGIC_LINK_STATE_COLLECTION)
    .where("requestId", "==", requestId)
    .limit(1)
    .get();
  const match = snapshot.docs[0];
  if (!match) return { status: "invalid" };

  return db.runTransaction(async (transaction) => {
    const now = deps.now();
    const current = await transaction.get(match.ref);
    const parsed = parseMagicLinkCodeState(current.data(), now);
    if (!parsed) return { status: "invalid" as const };

    const emailRef = db
      .collection(MAGIC_LINK_EMAIL_GUARD_COLLECTION)
      .doc(magicLinkEmailKey(parsed.email));
    const guard = (await transaction.get(emailRef)).data() as
      | MagicLinkEmailGuard
      | undefined;
    if (!isLiveMagicLinkState(guard, match.ref.id)) {
      return { status: "invalid" as const };
    }
    if (isMagicLinkCodeLocked(guard, now)) {
      return { status: "locked" as const };
    }

    if (!verifyMagicLinkCode(code, parsed.codeSalt, parsed.codeHash)) {
      const failure = planMagicLinkCodeFailure(guard, now);
      transaction.update(match.ref, {
        codeAttempts: parsed.codeAttempts + 1,
      });
      transaction.set(
        emailRef,
        { ...failure, expiresAt: guardExpiry(now) },
        { merge: true }
      );
      return { status: "invalid" as const };
    }

    transaction.update(match.ref, {
      codeConsumedAt: admin.firestore.Timestamp.fromMillis(now),
    });
    return {
      status: "redeemed" as const,
      email: parsed.email,
      initiatingUid: parsed.initiatingUid,
    };
  });
}
