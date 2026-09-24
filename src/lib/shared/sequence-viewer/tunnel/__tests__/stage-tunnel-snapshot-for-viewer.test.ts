import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../tunnel-config";
import type { TunnelSnapshot } from "../tunnel-snapshot";
import {
  stageTunnelSnapshotForViewer,
  type TunnelViewerStagingDependencies,
} from "../stage-tunnel-snapshot-for-viewer";
import { EFFECTS_CONFIG_STORAGE_KEY } from "$lib/shared/effects/state/effects-config-state.svelte";

const snapshot = {
  version: 3,
  tunnel: {
    config: { ...DEFAULT_CONFIG, fold: 6 },
    gridVisible: true,
    colors: {
      mode: "custom",
      custom: { left: "#123456", right: "#abcdef" },
    },
    section: "props",
    presetRecipe: null,
  },
  effects: { activeEffect: "fire", marker: "exact" },
  effort: "punch",
  paths: {
    pathShape: "concave",
    motionAwarePaths: true,
    leftPathLines: true,
    rightPathLines: false,
  },
  playback: { bpm: 128, playbackMode: "step" },
  props: {
    leftPropType: "buugeng",
    rightPropType: "buugeng",
    leftBuugengFlipped: true,
    rightBuugengFlipped: false,
  },
  trailRender: { mode: "trail", marker: "exact" },
} as unknown as TunnelSnapshot;

describe("stageTunnelSnapshotForViewer", () => {
  it("fans every pre-mount field into the viewer's canonical owners", () => {
    const dependencies = {
      visibility: {
        setGridMode: vi.fn(),
        setEffortPreset: vi.fn(),
        setPathPolicy: vi.fn(),
        setVisibility: vi.fn(),
      },
      animationSettings: { updateSettings: vi.fn() },
      settings: { updateSettings: vi.fn() },
      saveViewState: vi.fn(),
      storage: { setItem: vi.fn() },
      ensureCustomColorPreference: vi.fn(),
      stageCustomColors: vi.fn(),
    } as unknown as TunnelViewerStagingDependencies;

    stageTunnelSnapshotForViewer(snapshot, dependencies);

    expect(dependencies.visibility.setGridMode).toHaveBeenCalledWith("8point");
    expect(dependencies.visibility.setEffortPreset).toHaveBeenCalledWith(
      "punch"
    );
    expect(dependencies.visibility.setPathPolicy).toHaveBeenCalledWith({
      pathShape: "concave",
      motionAwarePaths: true,
    });
    expect(dependencies.visibility.setVisibility).toHaveBeenNthCalledWith(
      1,
      "leftPathLines",
      true
    );
    expect(dependencies.visibility.setVisibility).toHaveBeenNthCalledWith(
      2,
      "rightPathLines",
      false
    );
    expect(dependencies.animationSettings.updateSettings).toHaveBeenCalledWith({
      trail: snapshot.trailRender,
    });
    expect(dependencies.settings.updateSettings).toHaveBeenCalledWith(
      snapshot.props
    );
    expect(dependencies.saveViewState).toHaveBeenCalledWith(snapshot.tunnel);
    expect(dependencies.ensureCustomColorPreference).toHaveBeenCalledOnce();
    expect(dependencies.stageCustomColors).toHaveBeenCalledWith(
      snapshot.tunnel.colors.custom
    );
    expect(dependencies.storage?.setItem).toHaveBeenCalledWith(
      EFFECTS_CONFIG_STORAGE_KEY,
      JSON.stringify(snapshot.effects)
    );
  });

  it("carries catDogMode from the snapshot's props into the viewer's settings", () => {
    const snapshotWithCatDog = {
      ...snapshot,
      props: { ...snapshot.props, catDogMode: true },
    } as unknown as TunnelSnapshot;

    const dependencies = {
      visibility: {
        setGridMode: vi.fn(),
        setEffortPreset: vi.fn(),
        setPathPolicy: vi.fn(),
        setVisibility: vi.fn(),
      },
      animationSettings: { updateSettings: vi.fn() },
      settings: { updateSettings: vi.fn() },
      saveViewState: vi.fn(),
      storage: { setItem: vi.fn() },
      ensureCustomColorPreference: vi.fn(),
      stageCustomColors: vi.fn(),
    } as unknown as TunnelViewerStagingDependencies;

    stageTunnelSnapshotForViewer(snapshotWithCatDog, dependencies);

    expect(dependencies.settings.updateSettings).toHaveBeenCalledWith(
      snapshotWithCatDog.props
    );
  });
});
