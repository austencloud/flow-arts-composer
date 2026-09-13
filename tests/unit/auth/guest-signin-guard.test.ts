/**
 * A guest signing in through the plain authenticator entry points must be
 * UPGRADED in place, not replaced.
 *
 * `signInWithEmail` / `signInWithGoogle` swap the anonymous uid out. Everything
 * the guest saved is keyed to that uid — the Dexie rows through the
 * saved-sequence ledger, the Firestore docs through the uid itself — so a plain
 * sign-in abandons all of it with no link attempt and no draft capture, and
 * without even offering the import that the collision path offers.
 *
 * The signup modal's callers (SocialAuthCompact, AccountPopover) branch on
 * isAnonymous themselves, so they never reached this. The retro win95 login
 * dialog (RetroLoginDialog.svelte) and the DOS shell's LOGIN command
 * (command-parser.ts) call straight through, and were losing guest work.
 *
 * Regression cover for F4 of
 * docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const firebaseSignInWithEmailAndPassword = vi.fn().mockResolvedValue({});
const firebaseSignInWithPopup = vi.fn().mockResolvedValue({});
const upgradeAnonymousWithEmailMock = vi
  .fn()
  .mockResolvedValue({ status: "linked" });
const upgradeAnonymousWithGoogleMock = vi
  .fn()
  .mockResolvedValue({ status: "linked" });
const promptAnonymousImportMock = vi.fn();

/** Swapped per test to model "a guest is signed in" vs "nobody is". */
const currentUser = { value: null as { isAnonymous: boolean } | null };

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: vi.fn() },
  FacebookAuthProvider: class {
    addScope() {}
    static credentialFromError() {
      return null;
    }
  },
  GoogleAuthProvider: class {
    addScope() {}
    static credential() {
      return {};
    }
    static credentialFromError() {
      return null;
    }
  },
  createUserWithEmailAndPassword: vi.fn(),
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailAndPassword: (...a: unknown[]) =>
    firebaseSignInWithEmailAndPassword(...a),
  signInWithPopup: (...a: unknown[]) => firebaseSignInWithPopup(...a),
  signOut: vi.fn(),
  unlink: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  auth: {},
  configureAuthPersistence: vi.fn().mockResolvedValue(undefined),
  getAuthInstance: async () => ({ currentUser: currentUser.value }),
}));
vi.mock("$lib/shared/auth/services/anonymous-upgrade", () => ({
  captureAnonymousDrafts: vi.fn().mockResolvedValue([]),
  notifyUpgradeSignup: vi.fn().mockResolvedValue(undefined),
  reportGuestUpgradeLifecycle: vi.fn().mockResolvedValue(undefined),
  upgradeAnonymousWithEmail: (...a: unknown[]) =>
    upgradeAnonymousWithEmailMock(...a),
  upgradeAnonymousWithFacebook: vi.fn(),
  upgradeAnonymousWithGoogle: (...a: unknown[]) =>
    upgradeAnonymousWithGoogleMock(...a),
  upgradeAnonymousWithGoogleCredential: vi.fn(),
}));
vi.mock("$lib/shared/auth/state/anonymous-import-prompt.svelte", () => ({
  promptAnonymousImport: (...a: unknown[]) => promptAnonymousImportMock(...a),
}));
vi.mock("$lib/shared/auth/services/pending-credential-link", () => ({
  clearPendingLink: vi.fn(),
  stashPendingLink: vi.fn(),
}));
vi.mock("$lib/shared/auth/services/last-auth-method.svelte", () => ({
  recordLastAuthMethod: vi.fn(),
}));
vi.mock("$lib/shared/auth/services/instagram-auth", () => ({
  authenticateWithInstagram: vi.fn(),
  disconnectInstagramAccount: vi.fn(),
}));
vi.mock("$lib/shared/desktop/is-desktop", () => ({ isDesktop: () => false }));
vi.mock("$lib/shared/platform/services/platform-detector", () => ({
  isNative: () => false,
}));

const { signInWithEmail, signInWithGoogle } =
  await import("$lib/shared/auth/services/authenticator");

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = null;
  upgradeAnonymousWithEmailMock.mockResolvedValue({ status: "linked" });
  upgradeAnonymousWithGoogleMock.mockResolvedValue({ status: "linked" });
});

describe("signInWithEmail — guest guard", () => {
  it("upgrades an anonymous guest in place instead of signing in over them", async () => {
    currentUser.value = { isAnonymous: true };

    await signInWithEmail("a@example.com", "pw");

    expect(upgradeAnonymousWithEmailMock).toHaveBeenCalledWith(
      "a@example.com",
      "pw"
    );
    // The plain sign-in is what abandons the anonymous uid.
    expect(firebaseSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("offers the drafts back when the credential already owns an account", async () => {
    currentUser.value = { isAnonymous: true };
    const drafts = [{ id: "d1" }];
    upgradeAnonymousWithEmailMock.mockResolvedValue({
      status: "collision-signed-in",
      importable: drafts,
    });

    await signInWithEmail("a@example.com", "pw");

    expect(promptAnonymousImportMock).toHaveBeenCalledWith(drafts);
  });

  it("signs in normally when there is no guest session to preserve", async () => {
    currentUser.value = null;

    await signInWithEmail("a@example.com", "pw");

    expect(upgradeAnonymousWithEmailMock).not.toHaveBeenCalled();
    expect(firebaseSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });

  it("does not divert a full account that is already signed in", async () => {
    currentUser.value = { isAnonymous: false };

    await signInWithEmail("a@example.com", "pw");

    expect(upgradeAnonymousWithEmailMock).not.toHaveBeenCalled();
    expect(firebaseSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
  });
});

describe("signInWithGoogle — guest guard", () => {
  it("upgrades an anonymous guest in place instead of signing in over them", async () => {
    currentUser.value = { isAnonymous: true };

    await signInWithGoogle();

    expect(upgradeAnonymousWithGoogleMock).toHaveBeenCalledTimes(1);
    expect(firebaseSignInWithPopup).not.toHaveBeenCalled();
  });

  it("offers the drafts back on a collision", async () => {
    currentUser.value = { isAnonymous: true };
    const drafts = [{ id: "d1" }];
    upgradeAnonymousWithGoogleMock.mockResolvedValue({
      status: "collision-signed-in",
      importable: drafts,
    });

    await signInWithGoogle();

    expect(promptAnonymousImportMock).toHaveBeenCalledWith(drafts);
  });

  it("falls through to the ordinary popup when there is no guest", async () => {
    currentUser.value = null;

    await signInWithGoogle();

    expect(upgradeAnonymousWithGoogleMock).not.toHaveBeenCalled();
    expect(firebaseSignInWithPopup).toHaveBeenCalledTimes(1);
  });
});
