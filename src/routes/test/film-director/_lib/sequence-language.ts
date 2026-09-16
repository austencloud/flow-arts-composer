/**
 * What a performer spins, in the words a director uses.
 *
 * "DJ, starting at beta at South, one turn every step" is four separate
 * generator inputs. This is where the spoken form becomes the
 * `GenerationOptions` the Create module's orchestrator already runs.
 *
 * The schema shapes these directives; meaning is checked here, the same split
 * `blocking-language.ts` uses. A wrong grid location or an impossible turn
 * gets a sentence naming the catalog, which a zod union cannot produce.
 *
 * Every axis here was traced to a `builder.build()` call before it was
 * offered. `GenerationOptions.propContinuity` reads like the prop-continuity
 * knob and reaches neither call — `flow` maps to `constraintPreset`, which is
 * the one that arrives.
 */

import {
  DifficultyLevel,
  GenerationMode,
  type GenerationOptions,
  type LOOPType,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  Letter,
  normalizeLetter,
} from "$lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  getGridLocationsFromPlacement,
  getGridPlacementFromLocations,
} from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { getTurnPool, type TurnLanes } from "@tka/sequence-engine/generation";

// Catalogs

/** Spoken location names, and the grid codes they stand for. */
export const DIRECTOR_LOCATION_NAMES = {
  north: GridLocation.NORTH,
  northeast: GridLocation.NORTHEAST,
  east: GridLocation.EAST,
  southeast: GridLocation.SOUTHEAST,
  south: GridLocation.SOUTH,
  southwest: GridLocation.SOUTHWEST,
  west: GridLocation.WEST,
  northwest: GridLocation.NORTHWEST,
} as const satisfies Record<string, GridLocation>;

/**
 * Placement groups a start or end placement can be named by. These are the
 * groups the grid-placement deriver maps to hand locations — tau and terra are
 * centric-mode placements it does not carry, so they cannot be resolved here.
 */
export const DIRECTOR_PLACEMENT_GROUPS = [
  "alpha",
  "beta",
  "gamma",
  "zeta",
  "eta",
] as const;

export const DIRECTOR_SEQUENCE_LEVELS = [1, 2, 3] as const;

/** Start orientation per hand, as the engine's BuildOptions names them. */
export const DIRECTOR_ORIENTATIONS = ["in", "out", "clock", "counter"] as const;

/** The three-step continuity dial shared by prop spin and hand path. */
export const DIRECTOR_CONTINUITIES = ["smooth", "mixed", "choppy"] as const;

export const DIRECTOR_MOTION_TYPE_FILTERS = ["no-dash", "prefer-dash"] as const;

export const DIRECTOR_LOOP_PERIODS = ["halved", "quartered"] as const;

export type DirectorPlacementGroup = (typeof DIRECTOR_PLACEMENT_GROUPS)[number];
export type DirectorSequenceLevel = (typeof DIRECTOR_SEQUENCE_LEVELS)[number];
export type DirectorOrientation = (typeof DIRECTOR_ORIENTATIONS)[number];
export type DirectorContinuity = (typeof DIRECTOR_CONTINUITIES)[number];
export type DirectorMotionTypeFilter =
  (typeof DIRECTOR_MOTION_TYPE_FILTERS)[number];
export type DirectorLoopPeriod = (typeof DIRECTOR_LOOP_PERIODS)[number];

/** The level a directed sequence generates at when it does not name one. */
export const DEFAULT_SEQUENCE_LEVEL: DirectorSequenceLevel = 2;

const DIFFICULTY_BY_LEVEL: Record<DirectorSequenceLevel, DifficultyLevel> = {
  1: DifficultyLevel.BEGINNER,
  2: DifficultyLevel.INTERMEDIATE,
  3: DifficultyLevel.ADVANCED,
};

// Types

export type DirectorPlacementRef =
  | string
  | { left: string; right: string }
  | { group: DirectorPlacementGroup; location: string };

export type DirectorTurnValue = number | "fl";

export type DirectorTurnLane = DirectorTurnValue | DirectorTurnValue[];

export type DirectorTurns =
  | DirectorTurnLane
  | { left?: DirectorTurnLane; right?: DirectorTurnLane }
  | { intensity: number };

export type DirectorStartOrientation =
  | DirectorOrientation
  | { left?: DirectorOrientation; right?: DirectorOrientation };

/**
 * A film is authored as JSON as often as it is authored in TypeScript, so the
 * LOOP name is the enum's string, not the enum member.
 */
