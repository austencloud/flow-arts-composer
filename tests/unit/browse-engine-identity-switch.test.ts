import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

interface PendingLoad {
  readonly userId: string | null;
  readonly resolve: (sequences: SequenceData[]) => void;
}

const mocks = vi.hoisted(() => ({
  pending: [] as PendingLoad[],
  pagePending: [] as Array<{
    resolve: (page: {
      sequences: SequenceData[];
      nextCursor: { sortValue: string; documentId: string };
      exhausted: boolean;
    }) => void;
  }>,
  getAllSequences: vi.fn<() => Promise<SequenceData[]>>(),
}));

vi.mock(
  "#lib/shared/persistence/services/dexie-persistence-service.js",
  () => ({
    getAllSequences: mocks.getAllSequences,
  })
);

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", async () => {
  const { browseEngineAuthTestState } =
    await import("./browse-engine-auth-test-state.svelte");
  return { authState: browseEngineAuthTestState };
});

vi.mock("#lib/shared/debug/state/user-preview-state.svelte.js", () => ({
  isPreviewReadOnly: () => false,
}));

vi.mock("#lib/shared/browse/get-browse-loader.js", () => ({
  getBrowseLoader: () => ({
    loadSequenceMetadata: vi.fn(async () => []),
    refreshFromFirestore: vi.fn(async () => []),
    removeFromCache: vi.fn(),
  }),
}));

vi.mock("#lib/shared/library/get-library-repository.js", async () => {
  const { browseEngineAuthTestState } =
    await import("./browse-engine-auth-test-state.svelte");
  return {
    getLibraryRepository: () => ({
      getSequencePage: () =>
        new Promise((resolve) => {
          mocks.pagePending.push({ resolve });
        }),
      getSequences: () =>
        new Promise<SequenceData[]>((resolve) => {
          mocks.pending.push({
            userId: browseEngineAuthTestState.effectiveUserId,
            resolve,
          });
        }),
    }),
  };
});

vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: {
    settings: { gridZoomByBucket: {} },
    updateSetting: vi.fn(),
  },
}));

vi.mock("#lib/shared/library/library-events.js", () => ({
  onLibraryMutated: () => () => {},
  onLibrarySequenceAdded: () => () => {},
  onLibrarySequenceUpdated: () => () => {},
}));

