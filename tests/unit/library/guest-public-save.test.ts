/**
 * A guest's save never tries to publish.
 *
 * Only a full account can post to the community gallery (firestore.rules
 * refuses an anonymous public write). New saves of four or more steps used to
 * start with Public on for guests too, so a guest's save landed on the device
 * and then the publish was refused, surfacing a raw "Couldn't publish" box of
 * technical text, plus two stacked toasts, one of them in English (Lupe's
 * visitor replay, 2026-11-15).
 *
 * The save service now keeps a guest's save private and attempts no public
 * write. A guest who chose Public hears, in one translated toast, that
 * publishing needs an account; the caller skips its own success toast.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbPutMock = vi.fn().mockResolvedValue(undefined);

vi.mock("#lib/shared/persistence/database/tka-database.js", () => ({
  db: {
    sequences: {
      put: (...a: unknown[]) => dbPutMock(...a),
      get: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue(1),
    },
  },
}));
vi.mock("#lib/shared/library/services/saved-sequence-ledger.js", () => ({
  recordSavedSequenceId: vi.fn(),
  getSavedSequenceIds: () => [],
  getOwnedSequenceIdSet: () => new Set<string>(),
  removeSavedSequenceIds: vi.fn(),
  recordUnownedSequenceId: vi.fn(),
  getUnownedSequenceIds: () => [],
  adoptUnownedSequenceIds: () => [],
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    isAuthenticated: true,
    isAnonymous: true,
    user: { uid: "guest-1" },
    effectiveUserId: "guest-1",
  },
}));
vi.mock("#lib/shared/auth/services/guest-identity.js", () => ({
  ensureGuestIdentity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: {
    show: vi.fn(),
    offerGuestSaveNudge: vi.fn().mockReturnValue(true),
    offerPublishAccount: vi.fn().mockReturnValue(true),
  },
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.ts", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: vi.fn() }),
}));
vi.mock("#lib/shared/render/services/warm-sequence-cells.js", () => ({
  warmSequenceCells: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("#lib/shared/share/state/image-composition-state.svelte.ts", () => ({
  getImageCompositionManager: () => ({ darkMode: true }),
}));
vi.mock("#lib/features/library/services/tag-manager.js", () => ({
  findTagByName: vi.fn().mockResolvedValue(undefined),
  createUserTag: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("#lib/shared/library/services/sequence-content-hasher.js", () => ({
  computeHash: vi.fn().mockResolvedValue("hash-1"),
}));
vi.mock("#lib/features/library/services/library-sync-retry.js", () => ({
  markSequenceSyncStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock(
  "#lib/shared/library/services/sequence-persistence-coordinator.js",
  () => ({ clearSequenceDeletionIntent: vi.fn() })
);
vi.mock("#lib/shared/analytics/services/posthog-lifecycle-reporter.js", () => ({
  reportPostHogLifecycleEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("#lib/features/library/state/library-state.svelte.js", () => ({
  libraryState: { loadSequences: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: {
    settings: {
      leftPropType: "club",
      rightPropType: "club",
      catDogMode: false,
    },
  },
}));

const { LibrarySaveService } =
  await import("#lib/features/library/services/library-save-service.js");
const { authState } =
  await import("#lib/shared/auth/state/auth-state.svelte.js");
const { authDrawerState } =
  await import("#lib/shared/auth/state/auth-drawer-state.svelte.js");
const { t } = await import("#lib/shared/i18n/i18n.svelte.js");

// Four steps: enough for the community gallery, so only the account decides.
const fourSteps = [
  { letter: "A" },
  { letter: "B" },
  { letter: "C" },
  { letter: "D" },
];
function makeSequence() {
  return { id: "seq-1", steps: fourSteps, thumbnails: [] } as any;
}
function makeRepository() {
  return {
    hasMatchingContent: vi.fn().mockResolvedValue(false),
    saveSequenceWithMetadata: vi.fn().mockResolvedValue({}),
    attachThumbnail: vi.fn().mockResolvedValue(undefined),
  } as any;
}
function signInAs(kind: "guest" | "account") {
  (authState as any).isAuthenticated = true;
  (authState as any).isAnonymous = kind === "guest";
  (authState as any).effectiveUserId = kind === "guest" ? "guest-1" : "u1";
}
const cloudVisibility = (repo: any) =>
  repo.saveSequenceWithMetadata.mock.calls[0]?.[1]?.visibility;
const localVisibility = () =>
  dbPutMock.mock.calls[0]?.[0]?.pendingSyncMetadata?.visibility;

beforeEach(() => {
  vi.clearAllMocks();
  dbPutMock.mockResolvedValue(undefined);
  vi.mocked(authDrawerState.offerGuestSaveNudge).mockReturnValue(true);
  vi.mocked(authDrawerState.offerPublishAccount).mockReturnValue(true);
  // The account offer is a browser toast; the service skips it without a window.
  vi.stubGlobal("window", globalThis);
});

describe("a guest's save never tries to publish", () => {
  it("keeps a guest's chosen public save private and offers the account instead", async () => {
    signInAs("guest");
    const repo = makeRepository();
    const service = new LibrarySaveService(null, null, repo, null);

    const result = await service.saveSequence(makeSequence(), {
      name: "ABCD",
      visibility: "public",
      tags: [],
      notes: "",
    });

    // Nothing public is written anywhere: not the cloud copy, not the local
    // row the background retry and a later account import read from.
    expect(cloudVisibility(repo)).toBe("private");
    expect(localVisibility()).toBe("private");
    expect(result).toMatchObject({
      persisted: true,
      isGuest: true,
      keptPrivateForGuest: true,
      accountAskShown: true,
    });
    // One toast, in the visitor's language, that says why.
    expect(authDrawerState.offerPublishAccount).toHaveBeenCalledExactlyOnceWith(
      t("guest_save_public_needs_account")
    );
    expect(authDrawerState.offerGuestSaveNudge).not.toHaveBeenCalled();
  });

  it("keeps a defaulted public guest save private without a publishing note", async () => {
    signInAs("guest");
    const repo = makeRepository();
    const service = new LibrarySaveService(null, null, repo, null);

    // No visibility given: public is only the default, nobody asked for it.
    const result = await service.saveSequence(makeSequence(), {
      name: "ABCD",
      tags: [],
      notes: "",
    } as any);

    expect(cloudVisibility(repo)).toBe("private");
    expect(result.keptPrivateForGuest).toBe(true);
    expect(authDrawerState.offerPublishAccount).not.toHaveBeenCalled();
    expect(authDrawerState.offerGuestSaveNudge).toHaveBeenCalledExactlyOnceWith(
      { message: t("guest_save_kept_on_device") }
    );
    expect(result.accountAskShown).toBe(true);
  });

  it("tells the caller when no account offer went up, so it shows its own toast", async () => {
    signInAs("guest");
    // The first-save invitation is once per device; this guest has seen it.
    vi.mocked(authDrawerState.offerGuestSaveNudge).mockReturnValue(false);
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    const result = await service.saveSequence(makeSequence(), {
      name: "ABCD",
      visibility: "private",
      tags: [],
      notes: "",
    });

    expect(result.keptPrivateForGuest).toBe(false);
    expect(result.accountAskShown).toBe(false);
  });

  it("still publishes a full account's public save", async () => {
    signInAs("account");
    const repo = makeRepository();
    const service = new LibrarySaveService(null, null, repo, null);

    const result = await service.saveSequence(makeSequence(), {
      name: "ABCD",
      visibility: "public",
      tags: [],
      notes: "",
    });

    expect(cloudVisibility(repo)).toBe("public");
    expect(localVisibility()).toBe("public");
    expect(result).toMatchObject({
      isGuest: false,
      keptPrivateForGuest: false,
      accountAskShown: false,
    });
    expect(authDrawerState.offerPublishAccount).not.toHaveBeenCalled();
    expect(authDrawerState.offerGuestSaveNudge).not.toHaveBeenCalled();
  });
});
