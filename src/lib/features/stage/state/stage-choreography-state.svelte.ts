import type {
  StageChoreography,
  Performer,
  StageSequenceClip,
  Formation,
  FormationPresetId,
  WalkStyle,
  EasingType,
} from "../domain/stage-types";
import {
  DEFAULT_STAGE_SEQUENCE_ID,
  PERFORMER_COLORS,
  PERFORMER_LABELS,
  DEFAULT_STAGE_WIDTH,
  DEFAULT_STAGE_DEPTH,
  DEFAULT_BPM,
  DEFAULT_PERFORMER_COUNT,
} from "../domain/stage-types";
import { generatePresetPositions } from "./formation-presets";
import type { UnifiedPlaybackContext } from "#lib/shared/timeline/unified-playback-context.js";
import type { StagePerformanceFrame } from "../domain/stage-performance-sampler";
import { normalizeFormations } from "../domain/formation-invariants";
import { resolveStageTravel } from "../domain/stage-travel-plan";
import {
  sampleFormationPerformance,
  sampleStageFormations,
} from "../domain/stage-formation-sampler";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { getPerformerSequenceEndBeat } from "../domain/stage-sequence-timeline";
import {
  DEFAULT_SCENE_ENVIRONMENT_ID,
  normalizeSceneEnvironmentId,
  type SceneEnvironmentId,
} from "#lib/shared/3d/environments/domain/scene-environment.js";
import {
  studioProjectFromStage,
  type StudioProjectV1,
  type StudioStarter,
} from "../domain/studio-project";

interface InterpolatedPosition {
  performerId: string;
  x: number;
  z: number;
  facing: number;
}

/**
 * Explicit shape of the stage choreography state object. Implements the shared
 * playback contract plus the stage-specific editing surface consumed by
 * StageViewer / FormationOverlay / StageTimeline.
 */
