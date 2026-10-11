/**
 * Performer Manager State
 *
 * Manages multiple performers in the 3D viewer.
 * Handles adding, removing, positioning, and selecting performers.
 */

import {
  createCharacterInstanceState,
  makeStandaloneDeps,
  type CharacterInstanceState,
} from "./character-instance-state.svelte";
import type { DefaultPerformerSettings } from "./performer-settings-types";
import {
  createCharacterSyncState,
  type CharacterSyncState,
} from "./character-sync-state.svelte";
import { getDefaultPositions, MAX_PERFORMERS } from "@austencloud/scene-3d";
// propInterpolator / sequenceConverter injected as module functions; no imports needed here
import type { FormationPreset } from "@austencloud/scene-3d";
import { createFormationManager } from "@austencloud/scene-3d";
import {
  sampleInterruptibleAngle,
  sampleInterruptibleHermite,
  type TimedTransition,
} from "../camera/transitions";
import {
  DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE,
  resolveViewerFormationFacingAngle,
} from "../domain/viewer-formation-facing";
import type { CharacterId } from "../domain/character-model";
import { motionDuration } from "#lib/shared/transitions/motion.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";
// FormationManager type inferred from createFormationManager return

const COUNT_CHANGE_TRANSITION_MS = DURATION.emphasis;

export interface PerformerLayoutSnapshot {
  position: { x: number; z: number };
  facingAngle: number;
}

interface PerformerLayoutVelocity {
  position: { x: number; z: number };
  facingAngle: number;
}

interface PerformerLayoutTransitionMember {
  id: string;
  start: PerformerLayoutSnapshot;
  end: PerformerLayoutSnapshot;
  startVelocity: PerformerLayoutVelocity;
}

interface ActivePerformerLayoutTransition {
  timing: TimedTransition;
  members: PerformerLayoutTransitionMember[];
}

export type CharacterPresencePhase = "entering" | "present" | "exiting";

export interface RenderablePerformer {
  performer: CharacterInstanceState;
  castIndex: number;
  presencePhase: CharacterPresencePhase;
}

interface DepartingPerformer {
  performer: CharacterInstanceState;
  castIndex: number;
}

interface CharacterPresenceTransition {
  performer: CharacterInstanceState;
  castIndex: number;
  phase: Exclude<CharacterPresencePhase, "present">;
  timing: TimedTransition;
  startProgress: number;
  startVelocity: number;
}

/**
 * Dependencies for performer manager
 */
export interface PerformerManagerDeps {
  initialCharacterId: CharacterId;
  /**
   * Optional cap override. Defaults to the shared STAGE.MAX_PERFORMERS (4).
   * The standalone 3D viewer passes STAGE.MAX_VIEWER_PERFORMERS (8).
   */
  maxPerformers?: number;
  /**
   * Optional viewer-level defaults provider. When set, each performer
   * inherits these defaults via the cascade (null override → inherit).
   * When omitted, performers use standalone defaults.
   */
  getDefaults?: () => DefaultPerformerSettings;
  /**
   * Threaded through to every `createCharacterInstanceState` call as
   * `CharacterInstanceConfig.persistent`. Defaults to `true` (unchanged
   * behavior) when omitted. Pass `false` for a seeded/ephemeral viewer so
   * its character instances never read or write the persisted plane-mode /
   * rotation-variant localStorage keys.
   */
  persistent?: boolean;
  /**
   * The heading a same-direction cast uses in its current stage environment.
   * Viewer3D supplies its live environment mapping; other hosts keep the
   * original zero-heading behavior.
   */
  getFrontStageFacingAngle?: () => number;
}

/**
 * Create performer manager state
 */
