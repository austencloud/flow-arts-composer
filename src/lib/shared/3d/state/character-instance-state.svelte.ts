/**
 * Character Instance State
 *
 * Per-character state factory for the multi-character 3D viewer.
 * Each character has independent sequence loading, playback, and locomotion.
 */

import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  Plane,
  propFinishState,
  type PropBuild,
  type ScheduledGaitTimingSample,
  type TerminalStepPlan,
} from "@austencloud/scene-3d";
import { PlaneMode } from "@austencloud/scene-3d";
import {
  PLANE_MODE_CONFIGS,
  type PlaneModeConfig,
} from "@austencloud/scene-3d";
import { createPlaybackState } from "./playback-state.svelte";
import { calculatePropState } from "../services/prop-state-interpolator";
import {
  sequenceToMotionConfigs,
  getStartPlacementConfigs,
} from "../services/sequence-converter";
import type { StepMotionConfigs } from "../services/sequence-converter";
import {
  CHARACTER_DEFINITIONS,
  DEFAULT_CHARACTER_ID,
  type CharacterId,
} from "../domain/character-model";
import { applyEffort } from "$lib/shared/effort/domain/effort-easing-unified";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";
import type { EffortTimeline } from "$lib/shared/effort/domain/effort-timeline-types";
import { findPhraseAtBeat } from "$lib/shared/effort/domain/effort-timeline-types";
import { interpolatePhrase } from "$lib/shared/phrase-effort-lab/services/phrase-interpolator";
import {
  makeDefaultPerformerSettings,
  makeStandaloneDefaults,
  type PerformerSettings,
  type DefaultPerformerSettings,
  type OverrideState,
} from "./performer-settings-types";
import type { EffectType } from "$lib/shared/effects/domain/effects-config";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { getSceneUndoManager } from "../undo/get-scene-undo-manager";
import { buildForEffect } from "../domain/build-for-effect";
import { findScenePropFamily } from "../domain/scene-prop-catalog";
import type { PerformerDomainSnapshot } from "../undo/scene-undo-types";
import { isSeamlesslyLoopable3D } from "../services/sequence-loopability-3d";

// Position Constants (all in meters)

/** Default Z position for characters - same as grid plane so hands are at prop positions */
const FIGURE_Z = 0;

/**
 * Derive the PlaneMode that matches a given pair of hand-plane assignments.
 *
 * When both hands are on the same preset plane, use the matching preset mode
 * (WALL or DUAL_WHEEL) so the renderer produces the intended spatial layout.
 * DUAL_WHEEL is required when both hands are on WHEEL - a single wheel plane
 * can't hold both hands without overlap through the character.
 *
 * Any other combination falls back to CUSTOM (per-hand independent).
 */
export function derivePlaneModeFromHands(
  leftPlane: Plane,
  rightPlane: Plane
): PlaneMode {
  if (leftPlane === Plane.WALL && rightPlane === Plane.WALL)
    return PlaneMode.WALL;
  if (leftPlane === Plane.WHEEL && rightPlane === Plane.WHEEL)
    return PlaneMode.DUAL_WHEEL;
  return PlaneMode.CUSTOM;
}

/**
 * Configuration for a character instance
 */
export interface CharacterInstanceConfig {
  id: string;
  positionX: number;
  positionZ?: number;
  characterId?: CharacterId;
  /** User-assigned display name; null = fall back to the character model's name. */
  name?: string | null;
  /**
   * Whether this instance reads/writes its persisted plane-mode and
   * rotation-variant localStorage keys. Defaults to `true` (the real
   * viewer's behavior, unchanged). Seeded/ephemeral viewers pass `false`
   * so a preview never reads the user's saved planes at creation and never
   * clobbers them when the film/preview changes hand planes.
   */
  persistent?: boolean;
}

/**
 * Dependencies for character instance state
 */
export interface CharacterInstanceDeps {
  getDefaults: () => DefaultPerformerSettings;
}

/** Standalone deps for call sites without a viewer-level defaults provider */
const _standaloneDeps: CharacterInstanceDeps = {
  getDefaults: makeStandaloneDefaults,
};

/**
 * Create deps that inherit from standalone defaults.
 * Use this for museum, village, and other non-viewer character consumers.
 * The main viewer (performer-manager) wires its own getDefaults from viewer state.
 */
export function makeStandaloneDeps(): CharacterInstanceDeps {
  return _standaloneDeps;
}