export interface StageChoreographyState extends UnifiedPlaybackContext {
  readonly choreography: StageChoreography;
  /** Versioned handoff seam. It deliberately wraps the live Stage document. */
  readonly studioProject: StudioProjectV1;
  readonly bpm: number;
  readonly currentBeat: number;
  readonly maxTotalBeats: number;
  readonly performanceFrames: StagePerformanceFrame[];
  readonly interpolatedPositions: InterpolatedPosition[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly historyRevision: number;
  setEnvironmentId(environmentId: SceneEnvironmentId): void;
  seek(progress: number): void;
  togglePlay(): void;
  toggleLoop(): void;
  onBpmChange(bpm: number): void;
  getPerformer(id: string): Performer | undefined;
  setPerformerCount(count: number): void;
  removePerformers(performerIds: readonly string[]): boolean;
  /** Seed the existing Stage document from the guided Studio entry point. */
  applyStudioStarter(starter: StudioStarter): void;
  addFormation(atBeat: number, presetId?: FormationPresetId): Formation | null;
  removeFormation(formationId: string): void;
  moveFormation(formationId: string, atBeat: number): void;
  setFormationTransitionBeats(formationId: string, beats: number): void;
  updatePerformerTravelTiming(
    formationId: string,
    performerId: string,
    departureBeat: number,
    arrivalBeat: number
  ): void;
  setPerformerTravelStepCount(
    formationId: string,
    performerId: string,
    stepCount: number | null
  ): void;
  resetPerformerTravelTiming(formationId: string, performerId: string): boolean;
  setFormationLabel(formationId: string, label: string): void;
  updateSpotPosition(
    formationId: string,
    performerId: string,
    x: number,
    z: number
  ): void;
  updateSpotWalkStyle(
    formationId: string,
    performerId: string,
    walkStyle: WalkStyle
  ): void;
  updateSpotEasing(
    formationId: string,
    performerId: string,
    easing: EasingType
  ): void;
  updateSpotFacing(
    formationId: string,
    performerId: string,
    facingAngle: number | undefined
  ): void;
  applyPresetToFormation(formationId: string, preset: FormationPresetId): void;
  /** Scale about the centroid and/or slide by stage metres; clamps to the floor. */
  transformFormationSpots(
    formationId: string,
    transform: { scale?: number; dx?: number; dz?: number }
  ): boolean;
  applyFormationTransition(
    endFormation: FormationPresetId,
    durationBeats: number,
    startFormation?: FormationPresetId,
    atBeat?: number
  ): boolean;
  assertFormationTransitionAllowed(
    startFormation?: FormationPresetId,
    atBeat?: number
  ): void;
  beginDrag(): void;
  endDrag(): void;
  addSequenceClip(
    performerId: string,
    sequence: SequenceData,
    startBeat?: number
  ): StageSequenceClip | null;
  removeSequenceClip(clipId: string): void;
  /**
   * Give every performer their own sequence in one undo step. Only lanes that
   * still play the shared sequence are replaced; a lane holding authored clips
   * throws before anything changes, naming the performer.
   */
  assignPerformerSequences(
    assignments: readonly PerformerSequenceAssignment[]
  ): boolean;
  moveSequenceClip(clipId: string, startBeat: number): void;
  resizeSequenceClip(clipId: string, durationBeats: number): void;
  toggleSequenceClipLoop(clipId: string): void;
  setBpm(bpm: number): void;
  /**
   * Put a different sequence on the stage. Every clip still pointing at the
   * outgoing shared sequence follows it, because "change the sequence" means
   * the cast performs the new one — not that half the timeline keeps the old.
   */
  setSharedSequence(sequence: SequenceData): void;
  /**
   * Display names for the sequences the host has resolved. Labels are read-only
   * presentation, so they stay out of the undo history and out of the document.
   */
  registerSequenceLabels(labels: ReadonlyMap<string, string>): void;
  /**
   * Tell the document how long each referenced sequence actually is. A seeded
   * or imported clip only guesses, and a wrong `sourceBeatCount` skews every
   * step the lane samples — visibly, now that performers hold their own
   * playhead. Not an authored edit, so it never enters the undo history.
   */
  syncClipSourceLengths(lengthBySequenceId: ReadonlyMap<string, number>): void;
  sequenceLabel(sequenceId: string): string;
  clipLabel(clip: StageSequenceClip): string;
  undo(): void;
  redo(): void;
  destroy(): void;
}

/**
 * Counts in the document a fresh Stage opens on. Sixty-four is the length of
 * the drill the seed authors, and the lane that plays under it.
 */
const DEFAULT_SHOW_BEATS = 64;

function createPerformer(index: number): Performer {
  return {
    id: crypto.randomUUID(),
    index,
    label: PERFORMER_LABELS[index] ?? `P${index}`,
    color: PERFORMER_COLORS[index] ?? "#888",
    sequenceClips: [
      createSequenceClip({
        sequenceId: DEFAULT_STAGE_SEQUENCE_ID,
        startBeat: 0,
        durationBeats: DEFAULT_SHOW_BEATS,
        // Corrected the moment the host resolves the sequence; a seeded
        // document cannot know how many steps a catalog entry carries.
        sourceBeatCount: 8,
        loop: true,
      }),
    ],
  };
}

function createSequenceClip(
  input: Omit<StageSequenceClip, "id">
): StageSequenceClip {
  return { id: crypto.randomUUID(), ...input };
}

export interface PerformerSequenceAssignment {
  performerId: string;
  sequence: SequenceData;
}

export interface StageChoreographyStateOptions {
  initialEnvironmentId?: SceneEnvironmentId;
}

export function createStageChoreographyState(
  options: StageChoreographyStateOptions = {}
): StageChoreographyState {
  let choreography = $state<StageChoreography>({
    id: crypto.randomUUID(),
    name: "Untitled Choreography",
    bpm: DEFAULT_BPM,
    stageWidth: DEFAULT_STAGE_WIDTH,
    stageDepth: DEFAULT_STAGE_DEPTH,
    environmentId: options.initialEnvironmentId ?? DEFAULT_SCENE_ENVIRONMENT_ID,
    performers: Array.from({ length: DEFAULT_PERFORMER_COUNT }, (_, i) =>
      createPerformer(i)
    ),
    formations: [],
    sharedSequenceId: DEFAULT_STAGE_SEQUENCE_ID,
  });

  // The Stage opens on a show, not on an empty grid. Two moves in sixty-four
  // counts: the cast opens in a line, walks into a triangle by count 32, and
  // spends the last sixteen counts turning that triangle inside out — the
  // downstage performer walking back while the upstage performers walk forward.
  // Arriving on a document you can immediately press Play on is what tells a
  // first-time author what this surface is for.
  const preset = (id: "line" | "triangle") =>
    generatePresetPositions(
      id,
      DEFAULT_PERFORMER_COUNT,
      DEFAULT_STAGE_WIDTH,
      DEFAULT_STAGE_DEPTH
    );

  /**
   * Front-to-back mirror through the formation's OWN mean depth. A triangle
   * through it is the reverse triangle: the downstage performer walks back, the
   * upstage performers walk forward, and nobody moves sideways.
   *
   * Mirroring through the middle of the STAGE instead looks identical whenever
   * the formation happens to be centred there and is wrong the moment it is
   * not — a triangle sitting downstage would be thrown to the back wall rather
   * than turned inside out where it stands.
   */
  const reverseDepth = (positions: Array<{ x: number; z: number }>) => {
    if (positions.length === 0) return positions;
    const meanZ =
      positions.reduce((total, position) => total + position.z, 0) /
      positions.length;
    return positions.map((position) => ({
      x: position.x,
      z: 2 * meanZ - position.z,
    }));
  };

  const defaultSpots = (
    positions: Array<{ x: number; z: number }>
  ): Formation["spots"] =>
    Object.fromEntries(
      choreography.performers.map((performer, index) => [
        performer.id,
        {
          ...(positions[index] ?? {
            x: choreography.stageWidth / 2,
            z: choreography.stageDepth / 2,
          }),
          walkStyle: "direct" as const,
          easing: "easeInOut" as const,
        },
      ])
    );

  choreography.formations = [
    {
      id: "default-formation-0",
      atBeat: 0,
      transitionBeats: 0,
      spots: defaultSpots(preset("line")),
      presetId: "line",
    },
    {
      id: "default-formation-32",
      atBeat: 32,
      transitionBeats: 16,
      spots: defaultSpots(preset("triangle")),
      presetId: "triangle",
    },
    {
      id: "default-formation-64",
      atBeat: DEFAULT_SHOW_BEATS,
      transitionBeats: 16,
      spots: defaultSpots(reverseDepth(preset("triangle"))),
    },
  ];

  const MAX_UNDO_STACK = 50;
  // $state, not plain arrays: canUndo/canRedo are read through getters by the
  // shortcut bridge, and a plain array's push never notifies it — Ctrl+Z stayed
  // disabled no matter how many edits had been made.
  let undoStack = $state<string[]>([]);
  let redoStack = $state<string[]>([]);
  let historyRevision = $state(0);
  let dragBefore: string | null = null;

  function snapshotHistory(): string {
    return JSON.stringify({
      environmentId: choreography.environmentId,
      bpm: choreography.bpm,
      sharedSequenceId: choreography.sharedSequenceId,
      performers: choreography.performers.map((p) => ({
        id: p.id,
        index: p.index,
        label: p.label,
        color: p.color,
        sequenceClips: p.sequenceClips.map((clip) => ({ ...clip })),
      })),
      formations: choreography.formations.map((formation) => ({
        ...formation,
        spots: Object.fromEntries(
          Object.entries(formation.spots).map(([performerId, spot]) => [
            performerId,
            { ...spot },
          ])
        ),
      })),
    });
  }

  function pushUndo() {
    if (dragBefore !== null) return;
    historyRevision++;
    undoStack.push(snapshotHistory());
    if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    redoStack = [];
  }

  function restoreHistory(json: string) {
    const restored = JSON.parse(json) as {
      environmentId?: string;
      bpm?: number;
      sharedSequenceId?: string | null;
      performers: Performer[];
      formations: Formation[];
    };
    choreography.environmentId = normalizeSceneEnvironmentId(
      restored.environmentId,
      choreography.environmentId
    );
    choreography.bpm = Math.max(
      15,
      Math.min(180, restored.bpm ?? choreography.bpm)
    );
    choreography.sharedSequenceId =
      restored.sharedSequenceId === undefined
        ? choreography.sharedSequenceId
        : restored.sharedSequenceId;
    choreography.performers = restored.performers;
    choreography.formations = normalizeFormations(
      restored.formations,
      restored.performers.map((performer) => performer.id),
      choreography.stageWidth,
      choreography.stageDepth
    );
  }

  function undo() {
    endDrag();
    if (undoStack.length === 0) return;
    historyRevision++;
    redoStack.push(snapshotHistory());
    const prev = undoStack.pop()!;
    restoreHistory(prev);
  }

  function redo() {
    endDrag();
    if (redoStack.length === 0) return;
    historyRevision++;
    undoStack.push(snapshotHistory());
    const next = redoStack.pop()!;
    restoreHistory(next);
  }

  function setEnvironmentId(environmentId: SceneEnvironmentId) {
    if (environmentId === choreography.environmentId) return;
    pushUndo();
    choreography.environmentId = environmentId;
  }

  let isPlaying = $state(false);
  let elapsed = $state(0);
  let animationFrame: number | null = null;
  let lastTimestamp = 0;

  const maxTotalBeats = $derived(
    Math.max(
      1,
      choreography.formations.at(-1)?.atBeat ?? 0,
      ...choreography.performers.map(getPerformerSequenceEndBeat)
    )
  );

  const duration = $derived((maxTotalBeats * 60) / choreography.bpm);

  const overallProgress = $derived(
    duration > 0 ? Math.min(1, elapsed / duration) : 0
  );
  const currentBeat = $derived(overallProgress * maxTotalBeats);

  const currentStep = $derived.by(() => {
    for (let i = choreography.formations.length - 1; i >= 0; i -= 1) {
      if (choreography.formations[i]!.atBeat <= currentBeat) {
        return Math.max(0, i);
      }
    }
    return 0;
  });

  const totalSteps = $derived(Math.max(1, choreography.formations.length - 1));

  const beatMarkerPositions = $derived.by((): readonly number[] => {
    if (maxTotalBeats <= 0) return [];
    return choreography.formations
      .slice(1)
      .map((formation) => formation.atBeat / maxTotalBeats);
  });

  const performanceFrames = $derived(
    sampleStageFormations(choreography, currentBeat)
  );

  const interpolatedPositions = $derived(
    performanceFrames.map((frame) => ({
      performerId: frame.performerId,
      x: frame.stagePosition.x,
      z: frame.stagePosition.z,
      facing: frame.bodyFacing,
    }))
  );

  function tick() {
    if (!isPlaying) return;
    const now = performance.now();
    const dt = (now - lastTimestamp) / 1000;
    lastTimestamp = now;
    elapsed = Math.min(elapsed + dt, duration);
    if (elapsed >= duration) {
      isPlaying = false;
      elapsed = duration;
      animationFrame = null;
      return;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (isPlaying) {
      isPlaying = false;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    } else {
      if (elapsed >= duration) elapsed = 0;
      isPlaying = true;
      lastTimestamp = performance.now();
      tick();
    }
  }

  function seek(progress: number) {
    elapsed = Math.max(0, Math.min(1, progress)) * duration;
  }

  function toggleLoop() {
    // v1: no loop support
  }

  function getPerformer(id: string): Performer | undefined {
    return choreography.performers.find((p) => p.id === id);
  }

  function setPerformerCount(count: number) {
    const clamped = Math.max(1, Math.min(8, count));
    const current = choreography.performers.length;
    if (clamped === current) return;
    pushUndo();
    if (clamped > current) {
      const defaultPositions = generatePresetPositions(
        "line",
        clamped,
        choreography.stageWidth,
        choreography.stageDepth
      );
      for (let i = current; i < clamped; i++) {
        const performer = createPerformer(i);
        choreography.performers.push(performer);
        const position = defaultPositions[i] ?? {
          x: choreography.stageWidth / 2,
          z: choreography.stageDepth / 2,
        };
        choreography.formations = choreography.formations.map((formation) => ({
          ...formation,
          spots: {
            ...formation.spots,
            [performer.id]: {
              ...position,
              walkStyle: "direct",
              easing: "linear",
            },
          },
        }));
      }
    } else if (clamped < current) {
      choreography.performers = choreography.performers.slice(0, clamped);
    }
    normalizeFormationTrack();
  }

  function removePerformers(performerIds: readonly string[]): boolean {
    const requestedIds = new Set(performerIds);
    const removedCount = choreography.performers.filter((performer) =>
      requestedIds.has(performer.id)
    ).length;
    if (removedCount === 0 || removedCount >= choreography.performers.length) {
      return false;
    }

    pushUndo();
    choreography.performers = choreography.performers
      .filter((performer) => !requestedIds.has(performer.id))
      .map((performer, index) => ({
        ...performer,
        index,
        // These letters identify timeline rows, not durable performer names.
        // Closing the gap keeps a later Add from creating a duplicate label.
        label: PERFORMER_LABELS[index] ?? `P${index}`,
      }));
    normalizeFormationTrack();
    return true;
  }

  function applyStudioStarter(starter: StudioStarter) {
    pushUndo();

    choreography.environmentId = starter.environmentId;
    choreography.sharedSequenceId = DEFAULT_STAGE_SEQUENCE_ID;
    choreography.performers = Array.from(
      { length: starter.performerCount },
      (_, index) => createPerformer(index)
    );

    const positions = generatePresetPositions(
      starter.formation,
      choreography.performers.length,
      choreography.stageWidth,
      choreography.stageDepth
    );
    const spots: Formation["spots"] = Object.fromEntries(
      choreography.performers.map((performer, index) => [
        performer.id,
        {
          ...(positions[index] ?? {
            x: choreography.stageWidth / 2,
            z: choreography.stageDepth / 2,
          }),
          walkStyle: "direct" as const,
          easing: "easeInOut" as const,
        },
      ])
    );
    choreography.formations = [
      {
        id: crypto.randomUUID(),
        atBeat: 0,
        transitionBeats: 0,
        spots,
        presetId: starter.formation,
      },
    ];
    normalizeFormationTrack();
  }

  function normalizeFormationTrack() {
    choreography.formations = normalizeFormations(
      choreography.formations,
      choreography.performers.map((performer) => performer.id),
      choreography.stageWidth,
      choreography.stageDepth
    );
  }

  function findFormation(formationId: string): Formation | undefined {
    return choreography.formations.find(
      (formation) => formation.id === formationId
    );
  }

  function addFormation(
    atBeat: number,
    presetId?: FormationPresetId
  ): Formation | null {
    const snappedBeat = Number.isFinite(atBeat)
      ? Math.max(0, Math.round(atBeat))
      : 0;
    if (
      choreography.formations.some(
        (formation) => formation.atBeat === snappedBeat
      )
    ) {
      return null;
    }

    const presetPositions = presetId
      ? generatePresetPositions(
          presetId,
          choreography.performers.length,
          choreography.stageWidth,
          choreography.stageDepth
        )
      : null;
    const spots: Formation["spots"] = {};
    choreography.performers.forEach((performer, index) => {
      const sampled = sampleFormationPerformance(
        choreography,
        performer.id,
        snappedBeat
      ).stagePosition;
      const position = presetPositions?.[index] ?? sampled;
      spots[performer.id] = {
        x: position.x,
        z: position.z,
        facingAngle:
          "facingAngle" in position && typeof position.facingAngle === "number"
            ? position.facingAngle
            : undefined,
        walkStyle: "direct",
        easing: "linear",
      };
    });

    pushUndo();
    const formation: Formation = {
      id: crypto.randomUUID(),
      atBeat: snappedBeat,
      transitionBeats: 8,
      spots,
      presetId,
    };
    choreography.formations = [...choreography.formations, formation];
    normalizeFormationTrack();
    return findFormation(formation.id) ?? null;
  }

  function removeFormation(formationId: string) {
    const index = choreography.formations.findIndex(
      (formation) => formation.id === formationId
    );
    if (index <= 0) return;
    pushUndo();
    choreography.formations = choreography.formations.filter(
      (formation) => formation.id !== formationId
    );
    normalizeFormationTrack();
  }

  function moveFormation(formationId: string, atBeat: number) {
    const index = choreography.formations.findIndex(
      (formation) => formation.id === formationId
    );
    if (index <= 0) return;
    const formation = choreography.formations[index];
    if (!formation) return;
    const snappedBeat = Number.isFinite(atBeat)
      ? Math.max(1, Math.round(atBeat))
      : 1;
    if (
      choreography.formations.some(
        (candidate) =>
          candidate.id !== formationId && candidate.atBeat === snappedBeat
      )
    ) {
      return;
    }
    pushUndo();
    const beatDelta = snappedBeat - formation.atBeat;
    for (const spot of Object.values(formation.spots)) {
      if (!spot.travel) continue;
      spot.travel = {
        ...spot.travel,
        departureBeat: spot.travel.departureBeat + beatDelta,
        arrivalBeat: spot.travel.arrivalBeat + beatDelta,
      };
    }
    formation.atBeat = snappedBeat;
    normalizeFormationTrack();
  }

  function setFormationTransitionBeats(formationId: string, beats: number) {
    const formation = findFormation(formationId);
    if (!formation) return;
    pushUndo();
    formation.transitionBeats = beats;
    normalizeFormationTrack();
  }

  function updatePerformerTravelTiming(
    formationId: string,
    performerId: string,
    departureBeat: number,
    arrivalBeat: number
  ) {
    const spot = findFormation(formationId)?.spots[performerId];
    if (!spot) return;
    if (
      spot.travel?.departureBeat === departureBeat &&
      spot.travel?.arrivalBeat === arrivalBeat
    )
      return;
    // Pointer drags group their updates through beginDrag/endDrag.
    if (dragBefore === null) pushUndo();
    spot.travel = {
      departureBeat,
      arrivalBeat,
      ...(spot.travel?.stepCount !== undefined && {
        stepCount: spot.travel.stepCount,
      }),
    };
    normalizeFormationTrack();
  }

  function setPerformerTravelStepCount(
    formationId: string,
    performerId: string,
    stepCount: number | null
  ) {
    const formation = findFormation(formationId);
    const spot = formation?.spots[performerId];
    if (!formation || !spot) return;
    const previousIndex =
      choreography.formations.findIndex(
        (candidate) => candidate.id === formationId
      ) - 1;
    const inheritedDeparture = Math.max(
      choreography.formations[previousIndex]?.atBeat ?? 0,
      formation.atBeat - formation.transitionBeats
    );
    pushUndo();
    spot.travel = {
      departureBeat: spot.travel?.departureBeat ?? inheritedDeparture,
      arrivalBeat: spot.travel?.arrivalBeat ?? formation.atBeat,
      ...(stepCount !== null && { stepCount }),
    };
    normalizeFormationTrack();
  }

  function resetPerformerTravelTiming(
    formationId: string,
    performerId: string
  ): boolean {
    const spot = findFormation(formationId)?.spots[performerId];
    if (!spot?.travel) return false;

    pushUndo();
    spot.travel = undefined;
    normalizeFormationTrack();
    return true;
  }

  function setFormationLabel(formationId: string, label: string) {
    const formation = findFormation(formationId);
    if (!formation) return;
    pushUndo();
    const trimmed = label.trim();
    formation.label = trimmed || undefined;
    normalizeFormationTrack();
  }

  function updateSpotPosition(
    formationId: string,
    performerId: string,
    x: number,
    z: number
  ) {
    const formation = findFormation(formationId);
    const spot = formation?.spots[performerId];
    if (!formation || !spot) return;
    if (spot.x === x && spot.z === z) return;
    // Pointer drags group their updates through beginDrag/endDrag.
    if (dragBefore === null) pushUndo();
    spot.x = x;
    spot.z = z;
    formation.presetId = "custom";
    normalizeFormationTrack();
  }

  function updateSpotWalkStyle(
    formationId: string,
    performerId: string,
    walkStyle: WalkStyle
  ) {
    const spot = findFormation(formationId)?.spots[performerId];
    if (!spot) return;
    pushUndo();
    spot.walkStyle = walkStyle;
    normalizeFormationTrack();
  }

  function updateSpotEasing(
    formationId: string,
    performerId: string,
    easing: EasingType
  ) {
    const spot = findFormation(formationId)?.spots[performerId];
    if (!spot) return;
    pushUndo();
    spot.easing = easing;
    normalizeFormationTrack();
  }

  function updateSpotFacing(
    formationId: string,
    performerId: string,
    facingAngle: number | undefined
  ) {
    const spot = findFormation(formationId)?.spots[performerId];
    if (!spot) return;
    pushUndo();
    spot.facingAngle = facingAngle;
    normalizeFormationTrack();
  }

  function applyPresetToFormation(
    formationId: string,
    preset: FormationPresetId
  ) {
    const formation = findFormation(formationId);
    if (!formation) return;
    const positions = generatePresetPositions(
      preset,
      choreography.performers.length,
      choreography.stageWidth,
      choreography.stageDepth
    );
    pushUndo();
    choreography.performers.forEach((performer, index) => {
      const position = positions[index];
      const spot = formation.spots[performer.id];
      if (!position || !spot) return;
      formation.spots[performer.id] = {
        ...spot,
        ...position,
        // Choosing a front-facing preset after a relationship preset must
        // clear the old authored turn instead of carrying it into the new
        // shape where it no longer means anything.
        facingAngle: position.facingAngle,
      };
    });
    formation.presetId = preset;
    normalizeFormationTrack();
  }

  /**
   * Spacing and nudges for TIKA's Arrange verb. Scales about the set's own
   * centroid, slides by stage metres, and clamps to the floor. One history
   * entry, like a drag; the shape becomes custom, like a drag.
   */
  function transformFormationSpots(
    formationId: string,
    transform: { scale?: number; dx?: number; dz?: number }
  ): boolean {
    const formation = findFormation(formationId);
    if (!formation) return false;
    const spots = Object.values(formation.spots);
    if (spots.length === 0) return false;
    const scale = transform.scale ?? 1;
    const dx = transform.dx ?? 0;
    const dz = transform.dz ?? 0;
    const centerX = spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length;
    const centerZ = spots.reduce((sum, spot) => sum + spot.z, 0) / spots.length;
    pushUndo();
    for (const spot of spots) {
      spot.x = Math.min(
        choreography.stageWidth,
        Math.max(0, centerX + (spot.x - centerX) * scale + dx)
      );
      spot.z = Math.min(
        choreography.stageDepth,
        Math.max(0, centerZ + (spot.z - centerZ) * scale + dz)
      );
    }
    formation.presetId = "custom";
    normalizeFormationTrack();
    return true;
  }

  function presetSpots(
    preset: FormationPresetId,
    source?: Formation
  ): Formation["spots"] {
    const positions = generatePresetPositions(
      preset,
      choreography.performers.length,
      choreography.stageWidth,
      choreography.stageDepth
    );
    return Object.fromEntries(
      choreography.performers.map((performer, index) => {
        const position = positions[index] ?? {
          x: choreography.stageWidth / 2,
          z: choreography.stageDepth / 2,
        };
        const existing = source?.spots[performer.id];
        return [
          performer.id,
          {
            ...(existing ?? {
              walkStyle: "direct" as const,
              easing: "linear" as const,
            }),
            ...position,
            facingAngle: position.facingAngle,
          },
        ];
      })
    );
  }

  function assertFormationTransitionAllowed(
    startFormation?: FormationPresetId,
    atBeat = currentBeat
  ): void {
    const startBeat = Number.isFinite(atBeat)
      ? Math.max(0, Math.round(atBeat))
      : 0;
    const nextIndex = choreography.formations.findIndex(
      (formation) => formation.atBeat >= startBeat
    );
    const next = choreography.formations[nextIndex];
    if (!next || nextIndex === 0) return;
    if (next.atBeat === startBeat && !startFormation) return;

    // Replacing an incoming path with a held anchor would rewrite counts the
    // user already authored. Keep them intact until we can split that path exactly.
    const changesEarlierTravel = choreography.performers.some((performer) => {
      const travel = resolveStageTravel(choreography, performer.id, nextIndex);
      // A zero-distance segment can still turn the performer. Splitting only
      // its position would erase that earlier facing change too.
      return travel && travel.departureBeat < startBeat;
    });
    if (changesEarlierTravel) {
      throw new Error(
        `This would change movement before beat ${startBeat}. Move the playhead to a formation set and ask for the destination only, or start at beat 0.`
      );
    }
  }

  /** Author one uninterrupted move without rewriting the incoming travel. */
  function applyFormationTransition(
    endFormation: FormationPresetId,
    durationBeats: number,
    startFormation?: FormationPresetId,
    atBeat = currentBeat
  ): boolean {
    if (choreography.performers.length === 0) return false;
    assertFormationTransitionAllowed(startFormation, atBeat);
    const startBeat = Number.isFinite(atBeat)
      ? Math.max(0, Math.round(atBeat))
      : 0;
    const duration = Number.isFinite(durationBeats)
      ? Math.max(1, Math.round(durationBeats))
      : 1;
    const endBeat = startBeat + duration;
    const existingStart = choreography.formations.find(
      (formation) => formation.atBeat === startBeat
    );
    const existingEnd = choreography.formations.find(
      (formation) => formation.atBeat === endBeat
    );
    const sampledStartSpots: Formation["spots"] = Object.fromEntries(
      choreography.performers.map((performer) => {
        const sampled = sampleFormationPerformance(
          choreography,
          performer.id,
          startBeat
        );
        return [
          performer.id,
          {
            x: sampled.stagePosition.x,
            z: sampled.stagePosition.z,
            facingAngle: sampled.bodyFacing,
            walkStyle: "direct" as const,
            easing: "linear" as const,
          },
        ];
      })
    );

    pushUndo();
    choreography.formations = choreography.formations.filter(
      (formation) => formation.atBeat <= startBeat || formation.atBeat > endBeat
    );

    let start = existingStart;
    if (startFormation && start) {
      start.spots = presetSpots(startFormation, start);
      start.presetId = startFormation;
    } else if (!start) {
      start = {
        id: crypto.randomUUID(),
        atBeat: startBeat,
        transitionBeats: 0,
        spots: startFormation ? presetSpots(startFormation) : sampledStartSpots,
        ...(startFormation ? { presetId: startFormation } : {}),
      };
      choreography.formations.push(start);
    }

    const destination: Formation = existingEnd ?? {
      id: crypto.randomUUID(),
      atBeat: endBeat,
      transitionBeats: duration,
      spots: {},
    };
    destination.atBeat = endBeat;
    destination.transitionBeats = duration;
    destination.spots = Object.fromEntries(
      Object.entries(presetSpots(endFormation, existingEnd)).map(
        ([id, spot]) => [id, { ...spot, travel: undefined }]
      )
    );
    destination.presetId = endFormation;
    choreography.formations.push(destination);
    normalizeFormationTrack();
    return true;
  }

  function beginDrag() {
    if (dragBefore === null) dragBefore = snapshotHistory();
  }

  function endDrag() {
    if (dragBefore === null) return;
    const before = dragBefore;
    dragBefore = null;
    if (before === snapshotHistory()) return;
    historyRevision++;
    undoStack.push(before);
    if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    redoStack = [];
  }

  function addSequenceClip(
    performerId: string,
    sequence: SequenceData,
    startBeat = currentBeat
  ): StageSequenceClip | null {
    const performer = choreography.performers.find(
      (candidate) => candidate.id === performerId
    );
    if (!performer) return null;

    pushUndo();
    const sourceBeatCount = Math.max(1, sequence.steps.length);
    const latestEnd = getPerformerSequenceEndBeat(performer);
    const snappedStart = Math.max(0, Math.round(startBeat * 4) / 4);
    const clip = createSequenceClip({
      sequenceId: sequence.id,
      startBeat: performer.sequenceClips.some(
        (candidate) =>
          snappedStart >= candidate.startBeat &&
          snappedStart < candidate.startBeat + candidate.durationBeats
      )
        ? latestEnd
        : snappedStart,
      durationBeats: sourceBeatCount,
      sourceBeatCount,
      loop: sequence.isCircular === true,
    });
    performer.sequenceClips = [...performer.sequenceClips, clip].sort(
      (a, b) => a.startBeat - b.startBeat
    );
    return clip;
  }

  function assignPerformerSequences(
    assignments: readonly PerformerSequenceAssignment[]
  ): boolean {
    if (choreography.performers.length === 0) return false;
    const byPerformer = new Map(
      assignments.map((assignment) => [assignment.performerId, assignment])
    );
    const coversCast =
      byPerformer.size === choreography.performers.length &&
      choreography.performers.every((performer) =>
        byPerformer.has(performer.id)
      );
    if (!coversCast) {
      throw new Error(
        "Distinct sequences need exactly one sequence for every performer in the cast."
      );
    }

    const sharedId = choreography.sharedSequenceId ?? DEFAULT_STAGE_SEQUENCE_ID;
    const authored = choreography.performers.find((performer) =>
      performer.sequenceClips.some((clip) => clip.sequenceId !== sharedId)
    );
    if (authored) {
      throw new Error(
        `${authored.label} already has their own clips on the timeline. Clear that lane first, or ask for the other performers by name.`
      );
    }

    pushUndo();
    for (const performer of choreography.performers) {
      const { sequence } = byPerformer.get(performer.id)!;
      const sourceBeatCount = Math.max(1, sequence.steps.length);
      performer.sequenceClips = performer.sequenceClips.map((clip) => {
        const wasUnscaled = clip.durationBeats === clip.sourceBeatCount;
        return {
          ...clip,
          sequenceId: sequence.id,
          sourceBeatCount,
          durationBeats: wasUnscaled ? sourceBeatCount : clip.durationBeats,
        };
      });
    }
    normalizeFormationTrack();
    return true;
  }

  function findSequenceClip(
    clipId: string
  ): { performer: Performer; clip: StageSequenceClip } | null {
    for (const performer of choreography.performers) {
      const clip = performer.sequenceClips.find(
        (candidate) => candidate.id === clipId
      );
      if (clip) return { performer, clip };
    }
    return null;
  }

  function removeSequenceClip(clipId: string) {
    const match = findSequenceClip(clipId);
    if (!match) return;
    pushUndo();
    match.performer.sequenceClips = match.performer.sequenceClips.filter(
      (clip) => clip.id !== clipId
    );
  }

  function moveSequenceClip(clipId: string, startBeat: number) {
    const match = findSequenceClip(clipId);
    if (!match) return;
    pushUndo();
    match.clip.startBeat = Math.max(0, Math.round(startBeat * 4) / 4);
    match.performer.sequenceClips = [...match.performer.sequenceClips].sort(
      (a, b) => a.startBeat - b.startBeat
    );
  }

  function resizeSequenceClip(clipId: string, durationBeats: number) {
    const match = findSequenceClip(clipId);
    if (!match) return;
    pushUndo();
    match.clip.durationBeats = Math.max(
      0.25,
      Math.round(durationBeats * 4) / 4
    );
  }

  function toggleSequenceClipLoop(clipId: string) {
    const match = findSequenceClip(clipId);
    if (!match) return;
    pushUndo();
    match.clip.loop = !match.clip.loop;
  }

  function setBpm(bpm: number) {
    const nextBpm = Math.max(15, Math.min(180, bpm));
    if (nextBpm === choreography.bpm) return;
    pushUndo();
    choreography.bpm = nextBpm;
  }

  /**
   * Change what the cast performs.
   *
   * Every clip still pointing at the outgoing shared sequence follows the new
   * one. A clip whose counts matched its source is re-fitted to the new
   * source's length; a clip the author deliberately stretched or compressed
   * keeps the counts they chose.
   */
  function setSharedSequence(sequence: SequenceData) {
    const previousSharedId =
      choreography.sharedSequenceId ?? DEFAULT_STAGE_SEQUENCE_ID;
    const sourceBeatCount = Math.max(1, sequence.steps.length);
    pushUndo();
    choreography.sharedSequenceId = sequence.id;
    for (const performer of choreography.performers) {
      performer.sequenceClips = performer.sequenceClips.map((clip) => {
        if (clip.sequenceId !== previousSharedId) return clip;
        const wasUnscaled = clip.durationBeats === clip.sourceBeatCount;
        return {
          ...clip,
          sequenceId: sequence.id,
          sourceBeatCount,
          durationBeats: wasUnscaled ? sourceBeatCount : clip.durationBeats,
          loop: sequence.isCircular === true ? clip.loop : clip.loop,
        };
      });
    }
    normalizeFormationTrack();
  }

  function syncClipSourceLengths(
    lengthBySequenceId: ReadonlyMap<string, number>
  ) {
    let changed = false;
    for (const performer of choreography.performers) {
      let performerChanged = false;
      const next = performer.sequenceClips.map((clip) => {
        const resolved = lengthBySequenceId.get(clip.sequenceId);
        if (!resolved || resolved <= 0 || resolved === clip.sourceBeatCount) {
          return clip;
        }
        performerChanged = true;
        // A clip the author never resized still means "play it once, at
        // tempo", so it follows the real length. A clip they stretched keeps
        // the span they chose.
        const wasUnscaled = clip.durationBeats === clip.sourceBeatCount;
        return {
          ...clip,
          sourceBeatCount: resolved,
          durationBeats: wasUnscaled ? resolved : clip.durationBeats,
        };
      });
      // Assigning unconditionally would write a new array into the document on
      // every resolve, and the host's loader reads the clip list to decide
      // which sequences to fetch: the write re-triggered the fetch, which
      // called back into here, and the Stage sat on "Preparing the
      // performance" forever.
      if (!performerChanged) continue;
      performer.sequenceClips = next;
      changed = true;
    }
    if (changed) normalizeFormationTrack();
  }

  // Presentation only: never snapshotted, never written to the document.
  let sequenceLabels = $state<ReadonlyMap<string, string>>(new Map());

  function registerSequenceLabels(labels: ReadonlyMap<string, string>) {
    sequenceLabels = new Map(labels);
  }

  function sequenceLabel(sequenceId: string): string {
    return sequenceLabels.get(sequenceId) ?? "";
  }

  function clipLabel(clip: StageSequenceClip): string {
    return clip.label?.trim() || sequenceLabel(clip.sequenceId) || "Sequence";
  }

  function destroy() {
    isPlaying = false;
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  return {
    get choreography() {
      return choreography;
    },
    get studioProject() {
      return studioProjectFromStage(choreography);
    },
    get overallProgress() {
      return overallProgress;
    },
    get currentStep() {
      return currentStep;
    },
    get totalSteps() {
      return totalSteps;
    },
    get isPlaying() {
      return isPlaying;
    },
    get isLooping() {
      return undefined;
    },
    get duration() {
      return duration;
    },
    get elapsed() {
      return elapsed;
    },
    get beatMarkerPositions() {
      return beatMarkerPositions;
    },
    get bpm() {
      return choreography.bpm;
    },
    get currentBeat() {
      return currentBeat;
    },
    get maxTotalBeats() {
      return maxTotalBeats;
    },
    get playbackMode() {
      return undefined;
    },
    get interpolatedPositions() {
      return interpolatedPositions;
    },
    get performanceFrames() {
      return performanceFrames;
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    get historyRevision() {
      return historyRevision;
    },
    seek,
    togglePlay,
    toggleLoop,
    onBpmChange: setBpm,
    getPerformer,
    setPerformerCount,
    removePerformers,
    applyStudioStarter,
    addFormation,
    removeFormation,
    moveFormation,
    setFormationTransitionBeats,
    updatePerformerTravelTiming,
    setPerformerTravelStepCount,
    resetPerformerTravelTiming,
    setFormationLabel,
    updateSpotPosition,
    updateSpotWalkStyle,
    updateSpotEasing,
    updateSpotFacing,
    applyPresetToFormation,
    transformFormationSpots,
    applyFormationTransition,
    assertFormationTransitionAllowed,
    beginDrag,
    endDrag,
    addSequenceClip,
    removeSequenceClip,
    assignPerformerSequences,
    moveSequenceClip,
    resizeSequenceClip,
    toggleSequenceClipLoop,
    setBpm,
    setSharedSequence,
    registerSequenceLabels,
    syncClipSourceLengths,
    sequenceLabel,
    clipLabel,
    setEnvironmentId,
    undo,
    redo,
    destroy,
  } satisfies StageChoreographyState;
}
