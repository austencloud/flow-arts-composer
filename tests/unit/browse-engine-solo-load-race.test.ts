import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { BrowseViewMode } from "#lib/shared/browse/domain/browse-view-mode.js";

const events = vi.hoisted(() => ({
  removed: new Set<(id: string) => void>(),
  added: new Set<(sequence: SequenceData) => void>(),
}));

vi.mock("#lib/shared/browse/get-browse-loader.js", () => ({
  getBrowseLoader: () => ({
    loadSequenceMetadata: vi.fn(async () => []),
    refreshFromFirestore: vi.fn(async () => []),
    removeFromCache: vi.fn(),
  }),
}));

vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: () => null,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    effectiveUserId: "owner",
    isAuthenticated: true,
    isFullAccount: true,
  },
}));

vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: {
    settings: { gridZoomByBucket: {} },
    updateSetting: vi.fn(),
  },
}));

vi.mock("#lib/shared/library/library-events.js", () => ({
  onLibraryMutated: (listener: (id: string) => void) => {
    events.removed.add(listener);
    return () => events.removed.delete(listener);
  },
  onLibrarySequenceAdded: (listener: (sequence: SequenceData) => void) => {
    events.added.add(listener);
    return () => events.added.delete(listener);
  },
}));

vi.mock("#lib/shared/library/services/collection-manager.js", () => ({
  toggleFavorite: vi.fn(),
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { createBrowseEngineForTest } from "./browse-engine-test-helpers.svelte";

interface PendingLoad {
  readonly viewMode: BrowseViewMode;
  readonly resolve: (sequences: readonly SequenceData[]) => void;
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

describe("BrowseEngine solo library loads", () => {
  it("keeps solo mutation updates when progressive account paging is enabled", async () => {
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      initialSource: "my-library",
      progressiveLibrary: true,
      loadSoloLibrarySequences: async () => [sequence("solo")],
    });
    engine.setViewMode({
      subject: "props",
      granularity: "solo",
      hand: "left",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.allSequences.map((item) => item.id)).toEqual(["solo"]);
    for (const listener of events.added) listener(sequence("new-solo"));
    expect(engine.allSequences.map((item) => item.id)).toEqual([
      "new-solo",
      "solo",
    ]);
    for (const listener of events.removed) listener("solo");
    expect(engine.allSequences.map((item) => item.id)).toEqual(["new-solo"]);
    engine.destroy();
    dispose();
  });

  it("ignores an older hand response that arrives after the current hand", async () => {
    const pending: PendingLoad[] = [];
    const loadSoloLibrarySequences = vi.fn(
      (viewMode: BrowseViewMode) =>
        new Promise<readonly SequenceData[]>((resolve) => {
          pending.push({ viewMode: { ...viewMode }, resolve });
        })
    );
    const { engine, dispose } = createBrowseEngineForTest({
      persistKey: null,
      initialSource: "my-library",
      loadSoloLibrarySequences,
    });

    engine.setViewMode({
      subject: "props",
      granularity: "solo",
      hand: "left",
    });
    engine.setViewMode({
      subject: "props",
      granularity: "solo",
      hand: "right",
    });

    expect(pending.map((request) => request.viewMode.hand)).toEqual([
      "left",
      "right",
    ]);

    pending[1]!.resolve([sequence("right-hand")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.allSequences.map((item) => item.id)).toEqual(["right-hand"]);

    pending[0]!.resolve([sequence("left-hand")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.allSequences.map((item) => item.id)).toEqual(["right-hand"]);
    expect(engine.isLoading).toBe(false);

    engine.destroy();
    dispose();
  });
});
