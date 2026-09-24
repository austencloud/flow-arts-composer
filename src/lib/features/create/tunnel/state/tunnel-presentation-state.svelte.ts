import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import {
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "$lib/shared/animation-engine/domain/constants/timing";
import type { AnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
import type { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import {
  captureTunnelSnapshot,
  applyTunnelSnapshot,
  SNAPSHOT_VERSION,
  type SnapshotDeps,
  type TunnelSnapshot,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import {
  DEFAULT_CONFIG,
  type TunnelConfig,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import type { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
import { DEFAULT_TUNNEL_CUSTOM_PROP_COLORS } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import type {
  ChiralityHand,
  PropChiralitySeam,
} from "$lib/shared/settings/components/tabs/prop-type/prop-chirality-seam";

interface TunnelPresentationInputs {
  initialSnapshot?: TunnelSnapshot | null;
  initialFormation?: TunnelConfig;
  effects: EffectsConfigState;
  visibility: AnimationVisibilityStateManager;
  animationSettings: AnimationSettingsState;
  initialLeftPropType: string;
  initialRightPropType: string;
  /** The settings flag for a new tunnel. Saved tunnels use their snapshot. */
  initialCatDogMode?: boolean;
  initialLeftBuugengFlipped: boolean;
  initialRightBuugengFlipped: boolean;
}

const clone = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

/**
 * Tunnel-local presentation document. It adapts the existing control owners to
 * the snapshot boundary without allowing the creator to mutate global viewer
 * preferences while the user experiments.
 */
export function createTunnelPresentationState(
  inputs: TunnelPresentationInputs
) {
  const initialSnapshot = inputs.initialSnapshot
    ? clone(inputs.initialSnapshot)
    : null;
  let controller = $state<TunnelViewController | null>(null);
  let bpm = $state(initialSnapshot?.playback.bpm ?? 60);
  let playbackMode = $state<PlaybackMode>(
    initialSnapshot?.playback.playbackMode ?? "continuous"
  );
  let playing = $state(true);
  let leftPropType = $state(
    initialSnapshot?.props.leftPropType ?? inputs.initialLeftPropType
  );
  let rightPropType = $state(
    initialSnapshot?.props.rightPropType ?? inputs.initialRightPropType
  );
  let leftBuugengFlipped = $state(
    initialSnapshot?.props.leftBuugengFlipped ??
      inputs.initialLeftBuugengFlipped
  );
  let rightBuugengFlipped = $state(
    initialSnapshot?.props.rightBuugengFlipped ??
      inputs.initialRightBuugengFlipped
  );
  // Differing hands mean cat dog, whatever an older flag says.
  let catDog = $state(
    (initialSnapshot
      ? (initialSnapshot.props.catDogMode ?? false)
      : (inputs.initialCatDogMode ?? false)) || leftPropType !== rightPropType
  );
  let propHand = $state<"left" | "right">("left");
  let unattachedTunnel = $state({
    config: clone(
      initialSnapshot?.tunnel.config ??
        inputs.initialFormation ??
        DEFAULT_CONFIG
    ),
    gridVisible: initialSnapshot?.tunnel.gridVisible ?? false,
    // New Tunnel choreography starts with the pictograph pair. Saved snapshots
    // still win exactly, including migrated Spectrum and authored Custom pairs.
    colors: clone(
      initialSnapshot?.tunnel.colors ?? {
        mode: "hands" as const,
        custom: DEFAULT_TUNNEL_CUSTOM_PROP_COLORS,
      }
    ),
    section: initialSnapshot?.tunnel.section ?? ("tunnel" as const),
    presetRecipe: clone(initialSnapshot?.tunnel.presetRecipe ?? null),
  });

  const propSettings: SnapshotDeps["settings"] = {
    get leftPropType() {
      return leftPropType;
    },
    get rightPropType() {
      return rightPropType;
    },
    get leftBuugengFlipped() {
      return leftBuugengFlipped;
    },
    get rightBuugengFlipped() {
      return rightBuugengFlipped;
    },
    get catDogMode() {
      return catDog;
    },
    updateSettings(patch) {
      if (patch.leftPropType !== undefined) leftPropType = patch.leftPropType;
      if (patch.rightPropType !== undefined)
        rightPropType = patch.rightPropType;
      if (patch.leftBuugengFlipped !== undefined) {
        leftBuugengFlipped = patch.leftBuugengFlipped;
      }
      if (patch.rightBuugengFlipped !== undefined) {
        rightBuugengFlipped = patch.rightBuugengFlipped;
      }
      if (patch.catDogMode !== undefined) catDog = patch.catDogMode;
      if (leftPropType !== rightPropType) catDog = true;
      if (!catDog) propHand = "left";
    },
  };

  const playback: SnapshotDeps["playback"] = {
    handleBpmChange(value) {
      bpm = value;
    },
    handlePlaybackModeChange(mode) {
      playbackMode = mode;
    },
  };

  function snapshotDeps(liveController: TunnelViewController): SnapshotDeps {
    return {
      controller: liveController,
      effects: inputs.effects,
      visibility: inputs.visibility,
      settings: propSettings,
      animationSettings: inputs.animationSettings,
      playback,
      animationPanel: {
        get playbackMode() {
          return playbackMode;
        },
      },
      getBpm: () => bpm,
    };
  }

  // The scoped owners exist before the stage controller mounts. Restore their
  // portions immediately so every settings panel opens on the saved values.
  if (initialSnapshot) {
    inputs.effects.replace(initialSnapshot.effects);
    inputs.visibility.setEffortPreset(initialSnapshot.effort);
    inputs.visibility.setPathPolicy({
      pathShape: initialSnapshot.paths.pathShape,
      motionAwarePaths: initialSnapshot.paths.motionAwarePaths,
    });
    inputs.visibility.setVisibility(
      "leftPathLines",
      initialSnapshot.paths.leftPathLines
    );
    inputs.visibility.setVisibility(
      "rightPathLines",
      initialSnapshot.paths.rightPathLines
    );
    inputs.animationSettings.updateSettings({
      trail: clone(initialSnapshot.trailRender),
    });
  }

  function attachController(next: TunnelViewController): void {
    controller = next;
    if (initialSnapshot) {
      applyTunnelSnapshot(snapshotDeps(next), initialSnapshot);
      if (inputs.initialFormation) {
        next.applyConfig(inputs.initialFormation);
      }
    } else {
      next.applyConfig(unattachedTunnel.config, unattachedTunnel.presetRecipe);
      next.gridVisible = unattachedTunnel.gridVisible;
      next.colors = unattachedTunnel.colors;
      next.section = unattachedTunnel.section;
    }
    unattachedTunnel = {
      config: clone(next.config),
      gridVisible: next.gridVisible,
      colors: next.colors,
      section: next.section,
      presetRecipe: clone(next.presetRecipe),
    };
  }

  function capture(): TunnelSnapshot {
    if (controller) {
      const snapshot = captureTunnelSnapshot(snapshotDeps(controller));
      unattachedTunnel = clone(snapshot.tunnel);
      return snapshot;
    }

    return {
      version: SNAPSHOT_VERSION,
      tunnel: clone(unattachedTunnel),
      effects: clone(inputs.effects.config),
      effort: inputs.visibility.getEffortPreset(),
      paths: {
        pathShape: inputs.visibility.getPathShape(),
        motionAwarePaths: inputs.visibility.getMotionAwarePaths(),
        leftPathLines: inputs.visibility.getVisibility("leftPathLines"),
        rightPathLines: inputs.visibility.getVisibility("rightPathLines"),
      },
      playback: { bpm, playbackMode },
      props: {
        leftPropType,
        rightPropType,
        catDogMode: catDog,
        leftBuugengFlipped,
        rightBuugengFlipped,
      },
      trailRender: clone(inputs.animationSettings.trail),
    };
  }

  function toggleCatDog(): void {
    catDog = !catDog;
    propHand = "left";
    if (!catDog) rightPropType = leftPropType;
    inputs.animationSettings.setCurrentPropType(leftPropType);
  }

  function selectPropHand(hand: "left" | "right"): void {
    if (catDog) propHand = hand;
  }

  return {
    get bpm() {
      return bpm;
    },
    get playbackMode() {
      return playbackMode;
    },
    get playing() {
      return playing;
    },
    get leftPropType() {
      return leftPropType;
    },
    get rightPropType() {
      return rightPropType;
    },
    get leftBuugengFlipped() {
      return leftBuugengFlipped;
    },
    get rightBuugengFlipped() {
      return rightBuugengFlipped;
    },
    get catDog() {
      return catDog;
    },
    get propHand() {
      return propHand;
    },
    /** The prop the picker grid shows as selected: the addressed hand's. */
    get addressedPropType() {
      return catDog && propHand === "right" ? rightPropType : leftPropType;
    },
    // Not annotated as HandPropToolbarProps: that type lives in a real .svelte
    // component's module block, which a plain .ts file's typechecker cannot
    // resolve as a named export. The shape below matches it structurally, and
    // the .svelte hosts that consume it (TunnelLayout) check the match there.
    get handProps() {
      return {
        catDog,
        hand: propHand,
        leftPropType: leftPropType as PropType,
        rightPropType: rightPropType as PropType,
        onToggleCatDog: toggleCatDog,
        onHandChange: selectPropHand,
      };
    },
    toggleCatDog,
    selectPropHand,
    get chirality(): PropChiralitySeam {
      const handState = (hand: ChiralityHand) => ({
        hand,
        get flipped() {
          return hand === "left" ? leftBuugengFlipped : rightBuugengFlipped;
        },
      });
      return {
        hands: [handState("left"), handState("right")],
        onChange(hand, flipped) {
          if (hand === "left") leftBuugengFlipped = flipped;
          else rightBuugengFlipped = flipped;
        },
      };
    },
    get effects() {
      return inputs.effects;
    },
    get visibility() {
      return inputs.visibility;
    },
    get animationSettings() {
      return inputs.animationSettings;
    },
    attachController,
    capture,
    setBpm(value: number) {
      bpm = Math.max(
        PLAYBACK_MIN_BPM,
        Math.min(PLAYBACK_MAX_BPM, Math.round(value))
      );
    },
    setPlaybackMode(mode: PlaybackMode) {
      playbackMode = mode;
    },
    setPlaying(value: boolean) {
      playing = value;
    },
    togglePlaying() {
      playing = !playing;
    },
    setPropType(propType: string) {
      if (catDog && propHand === "right") rightPropType = propType;
      else if (catDog) leftPropType = propType;
      else {
        leftPropType = propType;
        rightPropType = propType;
      }
      inputs.animationSettings.setCurrentPropType(leftPropType);
    },
  };
}

export type TunnelPresentationState = ReturnType<
  typeof createTunnelPresentationState
>;