export type DirectorLoopName = `${LOOPType}`;

export type DirectorLoop =
  | DirectorLoopName
  | { type: DirectorLoopName; period?: DirectorLoopPeriod };

/**
 * Everything a generated sequence can say beyond its source. Each field is one
 * spoken axis; absent means the generator's own default.
 */
export interface DirectorSequenceControls {
  startPlacement?: DirectorPlacementRef;
  startOrientation?: DirectorStartOrientation;
  turns?: DirectorTurns;
  /**
   * Gap 20. One level, or a ramp the cast walks from `from` to `to`. The ramp
   * is only sayable in cast defaults; the schema rejects it on one performer.
   */
  level?:
    | DirectorSequenceLevel
    | { ramp: { from: DirectorSequenceLevel; to: DirectorSequenceLevel } };
  gridMode?: GridMode;
  /** Prop spin continuity. */
  flow?: DirectorContinuity;
  handPath?: DirectorContinuity;
  motionTypes?: DirectorMotionTypeFilter;
  loop?: DirectorLoop;
  mustContain?: string[];
  mustNotContain?: string[];
  endPlacement?: DirectorPlacementRef | DirectorPlacementRef[];
}

export type DirectorGeneratedSequence =
  | ({ word: string } & DirectorSequenceControls)
  | ({ length: number } & DirectorSequenceControls);

/** Hands a transform may address. `both` is the default everywhere it applies. */
export type DirectorTransformHand = "left" | "right" | "both";

export const DIRECTOR_ROTATION_DEGREES = [
  45, 90, 135, 180, 225, 270, 315,
] as const;
export type DirectorRotationDegrees = (typeof DIRECTOR_ROTATION_DEGREES)[number];

/**
 * One operation on another performer's sequence, applied in the order
 * written. Every op maps onto a function the Create module's Actions panel
 * already owns in `sequence-transformer.ts`; the film adds words, not math.
 *
 * - `mirror`: reflect across the north-south axis (what `mirrorOf` does).
 * - `flip`: reflect across the east-west axis.
 * - `rotate`: turn the whole pattern about the grid center, 45° steps.
 * - `swap-hands`: the left hand's motions go to the right hand and back.
 * - `invert`: pro and anti trade, and every rotation direction reverses.
 * - `rewind`: play the sequence backwards (retrograde).
 * - `start-at`: rotate the phrase so the named step is danced first.
 */
export type DirectorSequenceTransform =
  | { op: "mirror"; hand?: DirectorTransformHand }
  | { op: "flip"; hand?: DirectorTransformHand }
  | {
      op: "rotate";
      degrees: DirectorRotationDegrees;
      direction: "cw" | "ccw";
      hand?: DirectorTransformHand;
    }
  | { op: "swap-hands" }
  | { op: "invert"; hand?: DirectorTransformHand }
  | { op: "rewind"; hand?: DirectorTransformHand }
  | { op: "start-at"; step: number };

export interface DirectorTransformedSequence {
  transformOf: string;
  transforms: DirectorSequenceTransform[];
}

/** A saved sequence in the public library, by its `publicSequences` id. */
export interface DirectorLibrarySequence {
  library: string;
}

/**
 * What one performer spins. `demo` is the film's shared sequence; `word` and
 * `length` generate a new one through the same pipeline the Create module
 * uses; `mirrorOf` reflects another performer's sequence across the
 * north-south axis, the one-word spelling of
 * `{transformOf, transforms: [{op: "mirror"}]}`; `transformOf` applies any
 * chain of the Actions-panel transforms to another performer's sequence; and
 * `library` plays a sequence someone saved to the public library.
 *
 * `{source: "none"}` is a performer who stands and watches: no prop phrase, no
 * generated sequence, the body idling in place. Blocking still applies, so a
 * watcher can walk on, stand, and turn.
 *
 * `demo`, `none`, `mirrorOf`, `transformOf`, and `library` take no controls. A
 * derived sequence is its source's sequence changed in a stated way, so a turn
 * figure written on it would have to disagree with the thing it claims to
 * derive from; a library sequence is already finished; and a performer who
 * spins nothing has nothing for a control to shape.
 */
export type DirectorPerformerSequence =
  | { source: "demo" }
  | { source: "none" }
  | { mirrorOf: string }
  | DirectorTransformedSequence
  | DirectorLibrarySequence
  | DirectorGeneratedSequence;

