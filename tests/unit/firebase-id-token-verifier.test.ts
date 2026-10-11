import { beforeAll, describe, expect, it } from "vitest";
import {
  generateKeyPairSync,
  sign as signBytes,
  type KeyObject,
} from "node:crypto";
import type { JWK } from "jose";
import { hasAdminClaim } from "../../src/lib/server/auth/requireAdmin";
import {
  createFirebaseIdTokenVerifier,
  type VerifiedFirebaseIdToken,
} from "../../src/lib/server/auth/verifyFirebaseIdToken";

const PROJECT_ID = "the-kinetic-alphabet";
const ISSUER = "https://securetoken.google.com/" + PROJECT_ID;
const NOW_SECONDS = 1_784_664_000;
const NOW_MILLISECONDS = NOW_SECONDS * 1000;

let privateKey: KeyObject;
let publicKey: JWK;

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = pair.privateKey;
  publicKey = {
    ...(pair.publicKey.export({ format: "jwk" }) as JWK),
    alg: "RS256",
    kid: "test-key",
    use: "sig",
  };
});

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function tokenWith(
  overrides: {
    audience?: string;
    expiresAt?: number;
    authTime?: number;
    claims?: Record<string, unknown>;
  } = {}
): Promise<string> {
  const header = encodeJson({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const payload = encodeJson({
    auth_time: overrides.authTime ?? NOW_SECONDS - 60,
    email: "admin@example.com",
    name: "Admin",
    admin: true,
    role: "admin",
    ...overrides.claims,
    iss: ISSUER,
    aud: overrides.audience ?? PROJECT_ID,
    sub: "admin-user",
    iat: NOW_SECONDS - 60,
    exp: overrides.expiresAt ?? NOW_SECONDS + 3_600,
  });
  const signingInput = header + "." + payload;
  const signature = signBytes(
    "RSA-SHA256",
    Buffer.from(signingInput),
    privateKey
  ).toString("base64url");
  return signingInput + "." + signature;
}

describe("Firebase ID token verification", () => {
  it("verifies the signature and exposes trusted identity claims", async () => {
    const verify = createFirebaseIdTokenVerifier(
      publicKey,
      () => NOW_MILLISECONDS
    );

    await expect(verify(await tokenWith())).resolves.toEqual({
      uid: "admin-user",
      email: "admin@example.com",
      name: "Admin",
      issuedAt: NOW_SECONDS - 60,
      authTime: NOW_SECONDS - 60,
      admin: true,
      isAdmin: undefined,
      role: "admin",
    });
  });

  it("rejects a token issued for another Firebase project", async () => {
    const verify = createFirebaseIdTokenVerifier(
      publicKey,
      () => NOW_MILLISECONDS
    );

    await expect(
      verify(await tokenWith({ audience: "another-project" }))
    ).rejects.toMatchObject({ code: "ERR_JWT_CLAIM_VALIDATION_FAILED" });
  });

  it("rejects expired tokens", async () => {
    const verify = createFirebaseIdTokenVerifier(
      publicKey,
      () => NOW_MILLISECONDS
    );

    await expect(
      verify(await tokenWith({ expiresAt: NOW_SECONDS - 60 }))
    ).rejects.toMatchObject({ code: "ERR_JWT_EXPIRED" });
  });

  it("rejects authentication timestamps from the future", async () => {
    const verify = createFirebaseIdTokenVerifier(
      publicKey,
      () => NOW_MILLISECONDS
    );

    await expect(
      verify(await tokenWith({ authTime: NOW_SECONDS + 60 }))
    ).rejects.toThrow("invalid authentication-time claim");
  });

  it("exposes the signed Firebase provider used to distinguish full accounts", async () => {
    const verify = createFirebaseIdTokenVerifier(
      publicKey,
      () => NOW_MILLISECONDS
    );

    await expect(
      verify(
        await tokenWith({
          claims: {
            firebase: { sign_in_provider: "password" },
          },
        })
      )
    ).resolves.toMatchObject({
      uid: "admin-user",
      signInProvider: "password",
    });
  });
});

describe("admin claim authorization", () => {
  const user = (claims: Partial<VerifiedFirebaseIdToken>) =>
    ({
      uid: "user",
      issuedAt: NOW_SECONDS,
      authTime: NOW_SECONDS,
      ...claims,
    }) as VerifiedFirebaseIdToken;

  it("accepts each supported signed admin claim", () => {
    expect(hasAdminClaim(user({ admin: true }))).toBe(true);
    expect(hasAdminClaim(user({ isAdmin: true }))).toBe(true);
    expect(hasAdminClaim(user({ role: "admin" }))).toBe(true);
  });

  it("rejects a token without an admin claim", () => {
    expect(hasAdminClaim(user({ role: "user" }))).toBe(false);
  });
});
