/**
 * The phrase library: real library sequences, tagged for the phrase brain.
 *
 * A sequence has no plane of its own (Austen, 2026-10-22); the performer picks
 * the plane as they play. So the tags here describe only what the hands do:
 * how many prop turns, which motion types, whether each hand keeps one
 * direction round the grid or keeps reversing, and a 0..1 difficulty. Whether
 * a sequence is safe to walk with depends on the plane it is played in, so
 * that answer comes from `isWalkSafeIn`, against settings the test stage can
 * change while Austen watches.
 *
 * The snapshot file stores each sequence in its compositional form (two solo
 * hand tracks plus per-step pairings), the same form the public library
 * stores. `deriveSteps` rebuilds the steps; nothing here re-derives them.
 *
 * Pure: no three.js, no Svelte, no network.
 */

export type PhrasePlane = "wall" | "wheel" | "floor";
export const PHRASE_PLANES: readonly PhrasePlane[] = ["wall", "wheel", "floor"];

export type PhraseMotionType = "pro" | "anti" | "float" | "dash" | "static";
export const PHRASE_MOTION_TYPES: readonly PhraseMotionType[] = [
  "pro",
  "anti",
  "float",
  "dash",
  "static",
];

/**
 * What the hands are doing, read off the data:
 * - `spin`: each hand keeps one direction round the grid the whole way (in the
 *   wheel plane, forward or backward wheel spins);
 * - `figure-eight`: both hands keep reversing direction (in the wall plane,
 *   figure-eights);
 * - `pass`: a quarter or more of the hand moves are dashes, straight across
 *   the middle, which is where a staff changes hands or crosses the body;
 * - `other`: anything else (mostly held, or one hand reversing and one not).
 */
export type PhraseMoveKind = "spin" | "figure-eight" | "pass" | "other";
export const PHRASE_MOVE_KINDS: readonly PhraseMoveKind[] = [
  "spin",
  "figure-eight",
  "pass",
  "other",
];

/** The fields of one hand's motion that the tags read. */
export interface PhraseHandMotion {
  motionType: string;
  rotationDirection?: string | null;
  turns?: number | "fl" | null;
}

/** One step as `deriveSteps` builds it, reduced to what the tags read. */
export interface PhraseStepLike {
  motions: { left?: PhraseHandMotion | null; right?: PhraseHandMotion | null };
}

export interface PhraseTags {
  /** Beats in one play of the sequence (one step is one beat). */
  beats: number;
  /** Prop turns over one play, both hands summed. A float's "fl" counts as none. */
  totalTurns: number;
  /** The most turns either hand does in a single beat. */
  maxStepTurns: number;
  motionCounts: Record<PhraseMotionType, number>;
  /** Direction reversals round the grid, both hands summed, over one looped play. */
  reversals: number;
  kind: PhraseMoveKind;
  /** 0 is the easiest material in the library, 1 the hardest. */
  difficulty: number;
  /** Always true: a sequence is played in one plane for a whole phrase. */
  planeChangeFree: true;
  /** Walk-safe in at least one plane under `DEFAULT_WALK_SAFE`. */
  walkSafe: boolean;
  /** The planes `DEFAULT_WALK_SAFE` allows this sequence to be walked in. */
  walkPlanes: PhrasePlane[];
}

/** One walk-safe move: a kind of material, in a plane (or in any plane). */
export interface WalkSafeMove {
  kind: PhraseMoveKind;
  plane: PhrasePlane | "any";
}

export interface WalkSafeSettings {
  moves: readonly WalkSafeMove[];
  /** Prop turns allowed over one play while walking. */
  maxTotalTurns: number;
  /** Difficulty allowed while walking. */
  maxDifficulty: number;
  /** A sequence with any step of these motion types is never walked. */
  hardMotionTypes: readonly PhraseMotionType[];
}

/**
 * The spec's default list: forward and backward wheel-plane spins, wall-plane
 * figure-eights and basic passes, with no turns and nothing marked hard.
 */
export const DEFAULT_WALK_SAFE: WalkSafeSettings = {
  moves: [
    { kind: "spin", plane: "wheel" },
    { kind: "figure-eight", plane: "wall" },
    { kind: "pass", plane: "any" },
  ],
  maxTotalTurns: 0,
  maxDifficulty: 0.35,
  hardMotionTypes: ["float"],
};