/** A performer who spins nothing this scene and simply stands and watches. */
export function isIdleSequence(
  sequence: DirectorPerformerSequence
): sequence is { source: "none" } {
  return "source" in sequence && sequence.source === "none";
}

export function isGeneratedSequence(
  sequence: DirectorPerformerSequence
): sequence is DirectorGeneratedSequence {
  return "word" in sequence || "length" in sequence;
}

export function isTransformedSequence(
  sequence: DirectorPerformerSequence
): sequence is DirectorTransformedSequence {
  return "transformOf" in sequence;
}

export function isLibrarySequence(
  sequence: DirectorPerformerSequence
): sequence is DirectorLibrarySequence {
  return "library" in sequence;
}

/**
 * The performer a derived sequence reads from, or null for a sequence that
 * stands on its own. `mirrorOf` and `transformOf` are the two derived forms.
 */
export function transformSourceId(
  sequence: DirectorPerformerSequence
): string | null {
  if ("mirrorOf" in sequence) return sequence.mirrorOf;
  if ("transformOf" in sequence) return sequence.transformOf;
  return null;
}

// ---------------------------------------------------------------------------
// Locations and placements
// ---------------------------------------------------------------------------

const LOCATION_BY_NAME = new Map<string, GridLocation>();
for (const [name, code] of Object.entries(DIRECTOR_LOCATION_NAMES)) {
  LOCATION_BY_NAME.set(name, code);
  LOCATION_BY_NAME.set(code, code);
}

const LOCATION_CATALOG = Object.entries(DIRECTOR_LOCATION_NAMES)
  .map(([name, code]) => `${code}/${name}`)
  .join(", ");

/** "North-East", "northeast" and "ne" all name the same grid point. */
export function normalizeLocation(raw: string): GridLocation | null {
  const key = raw.trim().toLowerCase().replace(/[\s_-]/g, "");
  return LOCATION_BY_NAME.get(key) ?? null;
}

function requireLocation(raw: string, where: string): GridLocation {
  const location = normalizeLocation(raw);
  if (location) return location;
  throw new Error(
    `${where}: unknown grid location "${raw}". Locations are ${LOCATION_CATALOG}.`
  );
}

const PLACEMENT_GROUP_PATTERN = /^([a-z]+)\d+$/;

const PLACEMENTS_BY_GROUP = new Map<DirectorPlacementGroup, GridPlacement[]>(
  DIRECTOR_PLACEMENT_GROUPS.map((group) => [
    group,
    Object.values(GridPlacement).filter(
      (placement) => PLACEMENT_GROUP_PATTERN.exec(placement)?.[1] === group
    ),
  ])
);

const KNOWN_PLACEMENTS = new Set<string>(
  [...PLACEMENTS_BY_GROUP.values()].flat()
);

const PLACEMENT_CATALOG = DIRECTOR_PLACEMENT_GROUPS.map((group) => {
  const placements = PLACEMENTS_BY_GROUP.get(group)!;
  return `${group}1-${placements.length}`;
}).join(", ");

function describePlacement(placement: GridPlacement): string {
  const [left, right] = getGridLocationsFromPlacement(placement);
  return `${placement} (left ${left}, right ${right})`;
}

/**
 * Turn a spoken placement reference into a grid placement.
 *
 * `{ group, location }` is the form a director actually says — "beta at
 * South". It is unique inside beta, where both hands share a point, and
 * ambiguous inside alpha and gamma, where either hand could be the one meant.
 * Ambiguity throws with the candidates rather than picking one, because
 * guessing here silently changes which hand leads.
 */
export function resolvePlacementRef(
  ref: DirectorPlacementRef,
  where: string
): GridPlacement {
  if (typeof ref === "string") {
    const name = ref.trim().toLowerCase();
    if (!KNOWN_PLACEMENTS.has(name)) {
      throw new Error(
        `${where}: unknown placement "${ref}". Placements are ${PLACEMENT_CATALOG}.`
      );
    }
    return name as GridPlacement;
  }

  if ("left" in ref) {
    const left = requireLocation(ref.left, where);
    const right = requireLocation(ref.right, where);
    try {
      return getGridPlacementFromLocations(left, right);
    } catch {
      throw new Error(
        `${where}: no TKA placement puts the left hand at ${left} and right hand at ${right}.`
      );
    }
  }

  const location = requireLocation(ref.location, where);
  const candidates = PLACEMENTS_BY_GROUP.get(ref.group)!.filter((placement) => {
    const [left, right] = getGridLocationsFromPlacement(placement);
    return left === location || right === location;
  });

  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new Error(
      `${where}: no ${ref.group} placement has a hand at ${location}.`
    );
  }
  throw new Error(
    `${where}: "${ref.group} at ${location}" could be ${candidates
      .map(describePlacement)
      .join(" or ")}. Name one, or give a {left, right} pair.`
  );
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

