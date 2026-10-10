import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/3d/state/viewer-3d-state.svelte.js", () => ({
  clearViewer3DPresetIntent: vi.fn(),
  markViewer3DPresetIntent: vi.fn(),
  writeViewer3DConfig: vi.fn(),
}));
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: { settings: {}, updateSetting: vi.fn() },
}));
vi.mock("#lib/shared/sequence-viewer/services/viewer-state-persistence.js", () => ({
  persistViewerMode: vi.fn(),
}));
vi.mock("#lib/shared/collections/settings-checkpoint.svelte.js", () => ({
  captureSettingsCheckpoint: vi.fn(),
  revertSettingsCheckpoint: vi.fn(),
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  showToast: vi.fn(),
}));
vi.mock(
  "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js",
  () => ({ handleModuleChange: vi.fn() })
);
vi.mock("../domain/scene-3d-look", () => ({
  buildScene3DPersistConfig: vi.fn(() => ({})),
}));

import {
  consumeSceneStudioHandoff,
  openScene3DInStudio,
} from "./open-3d-scene";
import type { Collected3DScene } from "../domain/scene-3d-collection-types";

const steps = [{ stepNumber: 1, letter: "A" }];

function scene(extra: Partial<Collected3DScene> = {}): Collected3DScene {
  return {
    id: "scene-1",
    name: "Joined scene",
    poster: "",
    createdAt: 1,
    // Every look group masked off: only the performance is under test.
    snapshot: { version: 3, bpm: 90, groups: { performance: true, performers: false, props: false, efforts: false, effects: false, scene: false } } as never,
    steps: steps as never,
    ...extra,
  };
}

describe("opening a saved 3D scene keeps its grid join", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("hands the studio a sequence on the saved join", () => {
    openScene3DInStudio(scene({ conjoined: { toward: "s", steps: 2 } }));
    const handoff = consumeSceneStudioHandoff();
    expect(handoff?.sequence.conjoined).toEqual({ toward: "s", steps: 2 });
  });

  it("hands the studio one grid for a scene saved without a join", () => {
    openScene3DInStudio(scene());
    const handoff = consumeSceneStudioHandoff();
    expect(handoff).not.toBeNull();
    expect(handoff?.sequence.conjoined).toBeUndefined();
  });
});
