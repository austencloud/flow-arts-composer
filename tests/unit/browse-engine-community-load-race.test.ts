import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const mocks = vi.hoisted(() => ({
  loadSequenceMetadata: vi.fn<() => Promise<SequenceData[]>>(),
  refreshFromFirestore: vi.fn<() => Promise<SequenceData[]>>(),
  getLibrarySequences: vi.fn<() => Promise<SequenceData[]>>(),
}));

vi.mock("$lib/shared/browse/get-browse-loader", () => ({
  getBrowseLoader: () => ({
    loadSequenceMetadata: mocks.loadSequenceMetadata,
    refreshFromFirestore: mocks.refreshFromFirestore,
    removeFromCache: vi.fn(),
  }),
}));

vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({
    getSequences: mocks.getLibrarySequences,
  }),
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", async () => {
  const { browseEngineAuthTestState } =
    await import("./browse-engine-auth-test-state.svelte");
  return { authState: browseEngineAuthTestState };
});

vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: {
    settings: { gridZoomByBucket: {} },
    updateSetting: vi.fn(),
  },
}));

vi.mock("$lib/shared/library/library-events", () => ({
  onLibraryMutated: () => () => {},
  onLibrarySequenceAdded: () => () => {},
}));

vi.mock("$lib/shared/library/services/collection-manager", () => ({
  toggleFavorite: vi.fn(),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { createBrowseEngineForTest } from "./browse-engine-test-helpers.svelte";
import { browseEngineAuthTestState } from "./browse-engine-auth-test-state.svelte";

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

beforeEach(() => {
  browseEngineAuthTestState.effectiveUserId = "owner";
  browseEngineAuthTestState.isAuthenticated = true;
  browseEngineAuthTestState.isFullAccount = true;
  mocks.loadSequenceMetadata.mockReset().mockResolvedValue([]);
  mocks.refreshFromFirestore.mockReset().mockResolvedValue([]);
  mocks.getLibrarySequences.mockReset().mockResolvedValue([]);
});

describe("BrowseEngine community load revisions", () => {
  it("finishes the public community load when account identity changes", async () => {
    const community = deferred<SequenceData[]>();
    mocks.loadSequenceMetadata.mockReturnValueOnce(community.promise);
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });
    const load = engine.initialize();
    await tick();
    browseEngineAuthTestState.effectiveUserId = "another-account";
    await tick();
    community.resolve([sequence("public-sequence")]);
    await load;
    await tick();
    expect(engine.allSequences.map(({ id }) => id)).toEqual([
      "public-sequence",
    ]);
    expect(engine.isLoading).toBe(false);
    expect(engine.sectionsReady).toBe(true);
    engine.destroy();
    dispose();
  });

  it("does not let a late community load overwrite the library", async () => {
    const community = deferred<SequenceData[]>();
    mocks.loadSequenceMetadata.mockReturnValueOnce(community.promise);
    mocks.getLibrarySequences.mockResolvedValueOnce([sequence("library")]);
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });

    const initialLoad = engine.initialize();
    await engine.setSource("my-library");
    expect(engine.allSequences.map(({ id }) => id)).toEqual(["library"]);

    community.resolve([sequence("stale-community")]);
    await initialLoad;
    await tick();
    expect(engine.allSequences.map(({ id }) => id)).toEqual(["library"]);
    expect(engine.isLoading).toBe(false);

    engine.destroy();
    dispose();
  });

  it("accepts only the newest request across community-library-community", async () => {
    const firstCommunity = deferred<SequenceData[]>();
    const secondCommunity = deferred<SequenceData[]>();
    mocks.loadSequenceMetadata
      .mockReturnValueOnce(firstCommunity.promise)
      .mockReturnValueOnce(secondCommunity.promise);
    mocks.getLibrarySequences.mockResolvedValueOnce([sequence("library")]);
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });

    const firstLoad = engine.initialize();
    await engine.setSource("my-library");
    const latestLoad = engine.setSource("community");
    secondCommunity.resolve([sequence("current-community")]);
    await latestLoad;

    firstCommunity.resolve([sequence("stale-community")]);
    await firstLoad;
    await tick();
    expect(engine.allSequences.map(({ id }) => id)).toEqual([
      "current-community",
    ]);

    engine.destroy();
    dispose();
  });

  it("invalidates refresh and extra-provider completions when a host sets the pool", async () => {
    const refresh = deferred<SequenceData[]>();
    const extras = deferred<readonly SequenceData[]>();
    mocks.loadSequenceMetadata.mockResolvedValueOnce([sequence("initial")]);
    mocks.refreshFromFirestore.mockReturnValueOnce(refresh.promise);
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      extraCommunitySequences: () => extras.promise,
    });

    await engine.initialize();
    const refreshLoad = engine.refresh();
    engine.setPool([sequence("host-pool")]);
    refresh.resolve([sequence("stale-refresh")]);
    extras.resolve([sequence("stale-extra")]);
    await refreshLoad;
    await tick();

    expect(engine.allSequences.map(({ id }) => id)).toEqual(["host-pool"]);
    expect(engine.isLoading).toBe(false);

    engine.destroy();
    dispose();
  });

  it("does not publish a load after destruction", async () => {
    const community = deferred<SequenceData[]>();
    mocks.loadSequenceMetadata.mockReturnValueOnce(community.promise);
    const { engine, dispose } = createBrowseEngineForTest({ persistKey: null });

    const load = engine.initialize();
    engine.destroy();
    community.resolve([sequence("late")]);
    await load;
    await tick();

    expect(engine.allSequences).toEqual([]);
    dispose();
  });
});