function isIntensity(turns: DirectorTurns): turns is { intensity: number } {
  return typeof turns === "object" && !Array.isArray(turns) && "intensity" in turns;
}

function isLanePair(
  turns: DirectorTurns
): turns is { left?: DirectorTurnLane; right?: DirectorTurnLane } {
  return (
    typeof turns === "object" &&
    !Array.isArray(turns) &&
    ("left" in turns || "right" in turns)
  );
}

function toLane(lane: DirectorTurnLane | undefined): DirectorTurnValue[] {
  if (lane === undefined) return [0];
  return Array.isArray(lane) ? [...lane] : [lane];
}

function formatPool(pool: readonly DirectorTurnValue[]): string {
  return pool.map((value) => (value === "fl" ? '"fl"' : String(value))).join(", ");
}

function assertTurnAllowed(
  value: DirectorTurnValue,
  level: DirectorSequenceLevel,
  hand: string,
  where: string
): void {
  const pool = getTurnPool(level);
  if (pool.includes(value)) return;
  const upgrade =
    level < 3 ? ' Level 3 adds halves and the float marker "fl".' : "";
  throw new Error(
    `${where}: ${hand} turn ${value === "fl" ? '"fl"' : value} is not available at level ${level}, which allows ${formatPool(pool)}.${upgrade}`
  );
}

/**
 * A turn figure becomes `turnPattern`, not `turnIntensity`. The pattern is
 * read modulo its own length, so it still answers at the bridge steps the
 * search inserts; an intensity allocation is a fixed-length roll that runs out
 * past the original length and leaves those steps unturned.
 */
function compileTurns(
  turns: DirectorTurns | undefined,
  level: DirectorSequenceLevel,
  where: string
): { turnPattern?: TurnLanes; turnIntensity?: number } {
  if (turns === undefined) return {};

  if (isIntensity(turns)) {
    const ceiling = Math.max(
      ...getTurnPool(level).filter(
        (value): value is number => typeof value === "number"
      )
    );
    if (turns.intensity < 0 || turns.intensity > ceiling) {
      throw new Error(
        `${where}: turn intensity ${turns.intensity} is outside level ${level}, which tops out at ${ceiling}.`
      );
    }
    return { turnIntensity: turns.intensity };
  }

  const lanes: TurnLanes = isLanePair(turns)
    ? { left: toLane(turns.left), right: toLane(turns.right) }
    : { left: toLane(turns), right: toLane(turns) };

  lanes.left.forEach((value) => assertTurnAllowed(value, level, "left", where));
  lanes.right.forEach((value) => assertTurnAllowed(value, level, "right", where));
  return { turnPattern: lanes };
}

// ---------------------------------------------------------------------------
// Remaining axes
// ---------------------------------------------------------------------------

function compileOrientations(
  orientation: DirectorStartOrientation | undefined
): { leftStartOrientation?: string; rightStartOrientation?: string } {
  if (orientation === undefined) return {};
  if (typeof orientation === "string") {
    return {
      leftStartOrientation: orientation,
      rightStartOrientation: orientation,
    };
  }
  return {
    ...(orientation.left ? { leftStartOrientation: orientation.left } : {}),
    ...(orientation.right ? { rightStartOrientation: orientation.right } : {}),
  };
}

/**
 * A LOOP directive also sets the mode. `loopType` and `period` are read only
 * after `generateSequence` routes on `mode === CIRCULAR`, so a film that names
 * a LOOP without the mode gets an ordinary sequence and no complaint.
 */
function compileLoop(
  loop: DirectorLoop | undefined
): Pick<GenerationOptions, "mode" | "loopType" | "period"> {
  if (loop === undefined) return {};
  const type = typeof loop === "string" ? loop : loop.type;
  const period = typeof loop === "string" ? undefined : loop.period;
  return {
    mode: GenerationMode.CIRCULAR,
    loopType: type as LOOPType,
    ...(period ? { period: period as Period } : {}),
  };
}

