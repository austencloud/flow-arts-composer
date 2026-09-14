import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";

const mocks = vi.hoisted(() => ({
  addSequenceToCollection: vi.fn(),
  addSequencesToCollection: vi.fn(),
  removeSequenceFromCollection: vi.fn(),
  removeSequencesFromCollection: vi.fn(),
  createUserCollection: vi.fn(),
  ensureSystemCollections: vi.fn(),
  subscribeToCollections: vi.fn(() => () => {}),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
  showToast: vi.fn(),
  authDrawerShow: vi.fn(),
  offerGuestSaveNudge: vi.fn(),
  previewReadOnly: false,
  authState: {
    user: { uid: "admin" },
    effectiveUserId: "admin" as string | null,
    isAuthenticated: true,
    isAnonymous: false,
  },
}));

vi.mock("$lib/shared/library/services/collection-manager", () => ({
  addSequenceToCollection: mocks.addSequenceToCollection,
  addSequencesToCollection: mocks.addSequencesToCollection,
  removeSequenceFromCollection: mocks.removeSequenceFromCollection,
  removeSequencesFromCollection: mocks.removeSequencesFromCollection,
  createUserCollection: mocks.createUserCollection,
  ensureSystemCollections: mocks.ensureSystemCollections,
  subscribeToCollections: mocks.subscribeToCollections,
  updateCollection: mocks.updateCollection,
  deleteCollection: mocks.deleteCollection,
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
    info: mocks.toastInfo,
    warning: mocks.toastWarning,
  },
  showToast: mocks.showToast,
}));
// Publishing requires a full account (setPublic routes guests to the signup
// drawer instead of firing a write firestore.rules would deny). Default this
// mock to a signed-in full user so the delegate path is what gets exercised;
// the guest branch overrides these per-test.
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: mocks.authState,
}));
vi.mock("$lib/shared/debug/state/user-preview-state.svelte", () => ({
  isPreviewReadOnly: () => mocks.previewReadOnly,
}));
vi.mock("$lib/shared/auth/state/auth-drawer-state.svelte", () => ({
  authDrawerState: {
    show: mocks.authDrawerShow,
    offerGuestSaveNudge: mocks.offerGuestSaveNudge,
  },
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

import { collectionsState } from "../collections-state.svelte";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

describe("collection prop details", () => {
  it("persists the prop and explicitly clears it with a Firestore-safe null", async () => {
    const details = { name: "Fans", description: "", credit: "" };
    await collectionsState.saveDetails("fans", {
      ...details,
      propType: PropType.FAN,
    });
    expect(mocks.updateCollection).toHaveBeenLastCalledWith("fans", {
      ...details,
      propType: PropType.FAN,
    });
    await collectionsState.saveDetails("fans", { ...details, propType: null });
    expect(mocks.updateCollection).toHaveBeenLastCalledWith("fans", {
      ...details,
      propType: null,
    });
    await collectionsState.saveDetails("fans", details);
    expect(mocks.updateCollection).toHaveBeenLastCalledWith("fans", details);
  });
});

// authState above is the vi.mock plain object; the production type marks the tier
// flags readonly, so cast to a mutable view to reset/flip them between tests.
const mutableAuth = authState as unknown as {
  effectiveUserId: string | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
};

function col(
  id: string,
  name: string,
  opts: Partial<LibraryCollection> = {}
): LibraryCollection {
  return {
    id,
    name,
    ownerId: "u1",
    sequenceIds: [],
    sequenceCount: 0,
    isPublic: false,
    sortOrder: 0,
    icon: "fa-folder",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...opts,
  };
}

beforeEach(() => {
  collectionsState.teardown();
  vi.clearAllMocks();
  mocks.addSequenceToCollection.mockResolvedValue(undefined);
  mocks.addSequencesToCollection.mockResolvedValue({
    requestedCount: 2,
    addedCount: 2,
    alreadyPresentCount: 0,
  });
  mocks.removeSequenceFromCollection.mockResolvedValue(undefined);
  mocks.removeSequencesFromCollection.mockResolvedValue({
    requestedCount: 2,
    removedSequenceIds: ["s1", "s2"],
    alreadyAbsentSequenceIds: [],
    unprocessedSequenceIds: [],
  });
  mocks.createUserCollection.mockImplementation(async (name: string) =>
    col("new", name)
  );
  mocks.updateCollection.mockResolvedValue(undefined);
  mocks.deleteCollection.mockResolvedValue(undefined);
  mocks.ensureSystemCollections.mockResolvedValue(undefined);
  mocks.subscribeToCollections.mockReturnValue(vi.fn());
  // Reset the auth tier so a guest-branch test cannot leak into the next one.
  mutableAuth.effectiveUserId = "admin";
  mutableAuth.isAuthenticated = true;
  mutableAuth.isAnonymous = false;
  mocks.previewReadOnly = false;
  collectionsState.collections = [];
  collectionsState.loading = false;
});

describe("collectionsState", () => {
  it("restarts its subscription for the effective preview identity", () => {
    collectionsState.ensureStarted();
    const firstUnsubscribe = mocks.subscribeToCollections.mock.results[0]
      ?.value as ReturnType<typeof vi.fn>;

    mocks.previewReadOnly = true;
    mutableAuth.effectiveUserId = "preview-user";
    collectionsState.ensureStarted();

    expect(firstUnsubscribe).toHaveBeenCalledOnce();
    expect(mocks.subscribeToCollections).toHaveBeenCalledTimes(2);
    expect(mocks.ensureSystemCollections).toHaveBeenCalledTimes(1);
  });

  it("blocks collection writes while previewing another user", async () => {
    mocks.previewReadOnly = true;
    collectionsState.collections = [col("c1", "Previewed")];

    await collectionsState.toggle("s1", "c1");
    expect(await collectionsState.create("Nope")).toBeNull();
    expect(await collectionsState.remove("c1")).toBe(false);

    expect(mocks.addSequenceToCollection).not.toHaveBeenCalled();
    expect(mocks.createUserCollection).not.toHaveBeenCalled();
    expect(mocks.deleteCollection).not.toHaveBeenCalled();
    expect(mocks.toastWarning).toHaveBeenCalledTimes(3);
  });

  it("isIn reflects membership", () => {
    collectionsState.collections = [
      col("c1", "A", { sequenceIds: ["s1"], sequenceCount: 1 }),
    ];
    expect(collectionsState.isIn("s1", "c1")).toBe(true);
    expect(collectionsState.isIn("s2", "c1")).toBe(false);
    expect(collectionsState.isIn("s1", "missing")).toBe(false);
  });

  it("toggle adds a sequence when it is not yet a member", async () => {
    collectionsState.collections = [col("c1", "A")];
    await collectionsState.toggle("s1", "c1");
    expect(mocks.addSequenceToCollection).toHaveBeenCalledWith("c1", "s1");
    expect(mocks.removeSequenceFromCollection).not.toHaveBeenCalled();
  });

  it("toggle removes a sequence when it is already a member", async () => {
    collectionsState.collections = [
      col("c1", "A", { sequenceIds: ["s1"], sequenceCount: 1 }),
    ];
    await collectionsState.toggle("s1", "c1");
    expect(mocks.removeSequenceFromCollection).toHaveBeenCalledWith("c1", "s1");
    expect(mocks.addSequenceToCollection).not.toHaveBeenCalled();
  });

  it("lets guests add public sequences and delegates optional prompts only after successful saves", async () => {
    mutableAuth.isAnonymous = true;
    collectionsState.collections = [col("c1", "Practice")];
    mocks.addSequenceToCollection.mockRejectedValueOnce(new Error("offline"));

    await collectionsState.toggle("public-sequence", "c1");
    expect(mocks.offerGuestSaveNudge).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.authDrawerShow).not.toHaveBeenCalled();

    await collectionsState.toggle("public-sequence", "c1");
    await collectionsState.toggle("another-public-sequence", "c1");
    expect(mocks.addSequenceToCollection).toHaveBeenLastCalledWith(
      "c1",
      "another-public-sequence"
    );
    expect(mocks.offerGuestSaveNudge).toHaveBeenCalledTimes(2);
    expect(mocks.authDrawerShow).not.toHaveBeenCalled();
    const nudge = mocks.offerGuestSaveNudge.mock.calls[0]![0];
    expect(nudge.action.label).toBe("Create account");
    nudge.action.onClick();
    expect(mocks.authDrawerShow).toHaveBeenCalledWith("signup");
  });

  it("does not offer signup to full accounts after adding a sequence", async () => {
    collectionsState.collections = [col("c1", "Practice")];
    await collectionsState.toggle("public-sequence", "c1");
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.offerGuestSaveNudge).not.toHaveBeenCalled();
  });

  it("toggle blocks an add when the collection is full and toasts", async () => {
    collectionsState.collections = [col("c1", "A", { sequenceCount: 500 })];
    await collectionsState.toggle("s1", "c1");
    expect(mocks.addSequenceToCollection).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("adds a selection through the collection manager once", async () => {
    collectionsState.collections = [
      col("c1", "A", { sequenceIds: ["s1"], sequenceCount: 1 }),
    ];
    const ok = await collectionsState.addMany(["s1", "s2", "s3"], "c1");

    expect(ok).toBe(true);
    expect(mocks.addSequencesToCollection).toHaveBeenCalledWith("c1", [
      "s1",
      "s2",
      "s3",
    ]);
  });

  it("blocks a bulk add that would exceed the collection cap", async () => {
    const existingIds = Array.from({ length: 499 }, (_, i) => `old-${i}`);
    collectionsState.collections = [
      col("c1", "A", {
        sequenceIds: existingIds,
        sequenceCount: existingIds.length,
      }),
    ];

    const ok = await collectionsState.addMany(["new-1", "new-2"], "c1");
    expect(ok).toBe(false);
    expect(mocks.addSequencesToCollection).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      '"A" has room for 1 more sequence.'
    );
  });

  it("removes a selection once and restores the committed ids through Undo", async () => {
    collectionsState.collections = [
      col("c1", "Poi Combos", {
        sequenceIds: ["s1", "s2"],
        sequenceCount: 2,
      }),
    ];

    const result = await collectionsState.removeMany(["s1", "s2", "s2"], "c1");

    expect(result?.removedSequenceIds).toEqual(["s1", "s2"]);
    expect(mocks.removeSequencesFromCollection).toHaveBeenCalledWith("c1", [
      "s1",
      "s2",
      "s2",
    ]);
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Removed 2 sequences from "Poi Combos"',
        type: "info",
        action: expect.objectContaining({ label: "Undo" }),
      })
    );

    const toastConfig = mocks.showToast.mock.calls[0]![0] as {
      action: { onClick: () => void };
    };
    toastConfig.action.onClick();
    expect(mocks.addSequencesToCollection).toHaveBeenCalledWith("c1", [
      "s1",
      "s2",
    ]);
  });

  it("reports a partial removal and returns the unfinished ids", async () => {
    collectionsState.collections = [
      col("c1", "Poi Combos", {
        sequenceIds: ["s1", "s2"],
        sequenceCount: 2,
      }),
    ];
    mocks.removeSequencesFromCollection.mockResolvedValueOnce({
      requestedCount: 2,
      removedSequenceIds: ["s1"],
      alreadyAbsentSequenceIds: [],
      unprocessedSequenceIds: ["s2"],
    });

    const result = await collectionsState.removeMany(["s1", "s2"], "c1");

    expect(result?.unprocessedSequenceIds).toEqual(["s2"]);
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Removed 1 sequence from "Poi Combos". 1 sequence couldn\'t be removed.',
        type: "error",
      })
    );
  });

  it("create blocks at the per-user cap, excluding system collections", async () => {
    const many = Array.from({ length: 100 }, (_, i) => col(`c${i}`, `C${i}`));
    collectionsState.collections = [
      col("fav", "Favorites", { systemType: "favorites" }),
      ...many,
    ];
    const result = await collectionsState.create("New");
    expect(result).toBeNull();
    expect(mocks.createUserCollection).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("create trims the name and delegates under the cap", async () => {
    collectionsState.collections = [
      col("fav", "Favorites", { systemType: "favorites" }),
    ];
    const result = await collectionsState.create("  Poi  ");
    expect(mocks.createUserCollection).toHaveBeenCalledWith("Poi");
    expect(result?.name).toBe("Poi");
  });

  it("create ignores an empty name", async () => {
    const result = await collectionsState.create("   ");
    expect(result).toBeNull();
    expect(mocks.createUserCollection).not.toHaveBeenCalled();
  });

  it("rename trims the name and delegates to the manager", async () => {
    const ok = await collectionsState.rename("c1", "  Fans  ");
    expect(ok).toBe(true);
    expect(mocks.updateCollection).toHaveBeenCalledWith("c1", { name: "Fans" });
  });

  it("rename ignores an empty name", async () => {
    const ok = await collectionsState.rename("c1", "   ");
    expect(ok).toBe(false);
    expect(mocks.updateCollection).not.toHaveBeenCalled();
  });

  it("rename returns false when the manager rejects (e.g. system collection)", async () => {
    mocks.updateCollection.mockRejectedValue(
      new Error("Cannot rename system collection")
    );
    const ok = await collectionsState.rename("fav", "Nope");
    expect(ok).toBe(false);
  });

  it("setPublic delegates the visibility flip to the manager", async () => {
    const ok = await collectionsState.setPublic("c1", true);
    expect(ok).toBe(true);
    expect(mocks.updateCollection).toHaveBeenCalledWith("c1", {
      isPublic: true,
    });
  });

  it("setPublic returns false when the manager rejects", async () => {
    mocks.updateCollection.mockRejectedValue(new Error("network"));
    const ok = await collectionsState.setPublic("c1", true);
    expect(ok).toBe(false);
  });

  // firestore.rules deny a guest write that sets isPublic == true, so setPublic
  // nudges to signup rather than firing a write that would fail silently.
  it("setPublic nudges a guest to sign up instead of writing", async () => {
    mutableAuth.isAnonymous = true;
    const ok = await collectionsState.setPublic("c1", true);
    expect(ok).toBe(false);
    expect(mocks.updateCollection).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.authDrawerShow).toHaveBeenCalledWith(
      "signup",
      "edit-community"
    );
  });

  // Un-publishing stays open to guests — only a full user could have published
  // in the first place, so the guard fires on the publish direction only.
  it("setPublic lets a guest un-publish", async () => {
    mutableAuth.isAnonymous = true;
    const ok = await collectionsState.setPublic("c1", false);
    expect(ok).toBe(true);
    expect(mocks.updateCollection).toHaveBeenCalledWith("c1", {
      isPublic: false,
    });
  });

  it("remove delegates to the manager and reports success", async () => {
    const ok = await collectionsState.remove("c1");
    expect(ok).toBe(true);
    expect(mocks.deleteCollection).toHaveBeenCalledWith("c1");
  });

  it("remove returns false when the manager rejects", async () => {
    mocks.deleteCollection.mockRejectedValue(
      new Error("Cannot delete system collection")
    );
    const ok = await collectionsState.remove("fav");
    expect(ok).toBe(false);
  });
});
