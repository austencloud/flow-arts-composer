/**
 * Example-pool adapter - turns a page's curated pool JSON (verbatim MCP
 * generate_sequence step data) into playable PictographData[] strips using the
 * SAME canonical primitives the hand-authored guide content uses
 * (createMotionData, getGridPlacementFromLocations, bakeReversals). One faithful
 * path, so a pooled example renders byte-for-byte like an authored one.
 *
 * `buildPools()` is the factory: it's a pure function over ANY page's pool
 * JSON (one JSON per page, same schema - see README.md), so every future
 * `<page>.pool.json` reuses this one adapter instead of a per-page fork. The
 * permutations page was the pilot; its named exports below (`mirroredPool`,
 * `rotatedPool`, `swappedPool`, ...) are now thin wrappers over the factory so
 * `permutations.content.ts` and its tests don't need to change.
 *
 * Provenance: src/.../example-pools/README.md → the rollout spec
 * (docs/superpowers/specs/2026-07-16-guide-example-pools-rollout.md, section
 * 2b) and the parent design spec
 * (docs/superpowers/specs/2026-07-16-guide-example-pools-design.md). Each
 * page's JSON is the single source for that page; do not hand-edit strips
 * here.
 *
 * Nomenclature: a `step` is one pictograph in a sequence. Never "beat".
 */
import permutationsPoolJson from "./permutations.pool.json";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridMode,
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  getGridPlacementFromLocations,
  getGridLocationsFromPlacement,
} from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PoolEntry } from "../guide-content-blocks";
import { bakeReversals } from "../guide-sequence-adapter";

export type { PoolEntry };

// Shared by every page's pool JSON (one JSON per page, same schema - rollout
// spec section 2a). `RawPool` is deliberately loose on `generationDefaults`
// (only `gridMode` is read today; the rest is provenance for humans, not the
// adapter).
type RawHand = { type: string; dir: string; turns?: number; ori: string };
type RawStep = {
  step: number;
  letter: string;
  pos: string;
  left?: RawHand;
  right?: RawHand;
  /** @deprecated Legacy pool vocabulary accepted at this import boundary. */
  blue?: RawHand;
  /** @deprecated Legacy pool vocabulary accepted at this import boundary. */
  red?: RawHand;
};
export type RawEntry = {
  word: string;
  loopType: string;
  period?: string;
  /** Explicit display label. Compound classifications (e.g. "Swapped &
   *  Mirrored") can't be derived from loopType/period alone, so a candidate
   *  may carry its label outright. When absent, loopLabel() falls back to the
   *  existing derivation. */
  label?: string;
  prose: string;
  steps: RawStep[];
};
export type RawSlot = { defaultEntry: string; candidates: RawEntry[] };
export type RawPool = {
  slots: Record<string, RawSlot>;
  generationDefaults?: { gridMode?: string };
};

// PoolEntry is defined in guide-content-blocks.ts (the content-model hub) and
// re-exported above.

// ── Enum lookups (JSON string → canonical enum) ────────────────────────────
const MOTION_TYPE: Record<string, MotionType> = {
  pro: MotionType.PRO,
  anti: MotionType.ANTI,
  dash: MotionType.DASH,
  static: MotionType.STATIC,
};
const ROT_DIR: Record<string, RotationDirection> = {
  cw: RotationDirection.CLOCKWISE,
  ccw: RotationDirection.COUNTER_CLOCKWISE,
  noRotation: RotationDirection.NO_ROTATION,
};
const ORI: Record<string, Orientation> = {
  in: Orientation.IN,
  out: Orientation.OUT,
};

// The Letter const-union's VALUES ARE the display strings ("G", "Θ", "W-",
// "Ψ-", "Σ-", "β", …), so a membership check IS the lookup. Greek start letters
// (β/α/γ) are Letter values too (BETA/ALPHA/GAMMA), so one gate covers steps and
// start boxes alike.
const LETTER_VALUES = new Set<string>(Object.values(Letter));
const POSITION_VALUES = new Set<string>(Object.values(GridPlacement));

function toLetter(s: string): Letter {
  if (!LETTER_VALUES.has(s))
    throw new Error(`pool-adapter: unmapped letter "${s}"`);
  return s as Letter;
}
function toPosition(s: string): GridPlacement {
  if (!POSITION_VALUES.has(s))
    throw new Error(`pool-adapter: unknown position "${s}"`);
  return s as GridPlacement;
}
function req<T>(v: T | undefined, msg: string): T {
  if (v === undefined) throw new Error(`pool-adapter: ${msg}`);
  return v;
}

const GRID_MODE_VALUES = new Set<string>(Object.values(GridMode));

/** Diamond stays the default for every page - none of the rollout's 22 slots
 *  generate box or skewed. A pool JSON can opt into a different grid mode via
 *  `generationDefaults.gridMode`; an unrecognized or absent value falls back
 *  to diamond rather than throwing, since this is provenance metadata, not a
 *  hard requirement. */
