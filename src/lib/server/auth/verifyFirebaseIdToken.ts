import {
  createRemoteJWKSet,
  jwtVerify,
  type CryptoKey,
  type JWK,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
} from "jose";

const FIREBASE_PROJECT_ID = "the-kinetic-alphabet";
const FIREBASE_ISSUER = "https://securetoken.google.com/" + FIREBASE_PROJECT_ID;
const FIREBASE_PUBLIC_KEYS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
);
const CLOCK_TOLERANCE_SECONDS = 5;

const firebasePublicKeys = createRemoteJWKSet(FIREBASE_PUBLIC_KEYS_URL, {
  timeoutDuration: 5_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60 * 1000,
});

export interface VerifiedFirebaseIdToken {
  uid: string;
  email?: string;
  name?: string;
  /** The token's iat, in seconds: when this ID token was minted. */
  issuedAt: number;
  authTime: number;
  admin?: boolean;
  isAdmin?: boolean;
  role?: string;
  signInProvider?: string;
}

type FirebaseVerificationKey = CryptoKey | JWK | JWTVerifyGetKey;

function requiredPastTimestamp(
  value: unknown,
  claim: string,
  nowSeconds: number
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value > nowSeconds + CLOCK_TOLERANCE_SECONDS
  ) {
    throw new Error("Firebase ID token has an invalid " + claim + " claim.");
  }
  return value;
}

/**
 * Creates a verifier around a fixed trusted key source. Production uses
 * Google's Firebase key set; tests provide an isolated generated key.
 */
export function createFirebaseIdTokenVerifier(
  key: FirebaseVerificationKey,
  now: () => number = Date.now
): (token: string) => Promise<VerifiedFirebaseIdToken> {
  return async (token: string): Promise<VerifiedFirebaseIdToken> => {
    const currentDate = new Date(now());
    const options: JWTVerifyOptions = {
      algorithms: ["RS256"],
      audience: FIREBASE_PROJECT_ID,
      issuer: FIREBASE_ISSUER,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate,
    };
    const { payload } =
      typeof key === "function"
        ? await jwtVerify(token, key, options)
        : await jwtVerify(token, key, options);
    const nowSeconds = Math.floor(currentDate.getTime() / 1000);

    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      payload.sub.length > 128
    ) {
      throw new Error("Firebase ID token has an invalid subject claim.");
    }
    const issuedAt = requiredPastTimestamp(
      payload.iat,
      "issued-at",
      nowSeconds
    );
    const authTime = requiredPastTimestamp(
      payload.auth_time,
      "authentication-time",
      nowSeconds
    );
    if (
      typeof payload.exp !== "number" ||
      payload.exp <= nowSeconds - CLOCK_TOLERANCE_SECONDS
    ) {
      throw new Error("Firebase ID token has expired.");
    }

    const firebaseClaims =
      payload.firebase &&
      typeof payload.firebase === "object" &&
      !Array.isArray(payload.firebase)
        ? (payload.firebase as Record<string, unknown>)
        : null;
    const signInProvider =
      typeof firebaseClaims?.sign_in_provider === "string"
        ? firebaseClaims.sign_in_provider
        : undefined;

    return {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      issuedAt,
      authTime,
      admin: payload.admin === true ? true : undefined,
      isAdmin: payload.isAdmin === true ? true : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      ...(signInProvider ? { signInProvider } : {}),
    };
  };
}

export const verifyFirebaseIdToken =
  createFirebaseIdTokenVerifier(firebasePublicKeys);
