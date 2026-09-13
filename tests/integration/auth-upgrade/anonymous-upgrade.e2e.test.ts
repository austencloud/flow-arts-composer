// End-to-end integration test for the guest-continuity auth flow.
//
// Runs the REAL wrapper functions (ensureGuestIdentity / upgradeAnonymousWithEmail
// / importDrafts) against the Firebase AUTH EMULATOR. The two heavy deps are
// mocked: the app's HMR-heavy `$lib/shared/auth/firebase` module (replaced with a
// thin getAuthInstance that returns a real emulator-connected Auth), and the
// library repository (replaced with a recording stub).
//
// Requires the auth emulator on 127.0.0.1:9099. Run via `pnpm run test:e2e`,
// which wraps this in `firebase emulators:exec --only auth`.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  type Auth,
} from "firebase/auth";

const EMULATOR_HOST = "http://127.0.0.1:9099";
const PROJECT_ID = "the-kinetic-alphabet";
const ACCOUNTS_ENDPOINT = `${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;

// vi.mock factories are hoisted above imports, so they can't close over a normal
// top-level `let`. Shared mutable refs via vi.hoisted bridge that gap.
const h = vi.hoisted(() => ({
  testAuth: null as Auth | null,
  repo: null as any,
  /** Ids the anon uid recorded as its own (saved-sequence-ledger). */
  ledgerIds: [] as string[],
  /** Rows sitting in this device's Dexie store. */
  dexieRows: [] as any[],
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: async () => h.testAuth,
}));

vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => h.repo,
}));

// notifyUpgradeSignup() fires `getPropUnlockManager().mergeGuestCollection()` on
// the linked path. The real manager pulls in a `.svelte.ts` $state rune module,
// which can't compile in this plugin-less emulator config. Stub it — the upgrade
// logic under test doesn't depend on the merge.
vi.mock("$lib/shared/gamification/get-prop-unlock-manager", () => ({
  getPropUnlockManager: () => ({ mergeGuestCollection: () => undefined }),
}));

// toast-state is a `.svelte.ts` $state rune module — same plugin-less-compile
// problem. notifyUpgradeSignup() calls toast.success() on the linked path.
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { success: () => undefined, error: () => undefined },
}));

// last-auth-method is a `.svelte.ts` $state rune module too, imported directly
// by anonymous-upgrade. Without this the file threw "$state is not defined" at
// import time and the whole suite silently collected ZERO tests.
vi.mock("$lib/shared/auth/services/last-auth-method.svelte", () => ({
  recordLastAuthMethod: () => undefined,
}));

// captureAnonymousDrafts reads LOCAL Dexie rows filtered by the per-uid ledger
// — NOT the repository. (It used to read Firestore via repo.getUserSequences;
// SP2 moved the capture source because a guest's fresh save may never have
// reached the cloud.) Both sides are stubbed here: the ledger reads
// localStorage, which this node-environment suite has none of, and Dexie needs
// a browser IndexedDB.
vi.mock("$lib/shared/library/services/saved-sequence-ledger", () => ({
  getSavedSequenceIds: () => h.ledgerIds,
  getOwnedSequenceIdSet: () => new Set(h.ledgerIds),
  recordSavedSequenceId: () => undefined,
  removeSavedSequenceIds: () => undefined,
}));
vi.mock("$lib/shared/persistence/services/dexie-persistence-service", () => ({
  getAllSequences: async () => h.dexieRows,
}));

// Static imports are fine: vi.mock is hoisted above them, so these resolve to
// the mocked modules.
import { ensureGuestIdentity } from "$lib/shared/auth/services/guest-identity";
import {
  importDrafts,
  upgradeAnonymousWithEmail,
} from "$lib/shared/auth/services/anonymous-upgrade";

/** Minimal fake draft. The repo is stubbed, so the exact shape doesn't matter. */
function makeDraft(id: string) {
  return { id, word: id.toUpperCase(), steps: [] } as any;
}

/** Fresh recording repo stub for each test. */
function makeRepoStub() {
  return {
    getUserSequences: vi.fn(async (_uid: string) => [] as any[]),
    saveSequence: vi.fn(async (_seq: any) => undefined),
  };
}

async function clearEmulatorAccounts() {
  await fetch(ACCOUNTS_ENDPOINT, { method: "DELETE" });
}

describe("anonymous identity upgrade (auth emulator E2E)", () => {
  beforeAll(() => {
    const testApp = initializeApp(
      { projectId: PROJECT_ID, apiKey: "fake-api-key" },
      "e2e-test"
    );
    const testAuth = getAuth(testApp);
    connectAuthEmulator(testAuth, EMULATOR_HOST, { disableWarnings: true });
    h.testAuth = testAuth;
  });

  beforeEach(async () => {
    // signOut clears testAuth.currentUser so ensureGuestIdentity starts clean;
    // the REST DELETE wipes the emulator's account store so collisions / uid
    // reuse can't leak across tests.
    await signOut(h.testAuth!);
    await clearEmulatorAccounts();
    h.repo = makeRepoStub();
    h.ledgerIds = [];
    h.dexieRows = [];
  });

  it("1. lazily provisions an anonymous identity and is idempotent", async () => {
    expect(h.testAuth!.currentUser).toBeNull();

    await ensureGuestIdentity();
    const user = h.testAuth!.currentUser;
    expect(user).not.toBeNull();
    expect(user!.isAnonymous).toBe(true);

    const firstUid = user!.uid;

    // Second call is a no-op: same uid, no new account minted.
    await ensureGuestIdentity();
    expect(h.testAuth!.currentUser!.uid).toBe(firstUid);
  });

  it("2. links email in place, preserving the anon uid (happy path)", async () => {
    await ensureGuestIdentity();
    const anonUid = h.testAuth!.currentUser!.uid;

    // Capture still runs on the link path. Nothing needs importing here — the
    // uid survives, so the drafts stay attached to it — but the capture must
    // not blow up or mis-scope on the way through.
    h.dexieRows = [makeDraft("d1"), makeDraft("d2"), makeDraft("someone-else")];
    h.ledgerIds = ["d1", "d2"];

    const res = await upgradeAnonymousWithEmail(
      "newuser@example.com",
      "password123"
    );

    expect(res.status).toBe("linked");

    const user = h.testAuth!.currentUser!;
    expect(user.uid).toBe(anonUid); // SAME uid — linked in place
    expect(user.isAnonymous).toBe(false);

    // Email provider is now linked onto the (formerly anon) account.
    const providerIds = user.providerData.map((p) => p.providerId);
    expect(providerIds).toContain("password");
  });

  it("3. collision signs into the existing account and offers drafts to import", async () => {
    // Pre-create a permanent account, then drop the session so the upgrade
    // starts from a fresh anon user.
    await createUserWithEmailAndPassword(
      h.testAuth!,
      "taken@example.com",
      "password123"
    );
    await signOut(h.testAuth!);

    await ensureGuestIdentity();
    const anonUid = h.testAuth!.currentUser!.uid;
    expect(h.testAuth!.currentUser!.isAnonymous).toBe(true);

    // The guest's own local saves: rows in this device's Dexie store that the
    // anon uid recorded in its ledger. Capture reads exactly this intersection,
    // so a prior user's rows on a shared device are never swept into the
    // colliding account.
    h.dexieRows = [makeDraft("d1"), makeDraft("d2"), makeDraft("someone-else")];
    h.ledgerIds = ["d1", "d2"];

    const res = await upgradeAnonymousWithEmail(
      "taken@example.com",
      "password123"
    );

    expect(res.status).toBe("collision-signed-in");
    expect(res.importable).toBeDefined();
    expect(res.importable!.map((d: any) => d.id).sort()).toEqual(["d1", "d2"]);
    // The unowned row on the same device is NOT captured.
    expect(res.importable!.some((d: any) => d.id === "someone-else")).toBe(
      false
    );

    const user = h.testAuth!.currentUser!;
    expect(user.uid).not.toBe(anonUid); // signed into the pre-existing account
    expect(user.isAnonymous).toBe(false);
  });

  it("4. importDrafts copies drafts, settles duplicates, and returns what still needs retrying", async () => {
    // First save succeeds, second is a duplicate (ALREADY_EXISTS): already safe
    // in the account, so it is settled rather than pending work.
    h.repo.saveSequence
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: "ALREADY_EXISTS" });

    const first = await importDrafts([makeDraft("dA"), makeDraft("dB")]);
    expect(first.imported).toBe(1);
    expect(first.failed).toEqual([]);
    expect(h.repo.saveSequence).toHaveBeenCalledTimes(2);

    // A retryable error is REPORTED, not thrown: throwing out of the loop
    // abandoned every draft behind the failing one and discarded the count of
    // the ones already written, which is how a single offline write used to
    // lose the rest of a guest's work (audit F3).
    h.repo.saveSequence.mockReset();
    h.repo.saveSequence
      .mockRejectedValueOnce({ code: "SOMETHING_ELSE" })
      .mockResolvedValueOnce(undefined);

    const second = await importDrafts([makeDraft("dC"), makeDraft("dD")]);
    // The draft AFTER the failure was still attempted.
    expect(h.repo.saveSequence).toHaveBeenCalledTimes(2);
    expect(second.imported).toBe(1);
    expect(second.failed.map((d: any) => d.id)).toEqual(["dC"]);
  });

  it("5. importDrafts carries each draft's recorded visibility to the repository", async () => {
    // A guest's Dexie row records its saved visibility only under
    // pendingSyncMetadata, and the repository defaults an unspecified
    // visibility to "public" — so importing without it republished private
    // guest work once the importing session was a full account (audit F2).
    const priv = makeDraft("dPriv");
    priv.pendingSyncMetadata = { visibility: "private", notes: "mine" };
    const pub = makeDraft("dPub");
    pub.pendingSyncMetadata = { visibility: "public", notes: "" };

    await importDrafts([priv, pub, makeDraft("dNone")]);

    expect(h.repo.saveSequence).toHaveBeenNthCalledWith(
      1,
      priv,
      expect.objectContaining({ visibility: "private", notes: "mine" })
    );
    expect(h.repo.saveSequence).toHaveBeenNthCalledWith(
      2,
      pub,
      expect.objectContaining({ visibility: "public" })
    );
    // Nothing recorded → private. An import preserves work; it does not make a
    // publication decision on the user's behalf.
    expect(h.repo.saveSequence).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({ visibility: "private" })
    );
  });
});