function resolveGridMode(raw: string | undefined): GridMode {
  if (raw && GRID_MODE_VALUES.has(raw)) return raw as GridMode;
  return GridMode.DIAMOND;
}

/**
 * Init-time invariant. The canonical inverse (getGridLocationsFromPlacement) is
 * what the adapter uses to turn a position NAME back into a (left, right) location
 * pair - the deriver is the canon, so we reuse its inverse rather than
 * hand-author a table. This assertion enumerates EVERY GridLocation pair through
 * the canonical forward deriver and proves the property the pool relies on: the
 * inverse is unique per position (no two location pairs collapse onto one
 * position) and round-trips (canon inverse of a position forward-derives back to
 * it). Throws at module load if the canon ever drifts.
 */
function assertPositionInverseIsUnique(): void {
  const producedBy = new Map<GridPlacement, string>();
  const locations = Object.values(GridLocation);
  for (const left of locations) {
    for (const right of locations) {
      let pos: GridPlacement;
      try {
        pos = getGridPlacementFromLocations(
          left as GridLocation,
          right as GridLocation
        );
      } catch {
        continue; // not a valid position pair - skip
      }
      const key = `${left},${right}`;
      const prior = producedBy.get(pos);
      if (prior && prior !== key) {
        throw new Error(
          `pool-adapter: position ${pos} is not unique: produced by ${prior} and ${key}`
        );
      }
      producedBy.set(pos, key);
    }
  }
  for (const [pos, key] of producedBy) {
    const [b, r] = getGridLocationsFromPlacement(pos);
    if (getGridPlacementFromLocations(b, r) !== pos) {
      throw new Error(`pool-adapter: inverse round-trip failed for ${pos}`);
    }
    if (`${b},${r}` !== key) {
      throw new Error(
        `pool-adapter: inverse mismatch for ${pos}: canon ${b},${r} vs forward ${key}`
      );
    }
  }
}
assertPositionInverseIsUnique();

function locationsOf(posName: string): {
  left: GridLocation;
  right: GridLocation;
} {
  const [left, right] = getGridLocationsFromPlacement(toPosition(posName));
  return { left, right };
}

/** "beta7→beta1" → { start: "beta7", end: "beta1" }. */
function parsePair(raw: string, label: string): { start: string; end: string } {
  const parts = raw.split("→").map((s) => s.trim());
  if (parts.length !== 2)
    throw new Error(`pool-adapter: malformed ${label} "${raw}"`);
  return { start: parts[0]!, end: parts[1]! };
}

/** One hand's motion, values taken straight from the JSON (they are exact - no
 *  HP_CW inference). Locations come from the inverted start/end positions. */
function handMotion(
  color: HandSide,
  h: RawHand,
  from: GridLocation,
  to: GridLocation,
  gridMode: GridMode
): MotionData {
  const { start: so, end: eo } = parsePair(h.ori, "orientation");
  return createMotionData({
    motionType: req(MOTION_TYPE[h.type], `unknown motion type "${h.type}"`),
    rotationDirection: req(
      ROT_DIR[h.dir],
      `unknown rotation direction "${h.dir}"`
    ),
    startLocation: from,
    endLocation: to,
    startOrientation: req(ORI[so], `unknown orientation "${so}"`),
    endOrientation: req(ORI[eo], `unknown orientation "${eo}"`),
    turns: h.turns ?? 0,
    hand: color,
    propType: PropType.STAFF,
    gridMode,
  });
}

function rawHand(step: RawStep, hand: HandSide): RawHand {
  const motion =
    hand === HandSide.LEFT
      ? (step.left ?? step.blue)
      : (step.right ?? step.red);
  return req(motion, `step ${step.step} is missing its ${hand} motion`);
}

/**
 * A curated entry → its PictographData strip: start box from step 0, then one
 * StepData per step 1..n (locations from the inverted positions, motion fields
 * from the JSON), then bakeReversals over the steps - exactly the shape
 * permutations.content.ts builds by hand.
 *
 * `gridMode` defaults to diamond (every rollout slot uses diamond); a factory
 * caller can pass the pool's resolved `generationDefaults.gridMode` instead.
 */