vi.mock("#lib/shared/library/services/collection-manager.js", () => ({
  toggleFavorite: vi.fn(),
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { browseEngineAuthTestState } from "./browse-engine-auth-test-state.svelte";
import { createBrowseEngineForTest } from "./browse-engine-test-helpers.svelte";
import { recordSavedSequenceId } from "#lib/shared/library/services/saved-sequence-ledger.js";

function sequence(id: string): SequenceData {
  return {
    id,
    name: id,
    word: "",
    steps: [],
    thumbnails: [],
    tags: [],
    metadata: {},
    isFavorite: false,
    isCircular: false,
  };
}

describe("BrowseEngine effective identity switching", () => {
  beforeEach(() => {
    mocks.pending = [];
    mocks.pagePending = [];
    mocks.getAllSequences.mockReset().mockResolvedValue([]);
    localStorage.clear();
    browseEngineAuthTestState.effectiveUserId = "owner";
    browseEngineAuthTestState.isAuthenticated = true;
    browseEngineAuthTestState.isFullAccount = true;
  });

  it("shows a saved first page while the rest of the library is pending", async () => {
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      initialSource: "my-library",
      progressiveLibrary: true,
    });
    const initialLoad = engine.initialize();
    expect(mocks.pagePending).toHaveLength(1);
    mocks.pagePending[0]!.resolve({
      sequences: [sequence("first")],
      nextCursor: { sortValue: "first", documentId: "first" },
      exhausted: false,
    });
    await initialLoad;
    await tick();
    expect(engine.allSequences.map((item) => item.id)).toEqual(["first"]);
    expect(engine.sectionsReady).toBe(true);
    expect(engine.isLoading).toBe(false);
    expect(engine.isLoadingMore).toBe(true);
    expect(mocks.pagePending).toHaveLength(2);
    mocks.pagePending[1]!.resolve({
      sequences: [sequence("second")],
      nextCursor: { sortValue: "second", documentId: "second" },
      exhausted: true,
    });
    await vi.waitFor(() => expect(engine.isLoadingMore).toBe(false));
    expect(engine.allSequences.map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
    engine.destroy();
    dispose();
  });

  it("reloads for preview and exit without accepting stale account rows", async () => {
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      initialSource: "my-library",
    });

    const initialLoad = engine.initialize();
    expect(mocks.pending.map((request) => request.userId)).toEqual(["owner"]);

    browseEngineAuthTestState.effectiveUserId = "preview-user";
    await tick();
    expect(mocks.pending.map((request) => request.userId)).toEqual([
      "owner",
      "preview-user",
    ]);

    mocks.pending[1]!.resolve([sequence("preview-row")]);
    await tick();
    expect(engine.allSequences.map((item) => item.id)).toEqual(["preview-row"]);

    mocks.pending[0]!.resolve([sequence("stale-owner-row")]);
    await initialLoad;
    await tick();
    expect(engine.allSequences.map((item) => item.id)).toEqual(["preview-row"]);

    browseEngineAuthTestState.effectiveUserId = "owner";
    await tick();
    expect(mocks.pending[2]?.userId).toBe("owner");
    mocks.pending[2]!.resolve([sequence("restored-owner-row")]);
    await tick();
    expect(engine.allSequences.map((item) => item.id)).toEqual([
      "restored-owner-row",
    ]);

    engine.destroy();
    dispose();
  });

  it("shows none of the device cache after sign-out, even when an account request finishes late", async () => {
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      initialSource: "my-library",
    });
    const initialLoad = engine.initialize();
    browseEngineAuthTestState.effectiveUserId = null;
    browseEngineAuthTestState.isAuthenticated = false;
    browseEngineAuthTestState.isFullAccount = false;
    await tick();

    mocks.pending[0]!.resolve([sequence("DJI")]);
    await initialLoad;
    await tick();
    expect(engine.allSequences).toEqual([]);
    expect(engine.isLoading).toBe(false);
    expect(mocks.getAllSequences).not.toHaveBeenCalled();

    // Firebase may establish a new anonymous identity after sign-out.
    browseEngineAuthTestState.effectiveUserId = "new-guest";
    browseEngineAuthTestState.isAuthenticated = true;
    await tick();
    expect(engine.allSequences).toEqual([]);
    expect(mocks.getAllSequences).not.toHaveBeenCalled();
    engine.destroy();
    dispose();
  });

  it("loads only saves recorded for the current guest", async () => {
    browseEngineAuthTestState.effectiveUserId = "guest";
    browseEngineAuthTestState.isFullAccount = false;
    recordSavedSequenceId("guest", "my-draft");
    recordSavedSequenceId("previous-owner", "DJI");
    mocks.getAllSequences.mockResolvedValue([
      sequence("DJI"),
      sequence("SEQUENCEPM"),
      sequence("my-draft"),
    ]);
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      initialSource: "my-library",
    });
    await engine.initialize();
    expect(engine.allSequences.map((item) => item.id)).toEqual(["my-draft"]);
    expect(mocks.pending).toHaveLength(0);
    engine.destroy();
    dispose();
  });

  it("reloads from the account when a guest upgrades without changing uid", async () => {
    browseEngineAuthTestState.effectiveUserId = "guest";
    browseEngineAuthTestState.isFullAccount = false;
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      initialSource: "my-library",
    });
    await engine.initialize();
    browseEngineAuthTestState.isFullAccount = true;
    await tick();
    expect(mocks.pending.map((request) => request.userId)).toEqual(["guest"]);
    mocks.pending[0]!.resolve([sequence("account-save")]);
    await tick();
    expect(engine.allSequences.map((item) => item.id)).toEqual([
      "account-save",
    ]);
    engine.destroy();
    dispose();
  });
});