/** The sequence a library entry carries, in the library's compositional form. */
export interface PhraseLibrarySequence {
  gridMode: string;
  isCircular: boolean;
  startPlacement: unknown;
  leftSoloProp: { steps: unknown[] };
  rightSoloProp: { steps: unknown[] };
  stepPairings: unknown[];
}

export interface PhraseLibraryEntry {
  /** The public library's sequence id, the key both engines use. */
  id: string;
  name: string;
  word: string;
  /** The library's TKA level, 1 upwards. */
  level: number;
  beats: number;
  tags: PhraseTags;
  sequence: PhraseLibrarySequence;
}

export interface PhraseLibrary {
  version: "flow-fest-phrase-library-v1";
  /** Where the sequences came from, for the record. */
  source: string;
  sourceExportedAt: string | null;
  propFamily: "staff";
  walkSafeDefaults: WalkSafeSettings;
  entries: PhraseLibraryEntry[];
}

function numericTurns(turns: PhraseHandMotion["turns"]): number {
  return typeof turns === "number" && Number.isFinite(turns)
    ? Math.abs(turns)
    : 0;
}

function isMotionType(value: string): value is PhraseMotionType {
  return (PHRASE_MOTION_TYPES as readonly string[]).includes(value);
}

/** Direction reversals round the grid for one hand, measured round the loop. */
function handReversals(directions: readonly string[]): number {
  if (directions.length < 2) return 0;
  let reversals = 0;
  for (let i = 0; i < directions.length; i++) {
    const next = directions[(i + 1) % directions.length]!;
    if (next !== directions[i]) reversals++;
  }
  return reversals;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Tag one sequence from its steps. `level` is the library's own TKA level,
 * which already ranks turn vocabulary; the rest of the difficulty comes from
 * how much the props turn, float, reverse and mix.
 */
export function tagPhraseSequence(
  steps: readonly PhraseStepLike[],
  level = 1,
  walkSafe: WalkSafeSettings = DEFAULT_WALK_SAFE
): PhraseTags {
  const motionCounts: Record<PhraseMotionType, number> = {
    pro: 0,
    anti: 0,
    float: 0,
    dash: 0,
    static: 0,
  };
  let totalTurns = 0;
  let maxStepTurns = 0;
  const directions: Record<"left" | "right", string[]> = {
    left: [],
    right: [],
  };

  for (const step of steps) {
    for (const hand of ["left", "right"] as const) {
      const motion = step.motions[hand];
      if (!motion) continue;
      if (isMotionType(motion.motionType)) motionCounts[motion.motionType]++;
      const turns = numericTurns(motion.turns);
      totalTurns += turns;
      maxStepTurns = Math.max(maxStepTurns, turns);
      if (
        (motion.motionType === "pro" || motion.motionType === "anti") &&
        (motion.rotationDirection === "cw" ||
          motion.rotationDirection === "ccw")
      ) {
        directions[hand].push(motion.rotationDirection);
      }
    }
  }

  const handMoves = Math.max(1, steps.length * 2);
  const leftReversals = handReversals(directions.left);
  const rightReversals = handReversals(directions.right);
  const reversals = leftReversals + rightReversals;

  let kind: PhraseMoveKind;
  if (motionCounts.dash / handMoves >= 0.25) kind = "pass";
  else if ((motionCounts.static + motionCounts.float) / handMoves > 0.5)
    kind = "other";
  else if (leftReversals === 0 && rightReversals === 0) kind = "spin";
  else if (leftReversals > 0 && rightReversals > 0) kind = "figure-eight";
  else kind = "other";

  const distinctTypes = PHRASE_MOTION_TYPES.filter(
    (t) => motionCounts[t] > 0
  ).length;
  const difficulty = clamp01(
    0.3 * clamp01((level - 1) / 4) +
      0.35 * clamp01(totalTurns / handMoves) +
      0.15 * clamp01((motionCounts.float * 2) / handMoves) +
      0.1 * clamp01(reversals / handMoves) +
      0.1 * clamp01((distinctTypes - 2) / 3)
  );

  const partial = {
    beats: steps.length,
    totalTurns,
    maxStepTurns,
    motionCounts,
    reversals,
    kind,
    difficulty: Math.round(difficulty * 1000) / 1000,
    planeChangeFree: true as const,
  };
  const walkPlanes = PHRASE_PLANES.filter((plane) =>
    isWalkSafeIn(partial, plane, walkSafe)
  );
  return { ...partial, walkSafe: walkPlanes.length > 0, walkPlanes };
}

/** Whether a sequence with these tags may be played while walking in `plane`. */
export function isWalkSafeIn(
  tags: Pick<PhraseTags, "totalTurns" | "difficulty" | "kind" | "motionCounts">,
  plane: PhrasePlane,
  settings: WalkSafeSettings
): boolean {
  if (tags.totalTurns > settings.maxTotalTurns) return false;
  if (tags.difficulty > settings.maxDifficulty) return false;
  if (settings.hardMotionTypes.some((type) => tags.motionCounts[type] > 0))
    return false;
  return settings.moves.some(
    (move) =>
      move.kind === tags.kind && (move.plane === "any" || move.plane === plane)
  );
}

/** The planes a sequence may be walked in under `settings`. */
export function walkPlanesFor(
  tags: PhraseTags,
  settings: WalkSafeSettings
): PhrasePlane[] {
  return PHRASE_PLANES.filter((plane) => isWalkSafeIn(tags, plane, settings));
}

/** Where one hand's prop is on the grid at a join between sequences. */
export interface PhraseHandState {
  location: string;
  orientation: string;
}

/** Both hands at one join: where a sequence starts or ends. */
export interface PhraseJoinState {
  left: PhraseHandState;
  right: PhraseHandState;
}

/** Where a sequence starts and where one play of it ends. */
export interface PhraseJoins {
  start: PhraseJoinState;
  end: PhraseJoinState;
}

type LooseStep = {
  startLocation?: string;
  endLocation?: string;
  startOrientation?: string;
  endOrientation?: string;
};

/**
 * A sequence's joins, read off its compositional form: the start is where
 * each hand's first step begins (the start placement says the same), the end
 * where its last step lands. These match `rebuildPhraseSequence` for every
 * library entry, so the brain needs no `deriveSteps` to chain phrases.
 */
export function phraseJoins(sequence: PhraseLibrarySequence): PhraseJoins {
  const hand = (steps: readonly unknown[], at: "start" | "end") => {
    const step = (at === "start" ? steps[0] : steps.at(-1)) as
      | LooseStep
      | undefined;
    return {
      location: String(
        (at === "start" ? step?.startLocation : step?.endLocation) ?? ""
      ),
      orientation: String(
        (at === "start" ? step?.startOrientation : step?.endOrientation) ?? ""
      ),
    };
  };
  const left = sequence.leftSoloProp.steps;
  const right = sequence.rightSoloProp.steps;
  return {
    start: { left: hand(left, "start"), right: hand(right, "start") },
    end: { left: hand(left, "end"), right: hand(right, "end") },
  };
}

const LOCATION_ANGLE: Record<string, number> = {
  e: 0,
  se: 1,
  s: 2,
  sw: 3,
  w: 4,
  nw: 5,
  n: 6,
  ne: 7,
};

function handDistance(a: PhraseHandState, b: PhraseHandState): number {
  const ia = LOCATION_ANGLE[a.location];
  const ib = LOCATION_ANGLE[b.location];
  const steps =
    ia === undefined || ib === undefined
      ? a.location === b.location
        ? 0
        : 4
      : Math.min(Math.abs(ia - ib), 8 - Math.abs(ia - ib));
  return steps + (a.orientation === b.orientation ? 0 : 0.5);
}

/**
 * How far apart two joins are: eighths of the grid each hand moves, plus a
 * half for each hand whose orientation differs. 0 is a seamless join.
 */
export function joinDistance(a: PhraseJoinState, b: PhraseJoinState): number {
  return handDistance(a.left, b.left) + handDistance(a.right, b.right);
}

/** Both hands at the same locations, orientation aside. */
export function joinLocationsMatch(
  a: PhraseJoinState,
  b: PhraseJoinState
): boolean {
  return (
    a.left.location === b.left.location && a.right.location === b.right.location
  );
}

/** A sequence that ends exactly where it starts, so it can repeat without a jump. */
export function isClosedLoop(joins: PhraseJoins): boolean {
  return joinDistance(joins.start, joins.end) === 0;
}
