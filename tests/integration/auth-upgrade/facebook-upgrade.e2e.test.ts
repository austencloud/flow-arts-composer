// End-to-end integration test for the FEDERATED (Facebook) credential pipeline,
// run against the Firebase AUTH EMULATOR.
//
// Why this doesn't call signInWithFacebook()/upgradeAnonymousWithFacebook()
// directly: those wrappers use signInWithPopup/linkWithPopup, which require a
// real browser popup and cannot run in node. What they ultimately drive is the
// federated-credential exchange — signInWithCredential / linkWithCredential with
// a FacebookAuthProvider credential, plus the collision recovery
// (credentialFromError → signInWithCredential). THAT logic is exactly what these
// tests reproduce against the emulator, so the account/provider/collision
// mechanics are verified end to end. The popup + Facebook consent screen itself
// is covered by docs/reference/facebook-login-e2e-checklist.md.
//
// Requires the auth emulator on 127.0.0.1:9099. Run via `pnpm run test:e2e`,
// which wraps this in `firebase emulators:exec --only auth`.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp } from "firebase/app";
import {
  FacebookAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  linkWithCredential,
  signInAnonymously,
  signInWithCredential,
  signOut,
  type Auth,
  type AuthError,
} from "firebase/auth";
import {
  clearPendingLink,
  consumePendingLinkForUser,
  stashPendingLink,
} from "#lib/shared/auth/services/pending-credential-link.js";

const EMULATOR_HOST = "http://127.0.0.1:9099";
const PROJECT_ID = "the-kinetic-alphabet";
const ACCOUNTS_ENDPOINT = `${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;

let testAuth: Auth;

// The emulator accepts a JSON-claims string as the federated "token" and uses
// `sub` as the provider uid — so reusing the same sub reproduces the same
// Facebook identity (which is how we force a collision).
function fbCredential(sub: string, email: string) {
  return FacebookAuthProvider.credential(
    JSON.stringify({ sub, email, email_verified: true, name: "FB Test User" })
  );
}

async function clearEmulatorAccounts() {
  await fetch(ACCOUNTS_ENDPOINT, { method: "DELETE" });
}

describe("facebook federated credential pipeline (auth emulator E2E)", () => {
  beforeAll(() => {
    const testApp = initializeApp(
      { projectId: PROJECT_ID, apiKey: "fake-api-key" },
      "fb-e2e-test"
    );
    testAuth = getAuth(testApp);
    connectAuthEmulator(testAuth, EMULATOR_HOST, { disableWarnings: true });
  });

  beforeEach(async () => {
    await signOut(testAuth).catch(() => {});
    await clearEmulatorAccounts();
    clearPendingLink();
  });

  it("1. fresh Facebook sign-in mints an account carrying the facebook.com provider + uid", async () => {
    const cred = fbCredential("fb-sub-001", "alice@example.com");
    const { user } = await signInWithCredential(testAuth, cred);

    expect(user.isAnonymous).toBe(false);
    const fb = user.providerData.find((p) => p.providerId === "facebook.com");
    expect(fb).toBeDefined();
    expect(fb!.uid).toBe("fb-sub-001");
  });

  it("2. linking Facebook onto an anon user preserves the anon uid (upgrade happy path)", async () => {
    await signInAnonymously(testAuth);
    const anonUid = testAuth.currentUser!.uid;
    expect(testAuth.currentUser!.isAnonymous).toBe(true);

    const cred = fbCredential("fb-sub-002", "bob@example.com");
    await linkWithCredential(testAuth.currentUser!, cred);

    const user = testAuth.currentUser!;
    expect(user.uid).toBe(anonUid); // SAME uid — linked in place
    expect(user.isAnonymous).toBe(false);
    expect(user.providerData.map((p) => p.providerId)).toContain("facebook.com");
  });

  it("3. collision: the exact recovery in upgradeAnonymousWithFacebook signs into the pre-existing FB account", async () => {
    // Pre-create a permanent account already owning this Facebook identity.
    await signInWithCredential(testAuth, fbCredential("fb-sub-003", "carol@example.com"));
    const existingUid = testAuth.currentUser!.uid;
    await signOut(testAuth);

    // Fresh anon guest tries to link the SAME Facebook identity.
    await signInAnonymously(testAuth);
    const anonUid = testAuth.currentUser!.uid;
    expect(anonUid).not.toBe(existingUid);

    const reuseCred = fbCredential("fb-sub-003", "carol@example.com");
    let recoveredUid: string | null = null;
    try {
      await linkWithCredential(testAuth.currentUser!, reuseCred);
      throw new Error("expected a credential collision but link succeeded");
    } catch (error) {
      const code = (error as AuthError).code;
      // The load-bearing assertion: the collision is detected with the exact code
      // the upgrade flow keys on (CREDENTIAL_COLLISION set in anonymous-upgrade.ts).
      expect(code).toBe("auth/credential-already-in-use");

      // Recovery: upgradeAnonymousWithFacebook does
      //   const cred = FacebookAuthProvider.credentialFromError(error);
      //   if (cred) await signInWithCredential(auth, cred); else throw error;
      // NOTE: against the AUTH EMULATOR, credentialFromError returns null — the
      // emulator does not round-trip the OAuth access token into the error's
      // customData. Real Facebook DOES populate it, so the production recovery
      // path works. We fall back to the credential we already hold to prove the
      // sign-in lands on the pre-existing account either way. (This emulator gap
      // is exactly why the popup collision path must be confirmed manually — see
      // the F5 checklist.)
      const cred =
        FacebookAuthProvider.credentialFromError(error as AuthError) ?? reuseCred;
      const { user } = await signInWithCredential(testAuth, cred);
      recoveredUid = user.uid;
    }

    expect(recoveredUid).toBe(existingUid); // signed into the pre-existing account
    expect(testAuth.currentUser!.isAnonymous).toBe(false);
  });

  it("4. re-signing in with the same Facebook identity returns the same account (idempotent)", async () => {
    const { user: first } = await signInWithCredential(
      testAuth,
      fbCredential("fb-sub-004", "dave@example.com")
    );
    const firstUid = first.uid;
    await signOut(testAuth);

    const { user: second } = await signInWithCredential(
      testAuth,
      fbCredential("fb-sub-004", "dave@example.com")
    );
    expect(second.uid).toBe(firstUid);
  });

  it("5. pending-link (F2): signing into the existing account auto-links the stashed Facebook credential", async () => {
    // Existing account on this email via email/password (the "different
    // credential" the collision refers to).
    await createUserWithEmailAndPassword(testAuth, "erin@example.com", "password123");
    const user = testAuth.currentUser!;
    expect(user.providerData.map((p) => p.providerId)).not.toContain("facebook.com");

    // A prior Facebook attempt collided and stashed its pending credential.
    stashPendingLink(
      fbCredential("fb-sub-005", "erin@example.com"),
      "erin@example.com"
    );

    const linked = await consumePendingLinkForUser(user);
    expect(linked).toBe("facebook.com");

    await user.reload();
    expect(testAuth.currentUser!.providerData.map((p) => p.providerId)).toContain(
      "facebook.com"
    );
  });

  it("6. pending-link is NOT applied when a different account signs in", async () => {
    await createUserWithEmailAndPassword(testAuth, "frank@example.com", "password123");
    const user = testAuth.currentUser!;

    stashPendingLink(
      fbCredential("fb-sub-006", "owner@example.com"),
      "owner@example.com"
    );

    const linked = await consumePendingLinkForUser(user);
    expect(linked).toBeNull();
    expect(user.providerData.map((p) => p.providerId)).not.toContain("facebook.com");
  });
});