export function createCharacterInstanceState(
  config: CharacterInstanceConfig,
  deps: CharacterInstanceDeps
) {
  const getDefaults = deps.getDefaults;

  // Character identity
  const id = config.id;
  // Seeded/ephemeral viewers (preview tiles, film-director shots) pass
  // `persistent: false` so this instance never touches the user's saved
  // plane-mode / rotation-variant localStorage keys - neither reading them
  // at creation nor writing on every plane change. Default true = the real
  // viewer's unchanged behavior.
  const persistToStorage = config.persistent !== false;
  let characterId = $state<CharacterId>(
    config.characterId ?? DEFAULT_CHARACTER_ID
  );

  // User-assigned display name. null = inherit the character model's name.
  let displayName = $state<string | null>(config.name ?? null);

  // Scene presence is renderer state, not cast membership. The performer
  // manager can remove a character from the document immediately while this
  // value carries the visible exit to completion.
  let presenceProgress = $state(1);

  // Performer Settings (declared early so derived computations can read them)

  let _settings = $state<PerformerSettings>(makeDefaultPerformerSettings());

  // Effective Value Getters (cascade resolution: null → inherit from defaults)

  const effectiveProp = $derived(_settings.prop ?? getDefaults().prop);
  const effectivePropBuild = $derived<PropBuild>({
    ...propFinishState.build,
    ...(_settings.propBuild ?? {}),
  });
  const effectiveEffortId = $derived(
    _settings.effortId ?? getDefaults().effortId
  );
  // The per-performer effect OVERRIDE only. `null` means "inherit the global
  // default" - the inherited value (config.tipEffectMap wildcard) is resolved
  // by the consumer (Viewer3DScene / EffectsSettingsPanel), which has the
  // effects-config in scope. This state factory deliberately doesn't reach into
  // that context.
  const rawEffect = $derived(_settings.effect);
  const rawHandEffects = $derived(_settings.handEffects);
  // effectivePlaneMode/BluePlane/RedPlane defined after plane state declarations below

  // Override Detection

  // NOTE: hasOverride for planes is defined after planeMode declaration below

  // Locomotion State

  // Full 3D position (replacing positionX)
  const position = $state({
    x: config.positionX,
    y: 0,
    z: config.positionZ ?? FIGURE_Z,
  });

  // Movement input from WASD keys (-1 to 1 for each axis)
  let moveInput = $state({ x: 0, z: 0 });

  // Whether the character is currently moving
  let isMoving = $state(false);

  // Ground speed in m/s. The locomotion animator scales the walk clip's
  // playback rate by this, which is what keeps the feet from skating.
  let moveSpeed = $state(0);
  let gaitTimingSample = $state<ScheduledGaitTimingSample | null>(null);
  let terminalStepPlan = $state<TerminalStepPlan | null>(null);

  // Current facing angle in radians (0 = facing +Z).
  // Initialize from persisted plane mode so dual-wheel starts at π/2.
  const _initialPlaneMode = loadPersistedPlaneMode();
  const _initialFacing =
    _initialPlaneMode === PlaneMode.DUAL_WHEEL ? Math.PI / 2 : 0;
  let facingAngle = $state(_initialFacing);

  // Target facing angle for smooth rotation
  let targetFacingAngle = $state(_initialFacing);

  // Rotation speed in radians per second - fast enough to feel responsive,
  // slow enough to look smooth. 12 rad/s ≈ 180° in ~0.26s.
  const ROTATION_SPEED = 12;

  // Visibility - start hidden until a sequence is loaded
  let showLeft = $state(false);
  let showRight = $state(false);

  // Sequence mode state
  let loadedSequence = $state<SequenceData | null>(null);
  let stepConfigs = $state<StepMotionConfigs[]>([]);
  let hasStartPose = $state(false);
  let currentStepIndex = $state(0);
  // Persist plane mode and rotation variant across HMR / page reloads
  const PLANE_MODE_KEY = `tka-3d-planeMode-${id}`;
  const ROT_VARIANT_KEY = `tka-3d-rotVariant-${id}`;

  function loadPersistedPlaneMode(): PlaneMode | null {
    if (!persistToStorage) return null;
    try {
      const v = localStorage.getItem(PLANE_MODE_KEY);
      if (v === PlaneMode.DUAL_WHEEL) return PlaneMode.DUAL_WHEEL;
      if (v === PlaneMode.WALL) return PlaneMode.WALL;
      if (v === PlaneMode.CUSTOM) return PlaneMode.CUSTOM;
    } catch {
      /* ignore */
    }
    return null;
  }

  function loadPersistedRotVariant(): number {
    if (!persistToStorage) return 1;
    try {
      const v = localStorage.getItem(ROT_VARIANT_KEY);
      if (v !== null) return Math.max(0, Math.min(2, parseInt(v, 10) || 0));
    } catch {
      /* ignore */
    }
    return 1;
  }

  let planeMode = $state<PlaneMode | null>(loadPersistedPlaneMode());
  let customLeftPlane = $state<Plane | null>(null);
  let customRightPlane = $state<Plane | null>(null);

  // Effective plane getters (cascade resolution: null → inherit from defaults)
  const effectivePlaneMode = $derived(planeMode ?? getDefaults().planeMode);
  const effectiveLeftPlane = $derived(
    customLeftPlane ?? getDefaults().customLeftPlane
  );
  const effectiveRightPlane = $derived(
    customRightPlane ?? getDefaults().customRightPlane
  );

  // Override detection (all categories)
  const hasOverride = $derived<OverrideState>({
    prop: _settings.prop !== null,
    propBuild: _settings.propBuild !== null,
    effects: _settings.effect !== null,
    effort: _settings.effortId !== null,
    planes: planeMode !== null,
  });

  const hasAnyOverride = $derived(
    hasOverride.prop ||
      hasOverride.propBuild ||
      hasOverride.effects ||
      hasOverride.effort ||
      hasOverride.planes
  );

  // Per-beat plane overrides. Key = beat index, value = { blue?, red? }
  // Beats without an entry use Plane.WALL (the default).
  let beatPlaneOverrides = $state<Map<number, { left?: Plane; right?: Plane }>>(
    new Map()
  );

  // Whether we're editing planes per-beat (true) or whole-sequence (false)
  let beatEditMode = $state(false);

  const ROTATION_VARIANTS: Plane[] = [Plane.WALL, Plane.WHEEL, Plane.FLOOR];
  const ROTATION_LABELS: string[] = ["Wall rot", "Wheel rot", "Floor rot"];
  let rotationVariantIndex = $state(loadPersistedRotVariant());

  // Per-character playback with unique persistence key
  const playback = createPlaybackState({
    onCycleComplete: () => handleCycleComplete(),
    persistenceKey: `tka-3d-playback-${id}`,
  });

  /**
   * Update visibility based on a beat's motion configs
   */
  function updateVisibilityFromStep(beat: StepMotionConfigs | undefined) {
    if (beat) {
      showLeft = beat.left !== null;
      showRight = beat.right !== null;
    }
  }

  /**
   * Handle beat cycle completion - advances to next beat or loops
   */
  function handleCycleComplete(): boolean {
    if (!loadedSequence || stepConfigs.length === 0) {
      return false;
    }

    if (currentStepIndex < stepConfigs.length - 1) {
      // More steps to play
      currentStepIndex++;
      updateVisibilityFromStep(stepConfigs[currentStepIndex]);
      return true;
    } else if (playback.loop) {
      // Loop back to start
      currentStepIndex = 0;
      updateVisibilityFromStep(stepConfigs[0]);
      return true;
    } else {
      // Sequence complete (no loop) - reset to beat 0 for next play
      currentStepIndex = 0;
      updateVisibilityFromStep(stepConfigs[0]);
      return false;
    }
  }

  // Derived state
  const hasSequence = $derived(loadedSequence !== null);
  const isCircular = $derived(
    loadedSequence ? isSeamlesslyLoopable3D(loadedSequence) : false
  );
  const currentStep = $derived<StepMotionConfigs | null>(
    stepConfigs.length > 0 ? (stepConfigs[currentStepIndex] ?? null) : null
  );
  const totalSteps = $derived(stepConfigs.length);

  // Active configs from current beat
  const activeLeftConfig = $derived<MotionConfig3D | null>(
    currentStep?.left ?? null
  );
  const activeRightConfig = $derived<MotionConfig3D | null>(
    currentStep?.right ?? null
  );

  // Effort easing: the 2D animator lets the user pick named easing profiles
  // (glide, punch, elastic, etc.) that reshape how progress flows within
  // each beat. The same curves apply cleanly here - we just transform the
  // raw progress that feeds into prop interpolation.
  // Timeline is sequence-scoped. Newer sequences store it under creatorIntent;
  // older ones use the top-level field.
  const effortTimeline = $derived<EffortTimeline | null>(
    loadedSequence?.creatorIntent?.effortTimeline ??
      loadedSequence?.effortTimeline ??
      null
  );

  // Resolves the active configs + eased progress for the current frame.
  // In phrase mode, easing can smear across beat boundaries, so the blue/red
  // configs here may come from a different step than currentStepIndex - this
  // matches how the 2D orchestrator picks a target step inside a phrase.
  // stepConfigs[0] is the start pose, so motion beat N lives at stepConfigs[N].
  function resolveEasedFrame(stepIndexAt: number, rawProgress: number) {
    const timeline = effortTimeline;
    const step = stepConfigs[stepIndexAt] ?? null;

    if (!timeline?.phrases?.length) {
      return {
        left: step?.left ?? null,
        right: step?.right ?? null,
        progress: applyEffort(effectiveEffortId, rawProgress),
      };
    }

    const motionStepIndex = Math.max(0, stepIndexAt - 1);
    const currentStep = motionStepIndex + 1 + rawProgress;
    const phrase = findPhraseAtBeat(timeline, currentStep);

    if (!phrase) {
      // Gaps between phrases play linearly.
      return {
        left: step?.left ?? null,
        right: step?.right ?? null,
        progress: rawProgress,
      };
    }

    const totalMotionSteps = Math.max(1, stepConfigs.length - 1);
    const { stepIndex, localProgress } = interpolatePhrase(
      phrase,
      currentStep,
      totalMotionSteps
    );

    const targetStep = stepConfigs[stepIndex + 1] ?? stepConfigs[stepIndex];
    return {
      left: targetStep?.left ?? null,
      right: targetStep?.right ?? null,
      progress: localProgress,
    };
  }

  const easedFrame = $derived.by(() =>
    resolveEasedFrame(currentStepIndex, playback.progress)
  );

  /**
   * The prop pair this sequence renders at an arbitrary motion score time,
   * where 0.00 is the start of beat 1. Runs the same eased-frame resolution
   * the live frame uses, so a planner sampling the future sees exactly the
   * geometry the renderer will present when the playhead gets there.
   */
  function propStatesAtScoreTime(scoreTime: number) {
    const motionSteps = Math.max(
      0,
      stepConfigs.length - motionStepOffsetValue()
    );
    if (motionSteps === 0) return { left: null, right: null };
    const wrapped = playback.loop
      ? ((scoreTime % motionSteps) + motionSteps) % motionSteps
      : Math.max(0, Math.min(motionSteps - 1e-6, scoreTime));
    const stepIndexAt = Math.min(
      stepConfigs.length - 1,
      Math.floor(wrapped) + motionStepOffsetValue()
    );
    const frame = resolveEasedFrame(stepIndexAt, wrapped - Math.floor(wrapped));
    return {
      left: frame.left ? calculatePropState(frame.left, frame.progress) : null,
      right: frame.right
        ? calculatePropState(frame.right, frame.progress)
        : null,
    };
  }

  function motionStepOffsetValue(): number {
    return hasStartPose ? 1 : 0;
  }

  // Computed prop states
  const leftPropState = $derived(
    easedFrame.left
      ? calculatePropState(easedFrame.left, easedFrame.progress)
      : null
  );
  const rightPropState = $derived(
    easedFrame.right
      ? calculatePropState(easedFrame.right, easedFrame.progress)
      : null
  );

  /**
   * Where the playhead sits in motion score time: 0.00 is the start of beat 1
   * and 7.99 the end of beat 8, matching `phaseOffsetSteps` on the live
   * performer. One owner, so every consumer samples the same clock.
   */
  const scoreTime = $derived(
    Math.max(0, currentStepIndex - motionStepOffsetValue()) + playback.progress
  );

  /**
   * Load a sequence for this character.
   * Auto-enables looping for circular sequences (matching 2D animator behavior).
   */
  function loadSequence(sequence: SequenceData) {
    loadedSequence = sequence;
    beatPlaneOverrides = new Map(); // Reset per-beat overrides for new sequence
    const modeConfig = getEffectiveModeConfig(effectivePlaneMode);

    // Get motion configs (beats 1+) and prepend start placement (beat 0)
    // so the full sequence including initial orientation is available.
    const motionConfigs = sequenceToMotionConfigs(
      sequence,
      Plane.WALL,
      modeConfig
    );
    const startConfig = getStartPlacementConfigs(
      sequence,
      Plane.WALL,
      modeConfig
    );
    stepConfigs = startConfig ? [startConfig, ...motionConfigs] : motionConfigs;
    hasStartPose = startConfig !== null;

    // DIAG: Dump raw start placement and configs
    if (sequence.startPlacement) {
      const sp = sequence.startPlacement;
      const _bm = sp.motions?.left;
      const _rm = sp.motions?.right;
    }
    if (stepConfigs[0]) {
      const _s = stepConfigs[0];
    }

    currentStepIndex = 0;
    playback.reset();
    updateVisibilityFromStep(stepConfigs[0]);

    // Auto-enable loop for circular sequences
    if (isSeamlesslyLoopable3D(sequence)) {
      playback.loop = true;
    }
  }

  /**
   * Clear loaded sequence
   */
  function clearSequence() {
    loadedSequence = null;
    stepConfigs = [];
    currentStepIndex = 0;
    showLeft = false;
    showRight = false;
    playback.reset();
  }

  /**
   * Switch between plane modes (wall vs dual wheel).
   * Re-converts the loaded sequence with the new mode's per-hand
   * plane assignments and lateral offsets, and rotates the character
   * to match the mode's facing angle.
   */
  /** Build an effective mode config with the current rotation variant override */
  function getEffectiveModeConfig(mode: PlaneMode): PlaneModeConfig {
    if (mode === PlaneMode.CUSTOM) {
      return {
        facingAngle: 0,
        bluePlane: effectiveLeftPlane,
        redPlane: effectiveRightPlane,
        // No rotationPlane - each hand rotates on its own position plane
        blueLateralOffset: 0,
        redLateralOffset: 0,
      };
    }
    const base = PLANE_MODE_CONFIGS[mode];
    // Dual-wheel no longer needs special overrides - the unified rotation
    // pipeline handles wheel plane correctly without skipFacingTransform
    // or rotationPlane overrides. The character faces forward, lateral offsets
    // place each hand's wheel plane to the sides.
    return base;
  }

  function setPlaneMode(mode: PlaneMode) {
    planeMode = mode;
    if (persistToStorage) {
      try {
        localStorage.setItem(PLANE_MODE_KEY, mode);
      } catch {
        /* ignore */
      }
    }

    // Sync custom plane trackers to the preset's planes when switching away from CUSTOM
    if (mode !== PlaneMode.CUSTOM) {
      const config = PLANE_MODE_CONFIGS[mode];
      customLeftPlane = config.bluePlane;
      customRightPlane = config.redPlane;
    }

    const modeConfig = getEffectiveModeConfig(mode);

    // Snap character rotation to match mode orientation immediately
    facingAngle = modeConfig.facingAngle;
    targetFacingAngle = modeConfig.facingAngle;

    // Re-convert loaded sequence with new plane assignments
    reconvertWithConfig(modeConfig);
  }

  /**
   * Set a single hand's plane independently. The PlaneMode is derived from
   * the combined assignment - both hands on Wheel becomes DUAL_WHEEL (needed
   * for lateral rendering), both on Wall becomes WALL, anything else becomes
   * CUSTOM. Re-converts the sequence with the effective config.
   */
  function setHandPlane(hand: "left" | "right", plane: Plane) {
    const beforeSnapshot = capturePerformerSnapshot();
    if (hand === "left") customLeftPlane = plane;
    else customRightPlane = plane;

    planeMode = derivePlaneModeFromHands(
      customLeftPlane ?? getDefaults().customLeftPlane,
      customRightPlane ?? getDefaults().customRightPlane
    );
    if (persistToStorage) {
      try {
        localStorage.setItem(PLANE_MODE_KEY, planeMode);
      } catch {
        /* ignore */
      }
    }

    reconvertWithConfig(getEffectiveModeConfig(planeMode));
    const afterSnapshot = capturePerformerSnapshot();
    sceneUndo.pushSelfRestoringEntry(
      "set-hand-plane",
      `${hand} hand: ${plane}`,
      {
        undo: () => restorePerformerSnapshot(beforeSnapshot),
        redo: () => restorePerformerSnapshot(afterSnapshot),
      }
    );
  }

  /**
   * Set a specific beat's plane for one hand. Switches to CUSTOM mode
   * and re-applies all per-beat overrides to the step configs.
   *
   * Always forces CUSTOM - per-beat overrides are intentional deviations
   * from the sequence-wide setting, so they can never map to a preset mode
   * regardless of what the global hand assignment would derive.
   */
  function setStepHandPlane(
    stepNumber: number,
    hand: "left" | "right",
    plane: Plane
  ) {
    const beforeSnapshot = capturePerformerSnapshot();
    const current = beatPlaneOverrides.get(stepNumber) ?? {};
    const updated = { ...current, [hand]: plane };

    if (
      (!updated.left || updated.left === Plane.WALL) &&
      (!updated.right || updated.right === Plane.WALL)
    ) {
      beatPlaneOverrides.delete(stepNumber);
    } else {
      beatPlaneOverrides.set(stepNumber, updated);
    }

    beatPlaneOverrides = new Map(beatPlaneOverrides);

    if (planeMode !== PlaneMode.CUSTOM) {
      planeMode = PlaneMode.CUSTOM;
    }

    applyBeatPlaneOverrides();
    const afterSnapshot = capturePerformerSnapshot();
    sceneUndo.pushSelfRestoringEntry(
      "set-beat-plane-override",
      `Step ${stepNumber} ${hand}: ${plane}`,
      {
        undo: () => restorePerformerSnapshot(beforeSnapshot),
        redo: () => restorePerformerSnapshot(afterSnapshot),
      }
    );
  }

  /**
   * Get the plane assignments for a specific beat.
   * Returns the override if one exists, otherwise the effective
   * whole-sequence hand plane (which defaults to WALL).
   */
  function getStepPlanes(stepNumber: number): { left: Plane; right: Plane } {
    const override = beatPlaneOverrides.get(stepNumber);
    return {
      left: override?.left ?? effectiveLeftPlane,
      right: override?.right ?? effectiveRightPlane,
    };
  }

  /**
   * Re-convert the entire sequence with the effective whole-sequence hand
   * planes as the baseline, then patch in per-beat plane overrides for any
   * beats that have them. The baseline must NOT be flat WALL: a performer
   * whose hands live on wheel with one overridden beat keeps wheel on every
   * other beat.
   */
  function applyBeatPlaneOverrides() {
    if (!loadedSequence) return;

    const modeConfig = getEffectiveModeConfig(effectivePlaneMode);
    const motionConfigs = sequenceToMotionConfigs(
      loadedSequence,
      Plane.WALL,
      modeConfig
    );
    const startConfig = getStartPlacementConfigs(
      loadedSequence,
      Plane.WALL,
      modeConfig
    );
    const allConfigs = startConfig
      ? [startConfig, ...motionConfigs]
      : motionConfigs;

    // Patch per-beat overrides into individual configs
    for (const [beatIdx, override] of beatPlaneOverrides) {
      const config = allConfigs[beatIdx];
      if (!config) continue;

      if (override.left && config.left) {
        config.left = { ...config.left, plane: override.left };
      }
      if (override.right && config.right) {
        config.right = { ...config.right, plane: override.right };
      }
    }

    stepConfigs = allConfigs;
    updateVisibilityFromStep(stepConfigs[currentStepIndex] ?? stepConfigs[0]);
  }

  /**
   * Clear all per-beat plane overrides, resetting every beat to WALL.
   */
  function clearBeatPlaneOverrides() {
    beatPlaneOverrides = new Map();
    if (planeMode === PlaneMode.CUSTOM) {
      planeMode = null; // Reset to inherit
      reconvertWithConfig(getEffectiveModeConfig(effectivePlaneMode));
    }
  }

  /**
   * Clear all per-step plane overrides WITHOUT touching the current plane
   * mode. Unlike `clearBeatPlaneOverrides`, this never resets `planeMode` to
   * inherit - callers that manage the whole-sequence hand planes themselves
   * (e.g. the film director, via `setHandPlane`) can be mid-way through
   * deliberately establishing CUSTOM mode, and a reset here would undo that.
   * Used to wipe a previous shot's per-step overrides before a new shot
   * applies its own, without disturbing that shot's own `setHandPlane` calls.
   */
  function clearStepPlaneOverrides(): void {
    if (beatPlaneOverrides.size === 0) return;
    beatPlaneOverrides = new Map();
    applyBeatPlaneOverrides();
  }

  // Derived: planes for the currently selected beat
  const currentStepPlanes = $derived(getStepPlanes(currentStepIndex));

  /**
   * Debug: cycle through rotation plane variants and re-convert.
   * Returns the label of the new variant so the UI can show it.
   */
  function cycleRotationVariant(): string {
    rotationVariantIndex =
      (rotationVariantIndex + 1) % ROTATION_VARIANTS.length;
    if (persistToStorage) {
      try {
        localStorage.setItem(ROT_VARIANT_KEY, String(rotationVariantIndex));
      } catch {
        /* ignore */
      }
    }
    const modeConfig = getEffectiveModeConfig(effectivePlaneMode);
    reconvertWithConfig(modeConfig);
    return ROTATION_LABELS[rotationVariantIndex] ?? "Unknown";
  }

  /** Re-convert the loaded sequence with the given mode config */
  function reconvertWithConfig(modeConfig: PlaneModeConfig) {
    if (!loadedSequence) return;
    const motionConfigs = sequenceToMotionConfigs(
      loadedSequence,
      Plane.WALL,
      modeConfig
    );
    const startConfig = getStartPlacementConfigs(
      loadedSequence,
      Plane.WALL,
      modeConfig
    );
    stepConfigs = startConfig ? [startConfig, ...motionConfigs] : motionConfigs;
    hasStartPose = startConfig !== null;

    updateVisibilityFromStep(stepConfigs[currentStepIndex] ?? stepConfigs[0]);
  }

  /**
   * Navigate to next beat
   */
  function nextStep() {
    if (stepConfigs.length === 0) return;
    currentStepIndex = Math.min(currentStepIndex + 1, stepConfigs.length - 1);
    playback.reset();
    updateVisibilityFromStep(stepConfigs[currentStepIndex]);
  }

  /**
   * Navigate to previous beat
   */
  function prevStep() {
    if (stepConfigs.length === 0) return;
    currentStepIndex = Math.max(currentStepIndex - 1, 0);
    playback.reset();
    updateVisibilityFromStep(stepConfigs[currentStepIndex]);
  }

  /**
   * Jump to specific beat
   */
  function goToStep(index: number) {
    if (stepConfigs.length === 0) return;
    currentStepIndex = Math.max(0, Math.min(index, stepConfigs.length - 1));
    playback.reset();
    updateVisibilityFromStep(stepConfigs[currentStepIndex]);
  }

  /**
   * Set character model
   */
  function setCharacter(modelId: CharacterId) {
    if (characterId === modelId) return;
    const before = characterId;
    characterId = modelId;
    const name =
      CHARACTER_DEFINITIONS.find((definition) => definition.id === modelId)
        ?.name ?? modelId;
    sceneUndo.pushSelfRestoringEntry("change-character", `Character: ${name}`, {
      undo: () => {
        characterId = before;
      },
      redo: () => {
        characterId = modelId;
      },
    });
  }

  function setPresenceProgress(progress: number) {
    presenceProgress = Math.max(0, Math.min(1, progress));
  }

  /**
   * Set the user-assigned display name. Trims; an empty string clears the
   * override so the character model's name shows through again.
   */
  function setDisplayName(name: string | null) {
    const trimmed = name?.trim();
    displayName = trimmed ? trimmed : null;
  }

  // ============================================
  // Locomotion Methods
  // ============================================

  /**
   * Set travel state directly. Scripted blocking states direction, ground
   * speed, and whether the performer is moving separately: a performer
   * standing at the end of a walk still has a direction they last travelled,
   * and the walk clip still needs a speed to be scaled by.
   */
  function setTravel(travel: {
    direction: { x: number; z: number };
    speed: number;
    moving: boolean;
    gaitTimingSample?: ScheduledGaitTimingSample | null;
    terminalStepPlan?: TerminalStepPlan | null;
  }) {
    moveInput = travel.direction;
    moveSpeed = travel.speed;
    isMoving = travel.moving;
    gaitTimingSample = travel.gaitTimingSample ?? null;
    terminalStepPlan = travel.terminalStepPlan ?? null;
  }

  /**
   * Set movement input from WASD keys.
   * Used by UnifiedCameraController to update animation state.
   * @param input.x - Strafe: -1 (A/left) to 1 (D/right)
   * @param input.z - Forward/back: -1 (S/back) to 1 (W/forward)
   */
  function setMoveInput(input: { x: number; z: number }) {
    setTravel({
      direction: input,
      speed: moveSpeed,
      moving: input.x !== 0 || input.z !== 0,
    });
  }

  /**
   * @deprecated Movement is now handled by UnifiedCameraController.
   * This method exists only for interface compatibility.
   * Position updates happen directly through the character position.
   */
  function updateMovement(_delta: number, _cameraAngle: number) {
    // NO-OP: Movement calculation moved to UnifiedCameraController
    // for unified behavior across Stage and Infinite Worlds.
    // Position is now mutated directly by the controller.
  }

  /**
   * Stop all movement immediately.
   */
  function stopMovement() {
    setTravel({ direction: { x: 0, z: 0 }, speed: 0, moving: false });
  }

  /**
   * Set facing angle target.
   * Called by UnifiedCameraController to tell the character where to face.
   * In third-person mode this sets a target that the character turns toward
   * smoothly. In first-person mode, use snapFacingAngle for instant response.
   */
  function setFacingAngle(value: number) {
    targetFacingAngle = value;
  }

  /**
   * Snap facing angle instantly (no lerp). Used for first-person mode
   * where the character body must exactly match the camera direction.
   */
  function snapFacingAngle(value: number) {
    facingAngle = value;
    targetFacingAngle = value;
  }

  // ============================================
  // Performer Settings (setter functions - _settings declared near top)
  // ============================================

  const sceneUndo = getSceneUndoManager();

  function capturePerformerSnapshot(): PerformerDomainSnapshot {
    return structuredClone({
      index: -1, // filled by caller if needed
      selectedPerformerIndex: null,
      characterId,
      displayName,
      loadedSequence: $state.snapshot(loadedSequence),
      settings: {
        prop: _settings.prop,
        effortId: _settings.effortId,
        effect: _settings.effect,
        handEffects: $state.snapshot(_settings.handEffects),
        staffLengthCm: _settings.staffLengthCm,
        propBuild: $state.snapshot(_settings.propBuild),
      },
      planes: {
        customLeftPlane,
        customRightPlane,
        planeMode,
        beatPlaneOverrides: new Map(beatPlaneOverrides),
      },
    });
  }

  function restorePerformerSnapshot(snap: PerformerDomainSnapshot): void {
    characterId = snap.characterId;
    displayName = snap.displayName;
    _settings = {
      prop: snap.settings.prop,
      effortId: snap.settings.effortId,
      effect: snap.settings.effect,
      handEffects: snap.settings.handEffects,
      staffLengthCm: snap.settings.staffLengthCm,
      propBuild: snap.settings.propBuild,
    };
    customLeftPlane = snap.planes.customLeftPlane;
    customRightPlane = snap.planes.customRightPlane;
    planeMode = snap.planes.planeMode;
    if (snap.loadedSequence) loadSequence(snap.loadedSequence);
    else clearSequence();
    beatPlaneOverrides = new Map(snap.planes.beatPlaneOverrides);
    reconvertWithConfig(getEffectiveModeConfig(effectivePlaneMode));
  }

  // Performer undo uses pushSelfRestoringEntry so each performer's closures
  // are captured in the entry itself, avoiding the "last registration wins"
  // problem that a shared "performer" domain would have.

  function setEffort(
    effortId: EffortId,
    options?: { recordUndo?: boolean }
  ): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, effortId };
    // A frame-driven write is not a performer choosing an effort. The film
    // director changes effort at authored steps, every scene, on a loop; one
    // history entry per step boundary would bury every real edit under them.
    if (options?.recordUndo === false) return;
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry("change-effort", `Effort: ${effortId}`, {
      undo: () => {
        _settings = before;
      },
      redo: () => {
        _settings = after;
      },
    });
  }

  function setProp(prop: PropType, options?: { equipBuild?: boolean }): void {
    const before = $state.snapshot(_settings);

    // Picking a new prop while an effect is running is the same request as
    // picking the effect: a day fan handed to a performer who is already on
    // fire needs the fire build too.
    //
    // Only across a family change, though. Choosing "Staff" from the Double
    // Staff build radio, or a day fan from the fan build radio, is the
    // performer overriding the equip on purpose — bouncing them back would
    // make that control unusable.
    // A prop with no family is its own family, so a fan-to-quiad switch still
    // reads as a change rather than as two undefineds matching.
    const familyOf = (p: PropType): unknown => findScenePropFamily(p) ?? p;
    const changesFamily = familyOf(effectiveProp) !== familyOf(prop);
    const equip =
      options?.equipBuild === false || !changesFamily
        ? null
        : buildForEffect(prop, _settings.effect, effectivePropBuild);

    _settings = {
      ..._settings,
      prop: equip?.prop ?? prop,
      ...(equip?.propBuild
        ? { propBuild: { ...(_settings.propBuild ?? {}), ...equip.propBuild } }
        : {}),
    };
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry("change-prop", `Prop: ${prop}`, {
      undo: () => {
        _settings = before;
      },
      redo: () => {
        _settings = after;
      },
    });
  }

  /**
   * Set the single active per-performer effect. Pass an EffectType to apply it
   * (radio semantics - replaces any prior effect), "none" to explicitly turn
   * effects off for this performer, or null to clear the override and inherit
   * the global default.
   */
  function setEffect(
    effect: EffectType | null,
    options?: { equipBuild?: boolean; recordUndo?: boolean }
  ): void {
    const before = $state.snapshot(_settings);

    // An effect equips the build that can carry it: fire on a fan puts the
    // five-wick fire fan in this performer's hand so the flames have real
    // wicks to come off. Same undo entry as the effect itself — a second
    // entry would let Ctrl+Z drop the effect and leave the build behind.
    //
    // Restore paths pass `equipBuild: false`. Replaying a stored effect is
    // not a performer choosing one, and equipping there would write back
    // overrides the saved scene deliberately does not carry.
    const equip =
      options?.equipBuild === false
        ? null
        : buildForEffect(effectiveProp, effect, effectivePropBuild);

    _settings = {
      ..._settings,
      effect,
      // Radio semantics reach both hands: one effect for the performer means
      // there is no longer a pair, so a stale pair must not survive it.
      handEffects: null,
      ...(equip?.prop ? { prop: equip.prop } : {}),
      ...(equip?.propBuild
        ? { propBuild: { ...(_settings.propBuild ?? {}), ...equip.propBuild } }
        : {}),
    };
    // See setEffort: frame-driven writes stay out of the undo history.
    if (options?.recordUndo === false) return;
    const after = $state.snapshot(_settings);
    const label = equip
      ? `Effect: ${effect ?? "inherit"} (build equipped)`
      : `Effect: ${effect ?? "inherit"}`;
    sceneUndo.pushSelfRestoringEntry("toggle-effect", label, {
      undo: () => {
        _settings = before;
      },
      redo: () => {
        _settings = after;
      },
    });
  }

  /**
   * Give this performer's hands different effects. The renderer already
   * resolves an effect per prop, so the pair only has to reach the tip map
   * `Viewer3DScene` builds: prop 0 is the left hand, prop 1 the right.
   *
   * `effect` is set to the left hand's value so every consumer that reads one
   * whole-performer effect (the Performer Hub's selection, the environment
   * this film picks from its effects) still gets a real answer rather than a
   * silent "none".
   */
  function setHandEffects(
    left: EffectType,
    right: EffectType,
    options?: { recordUndo?: boolean }
  ): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, effect: left, handEffects: { left, right } };
    if (options?.recordUndo === false) return;
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry(
      "toggle-effect",
      `Effects: ${left} / ${right}`,
      {
        undo: () => {
          _settings = before;
        },
        redo: () => {
          _settings = after;
        },
      }
    );
  }

  function setStaffLengthCm(cm: number | null): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, staffLengthCm: cm };
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntryCoalescing(
      "change-staff-length",
      "Staff length",
      {
        undo: () => {
          _settings = before;
        },
        redo: () => {
          _settings = after;
        },
      },
      "staff-length"
    );
  }

  function setPropBuild(propBuild: Partial<PropBuild>): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, propBuild };
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry("change-prop-build", "Prop build", {
      undo: () => {
        _settings = before;
      },
      redo: () => {
        _settings = after;
      },
    });
  }

  // ============================================
  // Reset Methods (clear overrides → inherit from defaults)
  // ============================================

  function resetProp(): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, prop: null };
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry("change-prop", "Reset prop to default", {
      undo: () => {
        _settings = before;
      },
      redo: () => {
        _settings = after;
      },
    });
  }

  function resetPropBuild(): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, propBuild: null };
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry(
      "change-prop-build",
      "Reset prop build to default",
      {
        undo: () => {
          _settings = before;
        },
        redo: () => {
          _settings = after;
        },
      }
    );
  }

  function resetEffort(): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, effortId: null };
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry(
      "change-effort",
      "Reset effort to default",
      {
        undo: () => {
          _settings = before;
        },
        redo: () => {
          _settings = after;
        },
      }
    );
  }

  function resetEffects(): void {
    const before = $state.snapshot(_settings);
    _settings = { ..._settings, effect: null, handEffects: null };
    const after = $state.snapshot(_settings);
    sceneUndo.pushSelfRestoringEntry(
      "toggle-effect",
      "Reset effects to default",
      {
        undo: () => {
          _settings = before;
        },
        redo: () => {
          _settings = after;
        },
      }
    );
  }

  function resetPlanes(): void {
    const beforeSnap = capturePerformerSnapshot();
    planeMode = null;
    customLeftPlane = null;
    customRightPlane = null;
    reconvertWithConfig(getEffectiveModeConfig(effectivePlaneMode));
    const afterSnap = capturePerformerSnapshot();
    sceneUndo.pushSelfRestoringEntry(
      "set-hand-plane",
      "Reset planes to default",
      {
        undo: () => restorePerformerSnapshot(beforeSnap),
        redo: () => restorePerformerSnapshot(afterSnap),
      }
    );
  }

  function resetAllOverrides(): void {
    const beforeSnap = capturePerformerSnapshot();
    _settings = {
      prop: null,
      propBuild: null,
      effortId: null,
      effect: null,
      handEffects: null,
      staffLengthCm: _settings.staffLengthCm,
    };
    planeMode = null;
    customLeftPlane = null;
    customRightPlane = null;
    reconvertWithConfig(getEffectiveModeConfig(effectivePlaneMode));
    const afterSnap = capturePerformerSnapshot();
    sceneUndo.pushSelfRestoringEntry("change-prop", "Reset all overrides", {
      undo: () => restorePerformerSnapshot(beforeSnap),
      redo: () => restorePerformerSnapshot(afterSnap),
    });
  }

  /**
   * Update locomotion state each frame. Lerps facing angle toward
   * target for smooth character rotation in third-person mode.
   * @param delta - frame time in seconds
   */
  function updateLocomotion(delta: number) {
    // Smoothly rotate toward target facing angle.
    // Use shortest-path rotation (handle angle wrapping around ±π).
    let diff = targetFacingAngle - facingAngle;

    // Normalize to [-π, π] for shortest rotation path
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // If close enough, snap to avoid oscillation
    if (Math.abs(diff) < 0.01) {
      facingAngle = targetFacingAngle;
    } else {
      // Lerp at constant angular speed, capped to not overshoot
      const maxStep = ROTATION_SPEED * delta;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
      facingAngle += step;
    }
  }

  return {
    // Identity
    id,
    get config() {
      return config;
    },

    // Position (full 3D)
    get position() {
      return position;
    },

    // Facing angle for rotation
    get facingAngle() {
      return facingAngle;
    },
    set facingAngle(value: number) {
      targetFacingAngle = value;
    },

    // Movement state
    get isMoving() {
      return isMoving;
    },

    // Move direction for animation blending (raw input, not camera-rotated)
    get moveDirection() {
      return moveInput;
    },

    /** Ground speed in m/s, used to scale the walk clip's playback rate. */
    get moveSpeed() {
      return moveSpeed;
    },
    get gaitTimingSample() {
      return gaitTimingSample;
    },
    get terminalStepPlan() {
      return terminalStepPlan;
    },

    // Locomotion methods
    setTravel,
    setMoveInput,
    updateMovement,
    updateLocomotion,
    stopMovement,
    setFacingAngle,
    snapFacingAngle,

    // Character model
    get characterId() {
      return characterId;
    },
    setCharacter,
    get presenceProgress() {
      return presenceProgress;
    },
    setPresenceProgress,
    /** User-assigned display name; null = inherit the character model's name. */
    get displayName() {
      return displayName;
    },
    setDisplayName,
    captureEditingSnapshot: capturePerformerSnapshot,
    restoreEditingSnapshot: restorePerformerSnapshot,

    // Sequence state
    get hasSequence() {
      return hasSequence;
    },
    get isCircular() {
      return isCircular;
    },
    get loadedSequence() {
      return loadedSequence;
    },
    get planeMode() {
      return effectivePlaneMode;
    },
    get rawPlaneMode() {
      return planeMode;
    },
    setPlaneMode,
    setHandPlane,
    setStepHandPlane,
    clearBeatPlaneOverrides,
    clearStepPlaneOverrides,
    getStepPlanes,
    get customLeftPlane() {
      return effectiveLeftPlane;
    },
    get customRightPlane() {
      return effectiveRightPlane;
    },
    get rawLeftPlane() {
      return customLeftPlane;
    },
    get rawRightPlane() {
      return customRightPlane;
    },
    get currentStepLeftPlane() {
      return currentStepPlanes.left;
    },
    get currentStepRightPlane() {
      return currentStepPlanes.right;
    },
    get beatPlaneOverrides() {
      return beatPlaneOverrides;
    },
    get hasStepOverrides() {
      return beatPlaneOverrides.size > 0;
    },
    get beatEditMode() {
      return beatEditMode;
    },
    setStepEditMode(enabled: boolean) {
      beatEditMode = enabled;
    },
    cycleRotationVariant,
    get rotationVariantLabel() {
      return ROTATION_LABELS[rotationVariantIndex];
    },
    get currentStepIndex() {
      return currentStepIndex;
    },
    get currentStep() {
      return currentStep;
    },
    get totalSteps() {
      return totalSteps;
    },
    /**
     * Index of the first motion step in `stepConfigs`. 1 when the loaded
     * sequence contributed a static start pose at index 0, otherwise 0. Live
     * phase math is motion-relative and adds this to reach a beat.
     */
    get motionStepOffset() {
      return motionStepOffsetValue();
    },
    /** Motion beats in the loaded sequence, excluding any static start pose. */
    get motionStepCount() {
      return Math.max(0, stepConfigs.length - motionStepOffsetValue());
    },
    /** Playhead in motion score time; 0.00 is the start of beat 1. */
    get scoreTime() {
      return scoreTime;
    },
    propStatesAtScoreTime,

    // Visibility
    get showLeft() {
      return showLeft;
    },
    get showRight() {
      return showRight;
    },

    // Active configs
    get activeLeftConfig() {
      return activeLeftConfig;
    },
    get activeRightConfig() {
      return activeRightConfig;
    },

    // Prop states
    get leftPropState() {
      return leftPropState;
    },
    get rightPropState() {
      return rightPropState;
    },

    // Playback delegation
    get isPlaying() {
      return playback.isPlaying;
    },
    get progress() {
      return playback.progress;
    },
    get speed() {
      return playback.speed;
    },
    set speed(value: number) {
      playback.speed = value;
    },
    get loop() {
      return playback.loop;
    },
    set loop(value: boolean) {
      playback.loop = value;
    },

    // Effort state (for UI readouts / debugging)
    get effortPreset() {
      return effectiveEffortId;
    },
    get effortTimeline() {
      return effortTimeline;
    },

    // Playback methods
    play: playback.play,
    pause: playback.pause,
    togglePlay: playback.togglePlay,
    reset: playback.reset,
    setProgress: playback.setProgress,
    destroy: () => {
      playback.destroy();
    },
    autoStartIfNeeded: playback.autoStartIfNeeded,

    // Sequence methods
    loadSequence,
    clearSequence,
    nextStep,
    prevStep,
    goToStep,

    // Performer settings
    get settings() {
      return _settings;
    },
    setEffort,
    setProp,
    setEffect,
    setHandEffects,
    setStaffLengthCm,
    setPropBuild,

    // Effective values (resolved cascade: null → inherit from viewer defaults)
    get effectiveProp() {
      return effectiveProp;
    },
    get effectivePropBuild() {
      return effectivePropBuild;
    },
    get effectiveEffortId() {
      return effectiveEffortId;
    },
    /** Per-performer effect override; null = inherit the global default. */
    get rawEffect() {
      return rawEffect;
    },
    /**
     * One effect per hand, or null when both hands take `rawEffect`. Consumers
     * that build a tip map read this first: a pair keys the map per prop, a
     * null keys it with the wildcard exactly as it always has.
     */
    get rawHandEffects() {
      return rawHandEffects;
    },
    get effectivePlaneMode() {
      return effectivePlaneMode;
    },
    get effectiveLeftPlane() {
      return effectiveLeftPlane;
    },
    get effectiveRightPlane() {
      return effectiveRightPlane;
    },

    // Override detection
    get hasOverride() {
      return hasOverride;
    },
    get hasAnyOverride() {
      return hasAnyOverride;
    },

    // Reset methods (clear overrides → inherit from defaults)
    resetProp,
    resetPropBuild,
    resetEffort,
    resetEffects,
    resetPlanes,
    resetAllOverrides,
  };
}

export type CharacterInstanceState = ReturnType<
  typeof createCharacterInstanceState
>;