function buildPerformerManager(deps: PerformerManagerDeps) {
  const { initialCharacterId } = deps;
  const maxPerformers = deps.maxPerformers ?? MAX_PERFORMERS;
  const getDefaults = deps.getDefaults;
  const persistent = deps.persistent;
  const getFrontStageFacingAngle =
    deps.getFrontStageFacingAngle ??
    (() => DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE);

  // Performer states (1-4 performers)
  let performerStates = $state<CharacterInstanceState[]>([]);
  let departingPerformers = $state<DepartingPerformer[]>([]);
  let activePerformerIndex = $state(0);
  let syncState: CharacterSyncState | null = $state(null);

  // Formation manager for flexible positioning. Pass maxPerformers through
  // so the standalone viewer's 8-performer cap reaches the formation
  // engine - otherwise its internal clamp drops performers 5-8 from
  // slot calculations and they never move on preset apply.
  const formationManager = createFormationManager(1, maxPerformers);
  let activeLayoutTransition: ActivePerformerLayoutTransition | null = null;
  let nextLayoutTransitionId = 1;
  let activePresenceTransitions = $state<CharacterPresenceTransition[]>([]);
  let nextPresenceTransitionId = 1;
  let nextPerformerSerial = 0;

  // Derived: active performer state
  const activeState = $derived(performerStates[activePerformerIndex] ?? null);

  // Helper getters for sync (first two performers)
  const character1State = $derived(performerStates[0] ?? null);
  const character2State = $derived(performerStates[1] ?? null);

  /**
   * Create a performer at a given index
   */
  function createPerformer(index: number): CharacterInstanceState {
    const positions = getDefaultPositions(performerStates.length + 1);
    const pos = positions[index] ?? { x: 0, z: 0 };

    const performer = createCharacterInstanceState(
      {
        id: `performer-${nextPerformerSerial++}`,
        positionX: pos.x,
        positionZ: pos.z,
        characterId: initialCharacterId,
        persistent,
      },
      getDefaults ? { getDefaults } : makeStandaloneDeps()
    );
    performer.snapFacingAngle(getFrontStageFacingAngle());
    return performer;
  }

  /**
   * Initialize with a single performer
   */
  function initialize(): CharacterInstanceState {
    const initialPerformer = createPerformer(0);
    performerStates = [initialPerformer];
    return initialPerformer;
  }

  function captureLayout(): Map<string, PerformerLayoutSnapshot> {
    return new Map(
      performerStates.map((performer) => [
        performer.id,
        {
          position: { ...performer.position },
          facingAngle: performer.facingAngle,
        },
      ])
    );
  }

  function zeroLayoutVelocity(): PerformerLayoutVelocity {
    return {
      position: { x: 0, z: 0 },
      facingAngle: 0,
    };
  }

  function samplePresenceTransitions(nowMs: number): Map<string, number> {
    const velocities = new Map<string, number>();
    const stillRunning: CharacterPresenceTransition[] = [];
    const completedDepartures = new Set<string>();

    for (const transition of activePresenceTransitions) {
      const target = transition.phase === "entering" ? 1 : 0;
      const sample = sampleInterruptibleHermite(
        transition.startProgress,
        target,
        transition.startVelocity,
        transition.timing,
        nowMs
      );
      transition.performer.setPresenceProgress(sample.value);
      velocities.set(transition.performer.id, sample.velocity);

      if (!sample.done) {
        stillRunning.push(transition);
        continue;
      }

      transition.performer.setPresenceProgress(target);
      if (transition.phase === "exiting") {
        transition.performer.destroy();
        completedDepartures.add(transition.performer.id);
      }
    }

    activePresenceTransitions = stillRunning;
    if (completedDepartures.size > 0) {
      departingPerformers = departingPerformers.filter(
        ({ performer }) => !completedDepartures.has(performer.id)
      );
    }
    return velocities;
  }

  function beginPresenceTransition(
    performer: CharacterInstanceState,
    castIndex: number,
    phase: Exclude<CharacterPresencePhase, "present">,
    startVelocity: number,
    nowMs: number
  ): void {
    activePresenceTransitions = activePresenceTransitions.filter(
      (transition) => transition.performer.id !== performer.id
    );

    const target = phase === "entering" ? 1 : 0;
    const durationMs = motionDuration(DURATION.emphasis);
    if (durationMs === 0) {
      performer.setPresenceProgress(target);
      if (phase === "exiting") performer.destroy();
      return;
    }

    activePresenceTransitions = [
      ...activePresenceTransitions,
      {
        performer,
        castIndex,
        phase,
        timing: {
          id: nextPresenceTransitionId++,
          startTimeMs: nowMs,
          durationMs,
        },
        startProgress: performer.presenceProgress,
        startVelocity,
      },
    ];
  }

  function beginCharacterEntry(
    performer: CharacterInstanceState,
    castIndex: number,
    nowMs: number
  ): void {
    performer.setPresenceProgress(0);
    beginPresenceTransition(performer, castIndex, "entering", 0, nowMs);
  }

  function beginCharacterExit(
    performer: CharacterInstanceState,
    castIndex: number,
    startVelocity: number,
    nowMs: number
  ): void {
    performer.pause();
    performer.stopMovement();

    if (motionDuration(DURATION.emphasis) === 0) {
      performer.setPresenceProgress(0);
      performer.destroy();
      return;
    }

    departingPerformers = [
      ...departingPerformers,
      { performer, castIndex },
    ];
    beginPresenceTransition(
      performer,
      castIndex,
      "exiting",
      startVelocity,
      nowMs
    );
  }

  /**
   * Apply the shared layout clock to every performer and return the exact
   * velocities visible at this instant. Those velocities become the tangents
   * of a replacement transition when add/remove/formation actions arrive in
   * quick succession.
   */
  function sampleLayoutTransition(
    nowMs: number
  ): Map<string, PerformerLayoutVelocity> {
    const velocities = new Map<string, PerformerLayoutVelocity>();
    const transition = activeLayoutTransition;
    if (!transition) return velocities;

    let done = false;
    for (const member of transition.members) {
      const performer = performerStates.find(
        (candidate) => candidate.id === member.id
      );
      if (!performer) continue;

      const x = sampleInterruptibleHermite(
        member.start.position.x,
        member.end.position.x,
        member.startVelocity.position.x,
        transition.timing,
        nowMs
      );
      const z = sampleInterruptibleHermite(
        member.start.position.z,
        member.end.position.z,
        member.startVelocity.position.z,
        transition.timing,
        nowMs
      );
      const facing = sampleInterruptibleAngle(
        member.start.facingAngle,
        member.end.facingAngle,
        member.startVelocity.facingAngle,
        transition.timing,
        nowMs
      );

      performer.position.x = x.value;
      performer.position.z = z.value;
      // The glide eases the heading itself. setFacingAngle only sets a target
      // that nothing in the viewer turns toward, so the cast never turned.
      performer.snapFacingAngle(facing.value);
      velocities.set(member.id, {
        position: { x: x.velocity, z: z.velocity },
        facingAngle: facing.velocity,
      });
      done = x.done;
    }

    if (done) activeLayoutTransition = null;
    return velocities;
  }

  function beginLayoutTransition(
    targets: readonly PerformerLayoutSnapshot[],
    durationMs: number,
    carriedVelocities: ReadonlyMap<string, PerformerLayoutVelocity>,
    nowMs: number
  ): TimedTransition {
    const accessibleDurationMs = motionDuration(durationMs);
    const timing: TimedTransition = {
      id: nextLayoutTransitionId++,
      startTimeMs: nowMs,
      durationMs: accessibleDurationMs,
    };

    if (accessibleDurationMs === 0) {
      performerStates.forEach((performer, index) => {
        const end = targets[index];
        if (!end) return;
        performer.position.x = end.position.x;
        performer.position.z = end.position.z;
        performer.snapFacingAngle(end.facingAngle);
      });
      activeLayoutTransition = null;
      return timing;
    }

    activeLayoutTransition = {
      timing,
      members: performerStates.flatMap((performer, index) => {
        const end = targets[index];
        if (!end) return [];
        return [
          {
            id: performer.id,
            start: {
              position: { ...performer.position },
              facingAngle: performer.facingAngle,
            },
            end: {
              position: { ...end.position },
              facingAngle: end.facingAngle,
            },
            startVelocity:
              carriedVelocities.get(performer.id) ?? zeroLayoutVelocity(),
          },
        ];
      }),
    };

    return timing;
  }

  function cancelFormationTransition(nowMs: number = performance.now()): void {
    sampleLayoutTransition(nowMs);
    activeLayoutTransition = null;
    formationManager.cancelTransition();
  }

  /**
   * Resolve every performer's destination under the active formation.
   * Presets with a smaller fixed cast fall back to the same centered layout
   * used before this transition work, so counts five through eight remain
   * deterministic.
   */
  function resolveLayoutTargets(): PerformerLayoutSnapshot[] {
    formationManager.setPerformerCount(performerStates.length);

    const formation = formationManager.currentFormation;
    const positions = formationManager.getAllPerformerPositions();
    const defaults = getDefaultPositions(performerStates.length);
    const coversAll = positions.length >= performerStates.length;

    return performerStates.map((performer, index) => {
      if (coversAll) {
        const target = positions.find((position) => position.index === index);
        if (target) {
          const slot = formation.slots.find(
            (candidate) => candidate.index === index
          );
          return {
            position: { ...target.position },
            facingAngle: resolveViewerFormationFacingAngle(
              slot,
              formation,
              target.facingAngle,
              getFrontStageFacingAngle()
            ),
          };
        }
      }

      const fallback = defaults[index] ?? performer.position;
      return {
        position: { ...fallback },
        facingAngle: resolveViewerFormationFacingAngle(
          undefined,
          formation,
          performer.facingAngle,
          getFrontStageFacingAngle()
        ),
      };
    });
  }

  /**
   * A new character enters at its destination while the existing cast glides
   * out of the way. On removal, the departing character remains visible long
   * enough to explain the change while the surviving cast closes the gap.
   */
  function transitionAfterCountChange(
    previousLayout: Map<string, PerformerLayoutSnapshot>,
    carriedVelocities: ReadonlyMap<string, PerformerLayoutVelocity>,
    nowMs: number
  ): PerformerLayoutSnapshot[] {
    formationManager.cancelTransition();
    const targets = resolveLayoutTargets();

    performerStates.forEach((performer, index) => {
      if (previousLayout.has(performer.id)) return;
      const target = targets[index];
      if (!target) return;
      performer.position.x = target.position.x;
      performer.position.z = target.position.z;
      performer.snapFacingAngle(target.facingAngle);
    });
    beginLayoutTransition(
      targets,
      COUNT_CHANGE_TRANSITION_MS,
      carriedVelocities,
      nowMs
    );
    return targets;
  }

  /**
   * Update all performer positions based on formation.
   *
   * Some presets are capped (grid-2x2 at 4, back-to-back/facing/stage-lr at 2).
   * When the performer count exceeds the preset's cap, the formation manager
   * returns slots only for the covered indices. Performers beyond the cap
   * would otherwise freeze at whatever position they spawned at, drifting
   * based on spawn history. Fall back to the default row-pair layout for
   * any index the preset doesn't cover - this produces a seamless 2-column
   * grid for grid-2x2 at counts 5-8 (since grid-2x2's 4 slots align exactly
   * with rows 0-1 of the row-pair default).
   */
  function updatePositions() {
    activeLayoutTransition = null;
    formationManager.cancelTransition();
    const targets = resolveLayoutTargets();
    performerStates.forEach((performer, i) => {
      const target = targets[i];
      if (!target) return;
      performer.position.x = target.position.x;
      performer.position.z = target.position.z;
      performer.snapFacingAngle(target.facingAngle);
    });
  }

  /**
   * Apply a formation preset (immediately, no transition)
   */
  function applyFormationPreset(preset: FormationPreset) {
    activeLayoutTransition = null;
    formationManager.applyPreset(preset);
    updatePositions();
  }

  /**
   * Transition to a formation preset (smooth animation)
   */
  function transitionToFormation(
    preset: FormationPreset,
    durationMs: number = DURATION.dramatic
  ) {
    const nowMs = performance.now();
    const carriedVelocities = sampleLayoutTransition(nowMs);
    formationManager.cancelTransition();
    formationManager.applyPreset(preset);
    const targets = resolveLayoutTargets();
    beginLayoutTransition(targets, durationMs, carriedVelocities, nowMs);
  }

  /**
   * Update formation transition (called each frame when transitioning).
   * Uses the same default-layout fallback as updatePositions - if the
   * target preset doesn't cover an index, that performer stays at its
   * default row-pair slot instead of drifting.
   */
  function updateFormationTransition(timestamp?: number) {
    const nowMs = timestamp ?? performance.now();
    sampleLayoutTransition(nowMs);
    samplePresenceTransitions(nowMs);
  }

  /**
   * Add a new performer. Without a placement the whole cast glides into the
   * formation's slots for the new count. With one, the newcomer enters exactly
   * where asked and everyone else stays put - a pasted copy belongs beside its
   * original, not in a re-laid-out cast.
   */
  function addPerformer(
    placement?: PerformerLayoutSnapshot
  ): PerformerLayoutSnapshot[] | null {
    if (performerStates.length >= maxPerformers) return null;

    const nowMs = performance.now();
    const carriedVelocities = sampleLayoutTransition(nowMs);
    samplePresenceTransitions(nowMs);
    const previousLayout = captureLayout();
    const newPerformer = createPerformer(performerStates.length);
    performerStates = [...performerStates, newPerformer];

    let layoutTargets: PerformerLayoutSnapshot[];
    if (placement) {
      newPerformer.position.x = placement.position.x;
      newPerformer.position.z = placement.position.z;
      newPerformer.snapFacingAngle(placement.facingAngle);
      layoutTargets = [...captureLayout().values()];
    } else {
      layoutTargets = transitionAfterCountChange(
        previousLayout,
        carriedVelocities,
        nowMs
      );
    }
    beginCharacterEntry(newPerformer, performerStates.length - 1, nowMs);

    // Create sync state when we have exactly 2 performers
    if (performerStates.length === 2) {
      const first = performerStates[0];
      const second = performerStates[1];
      if (first && second) {
        syncState?.destroy();
        syncState = createCharacterSyncState(first, second);
      }
    }

    return layoutTargets;
  }

  /**
   * Remove a performer. Existing callers that omit an index retain the
   * original remove-last behavior used by snapshot restoration.
   */
  function removePerformer(
    index = performerStates.length - 1
  ): PerformerLayoutSnapshot[] | null {
    if (performerStates.length <= 1) return null;
    if (index < 0 || index >= performerStates.length) return null;

    const nowMs = performance.now();
    const carriedVelocities = sampleLayoutTransition(nowMs);
    const presenceVelocities = samplePresenceTransitions(nowMs);
    const previousLayout = captureLayout();
    const removed = performerStates[index];
    if (!removed) return null;
    performerStates = performerStates.filter(
      (_, performerIndex) => performerIndex !== index
    );
    const layoutTargets = transitionAfterCountChange(
      previousLayout,
      carriedVelocities,
      nowMs
    );
    beginCharacterExit(
      removed,
      index,
      presenceVelocities.get(removed.id) ?? 0,
      nowMs
    );

    // Adjust active index if needed
    if (activePerformerIndex >= performerStates.length) {
      activePerformerIndex = performerStates.length - 1;
    }

    // Removing either member of the synchronized pair changes its owners.
    syncState?.destroy();
    const first = performerStates[0];
    const second = performerStates[1];
    if (first && second) {
      syncState = createCharacterSyncState(first, second);
    } else {
      syncState = null;
    }

    return layoutTargets;
  }

  /**
   * Select a performer by index
   */
  function selectPerformer(index: number) {
    if (index >= 0 && index < performerStates.length) {
      activePerformerIndex = index;
    }
  }

  /**
   * Handle performer drag
   */
  function handleDrag(index: number, newPos: { x: number; z: number }) {
    cancelFormationTransition();
    const performer = performerStates[index];
    if (performer) {
      performer.position.x = newPos.x;
      performer.position.z = newPos.z;
    }
  }

  /**
   * Set speed on all performers
   */
  function setSpeed(speed: number) {
    performerStates.forEach((p) => (p.speed = speed));
  }

  /**
   * Ensure we have at least N performers
   */
  function ensurePerformerCount(count: number) {
    while (
      performerStates.length < count &&
      performerStates.length < maxPerformers
    ) {
      addPerformer();
    }
  }

  /**
   * Clean up all performers
   */
  function destroy() {
    activeLayoutTransition = null;
    activePresenceTransitions = [];
    performerStates.forEach((p) => p.destroy());
    departingPerformers.forEach(({ performer }) => performer.destroy());
    departingPerformers = [];
    syncState?.destroy();
  }

  return {
    // State
    get performers() {
      return performerStates;
    },
    get renderablePerformers(): RenderablePerformer[] {
      return [
        ...performerStates.map((performer, castIndex) => ({
          performer,
          castIndex,
          presencePhase: activePresenceTransitions.some(
            (transition) =>
              transition.performer.id === performer.id &&
              transition.phase === "entering"
          )
            ? ("entering" as const)
            : ("present" as const),
        })),
        ...departingPerformers.map(({ performer, castIndex }) => ({
          performer,
          castIndex,
          presencePhase: "exiting" as const,
        })),
      ];
    },
    get activeIndex() {
      return activePerformerIndex;
    },
    get activeState() {
      return activeState;
    },
    get syncState() {
      return syncState;
    },
    get character1State() {
      return character1State;
    },
    get character2State() {
      return character2State;
    },
    get count() {
      return performerStates.length;
    },
    get maxPerformers() {
      return maxPerformers;
    },

    // Formation state
    get currentFormation() {
      return formationManager.currentFormation;
    },
    get currentFormationPreset() {
      return formationManager.currentFormation.preset;
    },
    get isFormationTransitioning() {
      return activeLayoutTransition !== null;
    },
    get formationTransitionTiming(): TimedTransition | null {
      return activeLayoutTransition?.timing ?? null;
    },

    // Methods
    initialize,
    addPerformer,
    removePerformer,
    selectPerformer,
    handleDrag,
    setSpeed,
    ensurePerformerCount,
    destroy,

    // Formation methods
    applyFormationPreset,
    transitionToFormation,
    updateFormationTransition,
    cancelFormationTransition,
  };
}

export type PerformerManager = ReturnType<typeof buildPerformerManager>;

export function createPerformerManager(
  deps: PerformerManagerDeps
): PerformerManager {
  return buildPerformerManager(deps);
}
