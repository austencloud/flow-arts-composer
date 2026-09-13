/**
 * A save made with NO identity must still end up owned by the guest who made it.
 *
 * `ensureGuestIdentity()` swallows its failures (anon provider disabled,
 * offline), so a save can legitimately complete with `effectiveUserId === null`.
 * `recordSavedSequenceId(null, …)` no-ops — which left the row owned by nobody:
 * the guest library read filters by ledger and the background sync retry filters
 * by ledger, so the row was durable in Dexie and reachable by NOTHING. An
 * earlier revision of this work claimed such a row would be picked up "once an
 * owner exists". It would not have been.
 *
 * These tests use the REAL saved-sequence-ledger against jsdom localStorage, so
 * the continuity they assert is the actual read predicate the rest of the app
 * uses, not a mock of it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbPutMock = vi.fn().mockResolvedValue(undefined);
const dbGetMock = vi.fn().mockResolvedValue(undefined);
const dbCountMock = vi.fn().mockResolvedValue(0);
const dbUpdateMock = vi.fn().mockResolvedValue(1);

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
vi.mock("$lib/shared/analytics/services/posthog-lifecycle-reporter", () => ({
  reportPostHogLifecycleEvent: vi.fn().mockResolvedValue(undefined),
}));
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
// NOT mocked: saved-sequence-ledger. The whole point is the real predicate.

const { LibrarySaveService } =
  await import("$lib/features/library/services/library-save-service");
const { authState } = await import("$lib/shared/auth/state/auth-state.svelte");
const {
  getOwnedSequenceIdSet,
  getUnownedSequenceIds,
  adoptUnownedSequenceIds,
  getSavedSequenceIds,
} = await import("$lib/shared/library/services/saved-sequence-ledger");

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
  (authState as any).isAuthenticated = true;
  (authState as any).isAnonymous = true;
  (authState as any).effectiveUserId = null;
});

describe("a save with no identity is parked, not orphaned", () => {
  it("records the id as unowned rather than silently dropping it", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);

    const result = await service.saveSequence(makeSequence(), makeOptions());

    expect(result.persisted).toBe(true);
    expect(getUnownedSequenceIds()).toEqual(["seq-1"]);
  });

  it("leaves it owned by nobody until an identity exists", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence(), makeOptions());

    // No uid can claim it yet — and crucially, no OTHER uid can either.
    expect(getOwnedSequenceIdSet("someone-else").size).toBe(0);
    expect(getSavedSequenceIds("someone-else")).toEqual([]);
  });
});

describe("continuity — the identity arrives after the save", () => {
  it("hands the parked save to the anonymous identity that follows it", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence(), makeOptions());

    // ensureGuestIdentity provisions an anonymous user and adopts.
    const adopted = adoptUnownedSequenceIds("anon-1");

    expect(adopted).toEqual(["seq-1"]);
    // This is the exact predicate the guest library read and the background
    // sync retry both use, so the row is now visible AND syncable.
    expect(getOwnedSequenceIdSet("anon-1").has("seq-1")).toBe(true);
    // And the park is emptied, so it cannot be adopted twice by two identities.
    expect(getUnownedSequenceIds()).toEqual([]);
  });

  it("keeps saves made after the identity on the normal ledger path", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence("before"), makeOptions());
    adoptUnownedSequenceIds("anon-1");

    (authState as any).effectiveUserId = "anon-1";
    await service.saveSequence(makeSequence("after"), makeOptions());

    expect(getOwnedSequenceIdSet("anon-1")).toEqual(
      new Set(["before", "after"])
    );
    expect(getUnownedSequenceIds()).toEqual([]);
  });

  it("adopts every parked save, not just the most recent", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence("s1"), makeOptions());
    await service.saveSequence(makeSequence("s2"), makeOptions());

    adoptUnownedSequenceIds("anon-1");

    expect(getOwnedSequenceIdSet("anon-1")).toEqual(new Set(["s1", "s2"]));
  });

  it("never adopts into a null or empty identity", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence(), makeOptions());

    expect(adoptUnownedSequenceIds(null)).toEqual([]);
    expect(adoptUnownedSequenceIds("")).toEqual([]);
    // Still parked, still claimable by a real identity later.
    expect(getUnownedSequenceIds()).toEqual(["seq-1"]);
  });

  it("does not let a second identity re-adopt what the first already took", async () => {
    const service = new LibrarySaveService(null, null, makeRepository(), null);
    await service.saveSequence(makeSequence(), makeOptions());

    adoptUnownedSequenceIds("anon-1");
    const second = adoptUnownedSequenceIds("anon-2");

    expect(second).toEqual([]);
    expect(getOwnedSequenceIdSet("anon-2").size).toBe(0);
    expect(getOwnedSequenceIdSet("anon-1").has("seq-1")).toBe(true);
  });
});