function compileLetters(
  letters: string[] | undefined,
  field: string,
  where: string
): Letter[] | undefined {
  if (!letters) return undefined;
  return letters.map((raw) => {
    const letter = normalizeLetter(raw);
    if (!letter) {
      throw new Error(`${where}: ${field} names "${raw}", which is not a TKA letter.`);
    }
    return letter;
  });
}

function compileEndPlacements(
  endPlacement: DirectorPlacementRef | DirectorPlacementRef[] | undefined,
  where: string
): GridPlacement[] | undefined {
  if (endPlacement === undefined) return undefined;
  const refs = Array.isArray(endPlacement) ? endPlacement : [endPlacement];
  return refs.map((ref) => resolvePlacementRef(ref, `${where} end placement`));
}

// ---------------------------------------------------------------------------
// The compiler
// ---------------------------------------------------------------------------

/**
 * Turn one directed sequence into the options the generation orchestrator
 * takes. Throws with a director-readable sentence when the directive names
 * something that cannot exist.
 */
export function compileSequenceDirective(
  sequence: DirectorGeneratedSequence,
  where = "sequence"
): GenerationOptions {
  // Gap 20. A cast-wide level ramp is spent during resolution, where the
  // performer's place in the cast is known, so what reaches the compiler is
  // always a plain level. The narrowing states that rather than assuming it.
  const spokenLevel = sequence.level;
  const level =
    typeof spokenLevel === "number" ? spokenLevel : DEFAULT_SEQUENCE_LEVEL;
  const turns = compileTurns(sequence.turns, level, where);
  const startPlacement = sequence.startPlacement
    ? resolvePlacementRef(sequence.startPlacement, `${where} start placement`)
    : undefined;

  return {
    // A word wins over length inside the orchestrator; the field is required
    // by GenerationOptions, so it echoes the spelled length.
    ...("word" in sequence
      ? { word: sequence.word, length: sequence.word.length }
      : { length: sequence.length }),
    gridMode: sequence.gridMode ?? GridMode.DIAMOND,
    // The generation prop only shapes constraint checks — the rendered prop is
    // whatever the performer was cast with.
    propType: PropType.STAFF,
    difficulty: DIFFICULTY_BY_LEVEL[level],
    constraintPreset: sequence.flow ?? "smooth",
    ...(sequence.handPath ? { handPathMode: sequence.handPath } : {}),
    ...(sequence.motionTypes ? { motionTypeFilter: sequence.motionTypes } : {}),
    ...(startPlacement ? { startPlacementId: startPlacement } : {}),
    ...turns,
    ...compileOrientations(sequence.startOrientation),
    ...compileLoop(sequence.loop),
    ...(sequence.mustContain
      ? {
          mustContainLetters: compileLetters(
            sequence.mustContain,
            "mustContain",
            where
          ),
        }
      : {}),
    ...(sequence.mustNotContain
      ? {
          mustNotContainLetters: compileLetters(
            sequence.mustNotContain,
            "mustNotContain",
            where
          ),
        }
      : {}),
    ...(sequence.endPlacement
      ? { endPlacements: compileEndPlacements(sequence.endPlacement, where) }
      : {}),
  };
}

/**
 * Fail the film at load rather than at generation. The sequence library
 * catches a failed build and falls back to the demo sequence, which is right
 * for an engine that cannot satisfy a legal request and wrong for a directive
 * that was never legal — that one should stop the film the way a bad mirror
 * reference does.
 */
export function assertSequenceDirective(
  sequence: DirectorPerformerSequence,
  where: string
): void {
  if (!isGeneratedSequence(sequence)) return;
  compileSequenceDirective(sequence, where);
}

/**
 * Two performers who asked for exactly the same thing share one generated
 * sequence. The key covers every control, so the same word with different
 * turns stays two sequences.
 */
export function sequenceDirectiveKey(
  sequence: DirectorPerformerSequence
): string {
  if ("mirrorOf" in sequence) return `mirrorOf:${sequence.mirrorOf}`;
  if ("transformOf" in sequence) {
    return `transformOf:${sequence.transformOf}:${stableJson(sequence.transforms)}`;
  }
  if ("library" in sequence) return `library:${sequence.library}`;
  if (isIdleSequence(sequence)) return "none";
  if (!isGeneratedSequence(sequence)) return "demo";
  return `generated:${stableJson(sequence)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, member]) => `${JSON.stringify(key)}:${stableJson(member)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
