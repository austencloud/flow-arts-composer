/**
 * The save path's lifecycle event belongs to the account that made the save.
 *
 * This drives the REAL reporter from the REAL save service. The reporter stamps
 * the LIVE `auth.currentUser` uid as the event owner, so the save has to hand it
 * the account that actually did the work — including when that account is
 * NOTHING. A save can complete with `effectiveUserId === null` (ensureGuestIdentity
 * swallows its own failures), and passing `saverUid ?? undefined` there read as
 * "unscoped", so the milestone was attributed to whichever full account happened
 * to be signed in by the time the reporter ran.
 *
 * The save-service tests that mock the reporter cannot see any of this: they can
 * only assert the argument, not what the reporter does with it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const liveUid = { value: "account-C" as string | undefined };
const enqueueMock = vi.fn();
const dbPutMock = vi.fn().mockResolvedValue(undefined);
const dbGetMock = vi.fn().mockResolvedValue(undefined);
const dbCountMock = vi.fn().mockResolvedValue(0);
const dbUpdateMock = vi.fn().mockResolvedValue(1);

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$lib/shared/auth/firebase", () => ({
  auth: {
    authStateReady: async () => {},
    get currentUser() {
      return liveUid.value ? { uid: liveUid.value } : null;
    },
  },
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));
vi.mock("$lib/shared/auth/services/authed-fetch", () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("$lib/shared/analytics/services/posthog-lifecycle-outbox", () => ({
  enqueueLifecycleEvent: (...a: unknown[]) => enqueueMock(...a),
  dueLifecycleEvents: () => [],
  readLifecycleOutbox: () => [],
  getLifecycleOutboxStorage: () => ({}),
  deferLifecycleEvent: vi.fn(),
  removeLifecycleEvent: vi.fn(),
}));
vi.mock("$lib/shared/analytics/services/posthog", () => ({
  getCurrentPostHogSessionId: vi.fn().mockResolvedValue("session-1"),
}));
// NOT mocked: posthog-lifecycle-reporter. It is the boundary under test.

vi.mock("$lib/shared/persistence/database/tka-database", () => ({
  db: {
    sequences: {
      put: (...a: unknown[]) => dbPutMock(...a),
      get: (...a: unknown[]) => dbGetMock(...a),
      count: (...a: unknown[]) => dbCountMock(...a),
      update: (...a: unknown[]) => dbUpdateMock(...a),
    },
  },
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: true,
    user: null as { uid: string } | null,
    effectiveUserId: null as string | null,
  },
}));
vi.mock("$lib/shared/auth/services/guest-identity", () => ({
  ensureGuestIdentity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: { show: vi.fn(), offerGuestSaveNudge: vi.fn() },
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte.ts", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("$lib/shared/application/get-error-handler", () => ({
  getErrorHandler: () => ({ showUserError: vi.fn() }),
}));
vi.mock("$lib/shared/render/services/warm-sequence-cells", () => ({
  warmSequenceCells: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/share/state/image-composition-state.svelte.ts", () => ({
  getImageCompositionManager: () => ({ darkMode: true }),
}));
vi.mock("$lib/features/library/services/tag-manager", () => ({
  findTagByName: vi.fn().mockResolvedValue(undefined),
  createUserTag: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/library/services/sequence-content-hasher", () => ({
  computeHash: vi.fn().mockResolvedValue("hash-1"),
}));
vi.mock("$lib/features/library/services/library-sync-retry", () => ({
  markSequenceSyncStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock(
  "$lib/shared/library/services/sequence-persistence-coordinator",
  () => ({ clearSequenceDeletionIntent: vi.fn() })
);
vi.mock("$lib/features/library/state/library-state.svelte", () => ({
  libraryState: { loadSequences: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: {
    settings: {
      leftPropType: "club",
      rightPropType: "club",
      catDogMode: false,
    },
  },
}));

const { LibrarySaveService } =
  await import("$lib/features/library/services/library-save-service");
const { authState } = await import("$lib/shared/auth/state/auth-state.svelte");

function makeSequence(id = "seq-1") {
  return { id, steps: [{ letter: "A" }], thumbnails: [] } as any;
}
function makeOptions() {
  return { name: "A", visibility: "private" as const, tags: [], notes: "" };
}
function makeRepository() {
  return {
    hasMatchingContent: vi.fn().mockResolvedValue(false),
    saveSequenceWithMetadata: vi.fn().mockResolvedValue({}),
    attachThumbnail: vi.fn().mockResolvedValue(undefined),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  dbPutMock.mockResolvedValue(undefined);
  dbGetMock.mockResolvedValue(undefined);
  dbCountMock.mockResolvedValue(0);
  liveUid.value = "account-C";
  (authState as any).isAuthenticated = true;
  (authState as any).isAnonymous = true;
  (authState as any).effectiveUserId = null;
});

describe("sequence_save attribution at the real reporter boundary", () => {
  it("does not attribute a save made with NO identity to a signed-in account", async () => {
    // account-C is signed in by the time the reporter runs; it did not make
    // this save. Enqueuing under C would put a guest's milestone in C's funnel.
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    const result = await service.saveSequence(makeSequence(), makeOptions());

    expect(result.persisted).toBe(true);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("attributes a save to the guest account that made it", async () => {
    (authState as any).effectiveUserId = "anon-1";
    liveUid.value = "anon-1";
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    await service.saveSequence(makeSequence(), makeOptions());

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({
      ownerUid: "anon-1",
      envelope: expect.objectContaining({ event: "sequence_save" }),
    });
  });

  it("drops the event when the saver signed into another account mid-save", async () => {
    (authState as any).effectiveUserId = "anon-1";
    liveUid.value = "account-C";
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    const result = await service.saveSequence(makeSequence(), makeOptions());

    // The save itself still succeeds; only its misattributed event is dropped.
    expect(result.persisted).toBe(true);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