export function entryToStrip(
  entry: RawEntry,
  gridMode: GridMode = GridMode.DIAMOND
): PictographData[] {
  const steps = entry.steps;
  if (!steps.length)
    throw new Error(`pool-adapter: ${entry.word} has no steps`);

  const s0 = steps.find((s) => s.step === 0) ?? steps[0]!;
  const startLoc = locationsOf(parsePair(s0.pos, "position").start);
  const startBox = {
    id: `pool-${entry.word}-0`,
    letter: toLetter(s0.letter),
    gridMode,
    stepNumber: 0,
    startPlacement: getGridPlacementFromLocations(startLoc.left, startLoc.right),
    endPlacement: getGridPlacementFromLocations(startLoc.left, startLoc.right),
    motions: {
      left: handMotion(
        HandSide.LEFT,
        rawHand(s0, HandSide.LEFT),
        startLoc.left,
        startLoc.left,
        gridMode
      ),
      right: handMotion(
        HandSide.RIGHT,
        rawHand(s0, HandSide.RIGHT),
        startLoc.right,
        startLoc.right,
        gridMode
      ),
    },
  } as unknown as StepData;

  const stepBoxes = steps
    .filter((s) => s.step > 0)
    .map((s) => {
      const { start, end } = parsePair(s.pos, "position");
      const from = locationsOf(start);
      const to = locationsOf(end);
      return {
        id: `pool-${entry.word}-${s.step}`,
        letter: toLetter(s.letter),
        gridMode,
        stepNumber: s.step,
        startPlacement: getGridPlacementFromLocations(from.left, from.right),
        endPlacement: getGridPlacementFromLocations(to.left, to.right),
        motions: {
          left: handMotion(
            HandSide.LEFT,
            rawHand(s, HandSide.LEFT),
            from.left,
            to.left,
            gridMode
          ),
          right: handMotion(
            HandSide.RIGHT,
            rawHand(s, HandSide.RIGHT),
            from.right,
            to.right,
            gridMode
          ),
        },
      } as unknown as StepData;
    });

  // Reversal dots derived from the motions themselves (never hand-claimed) -
  // same channel and policy as the hand-authored strips.
  const baked = bakeReversals(stepBoxes);
  return [startBox, ...baked] as unknown as PictographData[];
}

/** Semantic label for the slot/entry. An explicit `label` on the candidate
 *  wins outright - it exists for compound classifications ("Swapped &
 *  Mirrored") that the derivation below can't reconstruct from loopType/period
 *  alone. Otherwise: Rotated carries its rotation slice (halved = 180°,
 *  quartered = 90°); "turns" is never used for loop rotation. */
export function loopLabel(entry: RawEntry): string {
  if (entry.label) return entry.label;
  if (entry.loopType === "rotated") {
    const deg =
      entry.period === "halved"
        ? "180°"
        : entry.period === "quartered"
          ? "90°"
          : "";
    return deg ? `Rotated ${deg}` : "Rotated";
  }
  if (entry.loopType === "mirrored") return "Mirrored";
  if (entry.loopType === "swapped") return "Swapped";
  return entry.loopType;
}

/** An entry that failed to adapt (unmapped letter / non-inverting position).
 *  The factory EXCLUDES it from the slot's pool and records it here, so one
 *  bad candidate never breaks the page. */
export type FlaggedEntry = { slot: string; word: string; reason: string };

function buildSlot(
  slotKey: string,
  slot: RawSlot | undefined,
  gridMode: GridMode,
  flagged: FlaggedEntry[]
): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const entry of slot?.candidates ?? []) {
    try {
      out.push({
        word: entry.word,
        loopLabel: loopLabel(entry),
        proseHtml: entry.prose,
        items: entryToStrip(entry, gridMode),
      });
    } catch (err) {
      flagged.push({
        slot: slotKey,
        word: entry.word,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

/**
 * The factory: a pure function over any page's pool JSON (one JSON per page,
 * same schema - README.md / rollout spec section 2a). Builds every slot's
 * `PoolEntry[]` and collects flagged candidates across all slots. Each page
 * gets a thin module: `import json from "./<page>.pool.json"; export const
 * pools = buildPools(json);`.
 */
export function buildPools(pool: RawPool): {
  pools: Record<string, PoolEntry[]>;
  flagged: FlaggedEntry[];
} {
  const gridMode = resolveGridMode(pool.generationDefaults?.gridMode);
  const flagged: FlaggedEntry[] = [];
  const pools: Record<string, PoolEntry[]> = {};
  for (const [slotKey, slot] of Object.entries(pool.slots)) {
    pools[slotKey] = buildSlot(slotKey, slot, gridMode, flagged);
  }
  return { pools, flagged };
}

// ── Permutations page: compatibility wrapper over the factory ──────────────
// permutations.content.ts imports mirroredPool/rotatedPool/swappedPool by
// name; keeping these as thin wrappers means that file and its tests need no
// changes for the factory generalization.
const permutationsRaw = permutationsPoolJson as RawPool;
const permutationsBuilt = buildPools(permutationsRaw);

/** Raw candidate slates, exposed for tests (and re-adaptation). */
export const rawSlots = permutationsRaw.slots;

/** Entries that failed to adapt for the permutations page. Empty when every
 *  candidate adapts cleanly (the expected steady state). */
export const flaggedEntries: FlaggedEntry[] = permutationsBuilt.flagged;

/** Adapter candidates (entries 1..N) per slot. The content file prepends
 *  entry 0 (the original print example). */
export const mirroredPool: PoolEntry[] = permutationsBuilt.pools.mirrored ?? [];
export const rotatedPool: PoolEntry[] = permutationsBuilt.pools.rotated ?? [];
export const swappedPool: PoolEntry[] = permutationsBuilt.pools.swapped ?? [];
