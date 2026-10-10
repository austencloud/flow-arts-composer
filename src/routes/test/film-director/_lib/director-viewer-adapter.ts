import { Plane } from "@austencloud/scene-3d";
import type { PerspectiveCamera } from "three";

import { getRegistration } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import { getSceneUndoManager } from "#lib/shared/3d/undo/get-scene-undo-manager.js";
import type {
  Viewer3DState,
  Viewer3DStateSeed,
} from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import type {
  EffectsConfig,
  EffectType,
} from "#lib/shared/effects/domain/effects-config.js";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import type { EffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

import type { DirectorBlockingFrame } from "./director-blocking-track";
import type { DirectorCameraFrame } from "./director-camera-track";
import { resolveStepChange, resolveStepRamp } from "./director-step-changes";
import type {
  ResolvedDirectorHandEffects,
  ResolvedDirectorScene,
} from "./film-director-schema";
import { resolveDirectorPerformerPoolSize } from "./film-director-performance-policy";
import { isIdleSequence } from "./sequence-language";

interface ApplyDirectorSceneOptions {
  /** Keep a stable rig pool so a cut never destroys and rebuilds half the cast. */
  reservedPerformerCount?: number;
  /**
   * Performer id → the sequence that performer spins in this scene, from
   * `director-sequence-library`. A performer with no entry — or a scene applied
   * before the library has finished generating — falls back to the film's
   * shared sequence. The one exception is a performer whose scene sequence is
   * `{source: "none"}`: they are skipped by name rather than falling back,
   * because they are standing and watching rather than waiting on a load.
   */
  sequences?: ReadonlyMap<string, SequenceData>;
}

/**
 * Cast slots that spin nothing this scene. Their performers must be left with
 * no loaded sequence: both the pooled backfill and the per-performer load
 * below otherwise hand every performer the film's shared sequence, which is
 * the right default for a performer whose own sequence has not resolved yet
 * and exactly wrong for one who is standing and watching.
 */
export function idlePerformerIndices(
  scene: ResolvedDirectorScene
): ReadonlySet<number> {
  const idle = new Set<number>();
  scene.performance.performers.forEach((performer, index) => {
    if (isIdleSequence(performer.sequence)) idle.add(index);
  });
  return idle;
}

export function buildDirectorViewerSeed(
  scene: ResolvedDirectorScene
): Viewer3DStateSeed {
  const camera = scene.camera.keyframes[0]!;
  return {
    renderMode: "3d",
    environmentId: scene.location.environmentId,
    camera: {
      position: {
        x: camera.position[0],
        y: camera.position[1],
        z: camera.position[2],
      },
      target: {
        x: camera.target[0],
        y: camera.target[1],
        z: camera.target[2],
      },
      rotation: { x: 0, y: 0, z: 0 },
      fov: camera.fovDeg,
      timestamp: 0,
    },
    performers: scene.performance.performers.map((performer) => ({
      characterId: performer.characterId,
      position: { ...performer.position },
      facingAngle: performer.facingAngle,
      customLeftPlane: performer.leftPlane,
      customRightPlane: performer.rightPlane,
      name: performer.name,
      settings: {
        prop: performer.prop,
        effortId: performer.effort,
        effect: performer.effect,
        staffLengthCm: performer.staffLengthCm,
      },
    })),
    selectedPerformerIndex: null,
    activeFormation: scene.performance.formation,
    defaultProp: PropType.STAFF,
    oceanVariant: "abyss",
    navMode: "orbit",
    activePreset: null,
    activeCameraPreset: "director",
    showGridLabels: false,
    visiblePlanes: scene.location.visiblePlanes,
    effectToggles: {},
  };
}

export function applyDirectorSceneToViewer(
  viewer: Viewer3DState,
  scene: ResolvedDirectorScene,
  options: ApplyDirectorSceneOptions = {}
): void {
  const manager = viewer.performerManager;
  const performerPoolSize = resolveDirectorPerformerPoolSize(
    scene.performance.performers.length,
    options.reservedPerformerCount
  );
  viewer.setEnvironmentId(scene.location.environmentId);
  const idle = idlePerformerIndices(scene);

  getSceneUndoManager().withoutUndo(() => {
    manager.ensurePerformerCount(performerPoolSize);
    while (manager.performers.length > performerPoolSize) {
      manager.removePerformer(manager.performers.length - 1);
    }
    manager.cancelFormationTransition();

    // `ensurePerformerCount` above can create pooled performers that were
    // never part of the sequence load `enter3D` ran at mount (that call only
    // reaches the performers that already existed at that moment - the first
    // scene's cast). `performer-manager`'s `addPerformer` never calls
    // `loadSequence` itself, so without this backfill any such performer's
    // `setStepHandPlane` below would silently no-op forever:
    // `applyBeatPlaneOverrides` bails out whenever `loadedSequence` is null.
    // Load once, the first time each pooled performer is touched.
    const sequenceData = viewer.currentSequenceData;
    // Gap 21. Nobody is cast, so nothing spins. Skipping the backfill is not
    // enough on its own: a pooled rig reused from an earlier scene is still
    // holding whatever it spun there, and the per-performer loop below has no
    // entries to reach it with. Clear the whole pool instead.
    const emptyStage = scene.performance.performers.length === 0;
    if (emptyStage) {
      for (const performer of manager.performers) {
        if (performer.hasSequence) performer.clearSequence();
      }
    }
    if (sequenceData && !emptyStage) {
      for (const [index, performer] of manager.performers.entries()) {
        if (idle.has(index)) continue;
        if (!performer.hasSequence) performer.loadSequence(sequenceData);
      }
    }

    // Wipe every pooled performer's leftover per-step overrides before this
    // scene's own `stepPlanes` go on below. A performer reused from an
    // earlier scene - or a pool member that scene never cast - must never
    // carry a stale per-step plane forward onto a cut that doesn't repeat it.
    for (const performer of manager.performers) {
      performer.clearStepPlaneOverrides();
    }

    scene.performance.performers.forEach((directed, index) => {
      const performer = manager.performers[index];
      if (!performer) return;
      performer.position.x = directed.position.x;
      performer.position.z = directed.position.z;
      performer.snapFacingAngle(directed.facingAngle);
      performer.setDisplayName(directed.name);
      performer.setCharacter(directed.characterId);
      performer.setProp(directed.prop, { equipBuild: false });
      // Gap 23. An unstated build is not "keep the last scene's build": a
      // pooled performer carries whatever the previous cut equipped, so an
      // absent build resets the override and lets the global build show.
      performer.setPropBuild(directed.propBuild ?? {});
      writePerformerEffect(performer, directed.effect, directed.handEffects, {
        equipBuild: false,
      });
      performer.setEffort(directed.effort);
      performer.setStaffLengthCm(directed.staffLengthCm);

      // Before the planes, not after: `loadSequence` rebuilds this performer's
      // step configs from whatever plane assignment is current and wipes their
      // per-step overrides, so a load that lands after `setHandPlane` would
      // discard both. Identity-compared because the library hands back the
      // same cached object every scene — reloading would reset playback.
      //
      // Skipping the load is not enough for a watcher: `enter3D` hands the
      // film's shared sequence to every performer at mount, and a performer
      // reused from an earlier scene carries whatever they spun there. Clear
      // it so the body idles and the props stop rendering.
      if (idle.has(index)) {
        if (performer.hasSequence) performer.clearSequence();
      } else {
        const directedSequence =
          options.sequences?.get(directed.id) ?? sequenceData;
        if (directedSequence && performer.loadedSequence !== directedSequence) {
          performer.loadSequence(directedSequence);
        }
      }

      performer.setHandPlane("left", directed.leftPlane);
      performer.setHandPlane("right", directed.rightPlane);
      for (const entry of directed.stepPlanes) {
        performer.setStepHandPlane(entry.step, entry.hand, entry.plane);
      }
    });

    viewer.hideAllPlanes();
    for (const plane of scene.location.visiblePlanes) {
      viewer.togglePlane(plane);
    }
  });
}

export function applyDirectorEffectPresets(
  state: EffectsConfigState,
  scene: ResolvedDirectorScene
): void {
  const config = structuredClone(DEFAULT_EFFECTS_CONFIG) as EffectsConfig;
  const mutable = config as unknown as Record<string, unknown>;

  for (const [effectId, presetId] of Object.entries(scene.effectPresets)) {
    const registration = getRegistration(effectId);
    const preset = registration?.presetGroup.presets.find(
      (candidate) => candidate.id === presetId
    );
    if (!registration || !preset?.patch) continue;

    mutable[effectId] = {
      ...(mutable[effectId] as Record<string, unknown>),
      ...preset.patch,
    };
    config.activePresets[
      registration.presetGroup.effectType as keyof typeof config.activePresets
    ] = presetId;
  }

  for (const [effectId, patch] of Object.entries(scene.effectOverrides)) {
    mutable[effectId] = {
      ...(mutable[effectId] as Record<string, unknown>),
      ...patch,
    };
  }

  state.replace(config);
}

/**
 * Drives the cast's staging for one frame: where each performer stands, which
 * way they face, and what the locomotion animator needs to keep their feet on
 * the ground while they travel.
 *
 * Facing snaps rather than lerps because the blocking track has already eased
 * it — the rig's own rotation lerp would fight that curve and lag the walk.
 */
export function applyDirectorPerformerMotion(
  viewer: Viewer3DState,
  motion: readonly DirectorBlockingFrame[]
): void {
  const performers = viewer.performerManager.performers;
  motion.forEach((frame, index) => {
    const performer = performers[index];
    if (!performer) return;
    performer.position.x = frame.position.x;
    performer.position.z = frame.position.z;
    performer.snapFacingAngle(frame.facingAngle);
    performer.setTravel({
      direction: frame.moveDirection,
      speed: frame.moveSpeed,
      moving: frame.isMoving,
    });
  });
}

function sameHandEffects(
  a: ResolvedDirectorHandEffects | null,
  b: ResolvedDirectorHandEffects | null
): boolean {
  if (a === null || b === null) return a === b;
  return a.left === b.left && a.right === b.right;
}

/**
 * Gap 26. One effect per hand when the film states a pair, the ordinary
 * whole-performer write otherwise. A pair whose two sides agree is the same
 * request as the single value, so it takes the plain setter and the tip map
 * keeps its wildcard.
 */
function writePerformerEffect(
  performer: {
    setEffect: (
      effect: EffectType,
      options?: { equipBuild?: boolean; recordUndo?: boolean }
    ) => void;
    setHandEffects: (
      left: EffectType,
      right: EffectType,
      options?: { recordUndo?: boolean }
    ) => void;
  },
  effect: EffectType,
  handEffects: ResolvedDirectorHandEffects | undefined,
  options: { equipBuild?: boolean; recordUndo?: boolean }
): void {
  if (handEffects && handEffects.left !== handEffects.right) {
    performer.setHandEffects(handEffects.left, handEffects.right, {
      recordUndo: options.recordUndo,
    });
    return;
  }
  performer.setEffect(handEffects?.left ?? effect, options);
}

/** What the film last wrote to one performer, so a frame that changes nothing writes nothing. */
export interface DirectorAppliedStepChange {
  effect: EffectType;
  /** Present only while this performer's hands run different effects. */
  handEffects?: ResolvedDirectorHandEffects;
  effort: EffortId;
  /** Absent while the performer's prop keeps whatever length the scene set. */
  staffLengthCm?: number;
}

/**
 * Gap 17. How far a prop has to grow before the film writes the new length.
 * A ramp produces a slightly different number every frame, and setStaffLengthCm
 * rebuilds the prop, so writing every frame would rebuild it sixty times a
 * second for a change no one can see. Half a centimetre is under a pixel at
 * ordinary framing.
 */
const STAFF_LENGTH_WRITE_EPSILON_CM = 0.5;

/**
 * Applies this frame's per-step effect and effort for every performer who
 * states any.
 *
 * `stepPlanes` is handed to the runtime once at scene apply because
 * `setStepHandPlane` exists. There is no per-step setter for effect or effort,
 * so the film watches the playhead instead and writes the whole-performer
 * setter when the answer changes. `applied` is the caller's memory of the last
 * write, keyed by performer id — the caller clears it when a scene is applied,
 * so a cut re-writes rather than trusting stale state.
 *
 * `effectiveSteps` are HELD steps (director-step-holds.ts), not the raw shared
 * clock, so an entry scheduled inside a hold applies for the whole hold.
 *
 * `equipBuild: false` matches the scene-apply call above: a step-level effect
 * change states an effect, not a request to put a different prop in the
 * performer's hand mid-shot. `recordUndo: false` keeps a looping film from
 * flooding the undo history.
 */
export function applyDirectorStepChanges(
  viewer: Viewer3DState,
  scene: ResolvedDirectorScene,
  effectiveSteps: readonly number[],
  applied: Map<string, DirectorAppliedStepChange>
): void {
  const performers = viewer.performerManager.performers;
  scene.performance.performers.forEach((directed, index) => {
    const ramp = directed.stepStaffLengths ?? [];
    if (
      directed.stepEffects.length === 0 &&
      directed.stepEfforts.length === 0 &&
      ramp.length === 0
    )
      return;
    const performer = performers[index];
    if (!performer) return;

    const step = effectiveSteps[index] ?? 0;
    const effect = resolveStepChange(
      directed.stepEffects.map((entry) => ({
        step: entry.step,
        value: entry.effect,
      })),
      step,
      directed.effect
    );
    const effort = resolveStepChange(
      directed.stepEfforts.map((entry) => ({
        step: entry.step,
        value: entry.effort,
      })),
      step,
      directed.effort
    );

    // No memory yet means the scene was just applied, and scene apply already
    // wrote the performer's base effect and effort. So the baseline for the
    // first frame is those, not "nothing" — otherwise every cut would write a
    // redundant pair before the first authored entry is even reached.
    // A prop with no stated length starts at the model's own, which the film
    // has no number for. The first ramp entry is then the first length it can
    // honestly write, so the baseline is that entry's value and the ramp into
    // it is a cut.
    const staffLengthCm =
      ramp.length === 0
        ? undefined
        : resolveStepRamp(
            ramp.map((entry) => ({
              step: entry.step,
              value: entry.staffLengthCm,
              ease: entry.ease,
            })),
            step,
            directed.staffLengthCm ?? ramp[0]!.staffLengthCm
          );

    const handEffects = resolveStepChange(
      directed.stepEffects.map((entry) => ({
        step: entry.step,
        value: entry.handEffects ?? null,
      })),
      step,
      directed.handEffects ?? null
    );

    const last = applied.get(directed.id) ?? {
      effect: directed.effect,
      effort: directed.effort,
      ...(directed.handEffects ? { handEffects: directed.handEffects } : {}),
    };
    if (
      last.effect !== effect ||
      !sameHandEffects(last.handEffects ?? null, handEffects)
    ) {
      writePerformerEffect(performer, effect, handEffects ?? undefined, {
        equipBuild: false,
        recordUndo: false,
      });
    }
    if (last.effort !== effort) {
      performer.setEffort(effort, { recordUndo: false });
    }
    const staffLengthMoved =
      staffLengthCm !== undefined &&
      (last.staffLengthCm === undefined ||
        Math.abs(last.staffLengthCm - staffLengthCm) >=
          STAFF_LENGTH_WRITE_EPSILON_CM);
    if (staffLengthMoved) {
      performer.setStaffLengthCm(staffLengthCm);
    }
    applied.set(directed.id, {
      effect,
      ...(handEffects ? { handEffects } : {}),
      effort,
      staffLengthCm: staffLengthMoved ? staffLengthCm : last.staffLengthCm,
    });
  });
}

export function applyDirectorCameraFrame(
  viewer: Viewer3DState,
  frame: DirectorCameraFrame,
  previewFovDeg = frame.fovDeg
): void {
  viewer.snapCameraTo(
    { x: frame.position[0], y: frame.position[1], z: frame.position[2] },
    { x: frame.target[0], y: frame.target[1], z: frame.target[2] },
    undefined,
    false
  );

  // The viewer re-applies roll after its orbit controls update each frame;
  // writing the camera's quaternion here would be overwritten next tick.
  viewer.cameraRollDeg = frame.rollDeg;

  const camera = viewer.threlteCamera as PerspectiveCamera | null;
  if (!camera) return;

  if (Math.abs(camera.fov - previewFovDeg) >= 0.001) {
    camera.fov = previewFovDeg;
    camera.updateProjectionMatrix();
  }
}
