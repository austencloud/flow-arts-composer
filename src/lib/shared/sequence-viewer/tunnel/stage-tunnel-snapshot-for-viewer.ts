import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
import {
  getAnimationVisibilityManager,
  type AnimationVisibilityStateManager,
} from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { EFFECTS_CONFIG_STORAGE_KEY } from "$lib/shared/effects/state/effects-config-state.svelte";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import { saveTunnelViewState } from "./tunnel-view-state";
import type { TunnelSnapshot } from "./tunnel-snapshot";
import {
  ensureViewerCustomColorPreference,
  stageViewerCustomColors,
} from "../services/viewer-custom-color-preferences";

export interface TunnelViewerStagingDependencies {
  visibility: AnimationVisibilityStateManager;
  animationSettings: typeof animationSettings;
  settings: Pick<typeof settingsService, "updateSettings">;
  saveViewState: typeof saveTunnelViewState;
  storage: Pick<Storage, "setItem"> | null;
  ensureCustomColorPreference?: typeof ensureViewerCustomColorPreference;
  stageCustomColors?: typeof stageViewerCustomColors;
}

function defaultDependencies(): TunnelViewerStagingDependencies {
  return {
    visibility: getAnimationVisibilityManager(),
    animationSettings,
    settings: settingsService,
    saveViewState: saveTunnelViewState,
    storage: typeof localStorage === "undefined" ? null : localStorage,
    ensureCustomColorPreference: ensureViewerCustomColorPreference,
    stageCustomColors: stageViewerCustomColors,
  };
}

/**
 * Stage a saved tunnel into the existing viewer's canonical persistence seams.
 * The overlay mounts its controller and effects state after this synchronous
 * handoff, so those per-mount owners boot from the values written here.
 */
export function stageTunnelSnapshotForViewer(
  snapshot: TunnelSnapshot,
  dependencies: TunnelViewerStagingDependencies = defaultDependencies()
): void {
  const { visibility, animationSettings, settings, saveViewState, storage } =
    dependencies;

  // Preserve the user's preference before the staged artifact replaces the
  // legacy Tunnel view record. The one-use session handoff reproduces the
  // artifact in both art views without treating a view as an explicit edit.
  dependencies.ensureCustomColorPreference?.();
  dependencies.stageCustomColors?.(snapshot.tunnel.colors.custom);

  // Grid visibility now belongs to the Animator, not the Tunnel mode. Loading
  // an older saved Tunnel still reproduces that choice, but it does so through
  // the owner shared by 2D and Tunnel so the next mode switch cannot undo it.
  visibility.setGridMode(snapshot.tunnel.gridVisible ? "8point" : "none");
  visibility.setEffortPreset(snapshot.effort);
  visibility.setPathPolicy({
    pathShape: snapshot.paths.pathShape,
    motionAwarePaths: snapshot.paths.motionAwarePaths,
  });
  visibility.setVisibility("leftPathLines", snapshot.paths.leftPathLines);
  visibility.setVisibility("rightPathLines", snapshot.paths.rightPathLines);
  animationSettings.updateSettings({ trail: snapshot.trailRender });
  void settings.updateSettings({
    leftPropType: snapshot.props.leftPropType as PropType,
    rightPropType: snapshot.props.rightPropType as PropType,
    ...(snapshot.props.leftBuugengFlipped !== undefined
      ? { leftBuugengFlipped: snapshot.props.leftBuugengFlipped }
      : {}),
    ...(snapshot.props.rightBuugengFlipped !== undefined
      ? { rightBuugengFlipped: snapshot.props.rightBuugengFlipped }
      : {}),
    ...(snapshot.props.catDogMode !== undefined
      ? { catDogMode: snapshot.props.catDogMode }
      : {}),
  });

  saveViewState({
    config: snapshot.tunnel.config,
    gridVisible: snapshot.tunnel.gridVisible,
    colors: snapshot.tunnel.colors,
    section: snapshot.tunnel.section,
    presetRecipe: snapshot.tunnel.presetRecipe ?? null,
  });

  if (!storage) return;
  try {
    storage.setItem(
      EFFECTS_CONFIG_STORAGE_KEY,
      JSON.stringify(snapshot.effects)
    );
  } catch {
    // Storage may be unavailable. The live viewer can still open, but its
    // per-mount effects owner will retain the previous persisted config.
  }
}
