/**
 * The phrase brain: what one spinner plays, where, in which planes, and which
 * way they face, for a whole night. Spec:
 * docs/superpowers/specs/active/2026-10-22-flow-fest-phrase-brain.md, with the
 * body response addendum (2026-10-23-body-response.md, "Phrase brain").
 *
 * A performer strings phrases together. A phrase is one library sequence
 * played one to three times, in one of three modes:
 *
 * - planted: feet stay put; any material the performer's skill allows;
 * - turning: an authored stepping turn (a quarter turn over two beats, a half
 *   turn over three) from the phrase's first beat, then the rest planted at the
 *   new facing. Only ever the run-up to a walk: it turns the performer back
 *   out, or toward room to walk;
 * - travelling: a straight exact-step walk from the phrase's first beat, one
 *   footfall per beat (every other beat when the tempo is too fast for a step
 *   on every one), then planted at the destination. Walk-safe material only.
 *
 * Planes belong to each staff and each beat (Austen, 2026-10-23): each staff
 * can "be on a different plane per beat". `beatPlanes` holds, per beat of the
 * phrase's sequence, the left and the right staff's plane; repeats replay the
 * same pattern. `plane` is the phrase's dominant plane, for labels.
 *
 * Facing is continuous: the body turns with the props instead of snapping a
 * quarter turn at a time. Each phrase carries a `facingTarget` (schedule yaw,
 * any angle), and playback eases the body's facing to it over the phrase's
 * first pass. `facingStart`/`facingEnd` stay the root facing the grid turns
 * with, which only an authored turn changes.
 *
 * The rules, as the tests pin them:
 *   1. a phrase is one sequence played 1–3 times;
 *   2. each staff's plane runs 2 to 6 beats (geometric, mean about 3.5)
 *      before it changes, the hands independently, so they often differ; a
 *      sequence may also hold one plane per staff throughout. Shares over the
 *      night are about wall 0.50, wheel 0.42, floor 0.08 (techers lean wall,
 *      wanderers wheel);
 *   3. a plane change never turns the body: facing is its own channel;
 *   4. a travelling phrase plays walk-safe material, both staffs held in a
 *      plane it is walk-safe in, its feet on the beat;
 *   5. hard material is planted;
 *   6. travel stays inside the performer's area, and the root turns back to
 *      face out (before the next walk) whenever it has turned its back on the
 *      audience;
 *   7. a planted phrase never turns the root; a turning phrase always leads
 *      into a walk;
 *   8. at most two turns in a row;
 *   9. the facing target drifts by up to 70 degrees a phrase from the last
 *      one, changes at most once a phrase, and is pulled back toward the
 *      audience once it is more than 100 degrees away;
 *  10. each phrase starts where the last one ended: both hands at the same
 *      grid location and orientation (a rest holds the chain, it does not
 *      reset it). Any library sequence may be picked; only a sequence that
 *      ends where it starts may repeat.
 *
 * Personality: `skill` loosens timing and caps how hard the planted material
 * gets; `style` (0 techer, 1 wanderer) shares beats between planted and
 * travelling phrases and sets how far a walk goes; `energy` sets phrase length
 * and how often the performer stops for a rest (props held still, feet
 * planted). The same seed always plays the same night.
 *
 * Positions: a performer starts at `home`; a planted or turning phrase stands
 * where the last travelling phrase ended. Units are metres and radians in the
 * jam's frame: x east, z south, yaw 0 faces +x and turns toward +z.
 *
 * Pure: no three.js, no Svelte. The library is passed in.
 */
import { isExactStepCountSupported } from "#lib/shared/3d/locomotion/straight-travel-constraints.js";
import {
  DEFAULT_WALK_SAFE,
  PHRASE_PLANES,
  isClosedLoop,
  isWalkSafeIn,
  joinDistance,
  joinLocationsMatch,
  phraseJoins,
  type PhraseJoinState,
  type PhraseJoins,
  type PhraseLibrarySequence,
  type PhrasePlane,
  type PhraseTags,
  type WalkSafeSettings,
} from "./flow-fest-phrase-library";

export type PhraseMode = "planted" | "turning" | "travelling";

export interface PhrasePoint {
  x: number;
  z: number;
}

export interface PhrasePersonality {
  /** 0 sloppy, 1 clean. */
  skill: number;
  /** 0 techer (stands and does tech), 1 wanderer (walks round doing simple material). */
  style: number;
  /** 0 short phrases and frequent rests, 1 long phrases and few. */
  energy: number;
}

export interface PhrasePath {
  from: PhrasePoint;
  to: PhrasePoint;
  /** Exact footfalls, the first landing one `beatsPerStep` after the phrase starts. */
  steps: number;
  beatsPerStep: number;
}

export interface PhraseTiming {
  /** A constant offset on the score inside the phrase, in beats; positive is late. */
  jitterBeats: number;
  /** Fractional tempo offset for the props inside the phrase; positive is rushing. */
  tempoDrift: number;
}

/** Both staffs' planes on one beat. */
export interface PhraseBeatPlanes {
  left: PhrasePlane;
  right: PhrasePlane;
}

export interface ScheduledPhrase {
  startBeat: number;
  beats: number;
  sequenceId: string;
  sequenceName: string;
  repeats: number;
  /** The plane most of the phrase's staff-beats are in, for labels. */
  plane: PhrasePlane;
  /** Per beat of one play of the sequence, each staff's plane; repeats replay it. */
  beatPlanes: PhraseBeatPlanes[];
  mode: PhraseMode;
  /** The root facing (schedule yaw) the grid turns with; only an authored turn changes it. */
  facingStart: number;
  facingEnd: number;
  /**
   * The yaw the body turns to over the phrase's first pass, at any angle;
   * it starts from the last phrase's target.
   */
  facingTarget: number;
  /** Beats the turn takes from the phrase's start; null unless turning. */
  turnBeats: number | null;
  path: PhrasePath | null;
  /** A rest: props held still at the sequence's start, feet planted. */
  rest: boolean;
  timing: PhraseTiming;
}

/** The parts of a library entry the brain reads. */
export interface PhraseBrainEntry {
  id: string;
  name: string;
  beats: number;
  tags: Pick<PhraseTags, "totalTurns" | "difficulty" | "kind" | "motionCounts">;
  /** Where the sequence starts and ends; read from `sequence` when absent. */
  joins?: PhraseJoins;
  sequence?: PhraseLibrarySequence;
}

/** An entry's joins, or null when it carries neither joins nor a sequence. */
export function phraseEntryJoins(entry: PhraseBrainEntry): PhraseJoins | null {
  return entry.joins ?? (entry.sequence ? phraseJoins(entry.sequence) : null);
}

export interface PhraseBrainSettings {
  walkSafe: WalkSafeSettings;
  /** Material above this difficulty is hard: planted phrases only. */
  hardDifficulty: number;
}

export const DEFAULT_PHRASE_BRAIN_SETTINGS: PhraseBrainSettings = {
  walkSafe: DEFAULT_WALK_SAFE,
  hardDifficulty: 0.3,
};

export interface PhrasePerformerSpec {
  id: string;
  seed: number;
  characterId: string;
  propFamily: string;
  personality: PhrasePersonality;
  home: PhrasePoint;
  areaRadius: number;
  /** The yaw this performer faces when facing out (toward the audience, or out of the circle). */
  outwardYaw: number;
}

export interface PhraseBrainInput {
  performer: PhrasePerformerSpec;
  tempoBpm: number;
  lengthBeats: number;
  library: readonly PhraseBrainEntry[];
  settings?: PhraseBrainSettings;
}

/** Walking keeps clear of the area's edge by this much. */
const AREA_MARGIN = 0.25;
const MIN_TRAVEL_STEPS = 3;
/** The shortest stride a walk plans; exact-step travel supports 0.55 m and up. */
const MIN_STRIDE = 0.56;
const QUARTER = Math.PI / 2;
type Hand = "left" | "right";
/** Families the brain plays. Poi and rope dart stay on grid work (spec, Decisions). */
const MOMENTUM_FAMILIES = new Set(["poi", "rope-dart"]);

/** mulberry32: small, fast, and the same in every engine. */
export function phraseRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  // "+ 0" turns -0 into 0, so the file and a fresh run compare equal.
  return Math.round(value * f) / f + 0;
}

/**
 * Beats per footfall for a walk at this tempo: one per beat when that cadence
 * is inside the proven exact-step range (90 to 150 steps a minute), every
 * other beat above it, and two per beat below it (at the stage's 60 bpm a
 * step a beat would be a crawl the exact-step plans do not cover).
 */
export function beatsPerStepAt(tempoBpm: number): number {
  const perBeat = tempoBpm / 60;
  if (perBeat > 150 / 60 + 1e-9) return 2;
  if (perBeat < 90 / 60 - 1e-9) return 0.5;
  return 1;
}

/** Turn angles the authored clips cover: a quarter turn each way and a half turn. */
function quantiseTurn(delta: number): number {
  const d = wrapAngle(delta);
  if (Math.abs(d) > (3 * Math.PI) / 4) return Math.PI;
  return d >= 0 ? QUARTER : -QUARTER;
}

/**
 * Beats an authored stepping turn takes: a quarter turn lasts a second, a half
 * turn a second and a half (2 and 3 beats at 120 bpm, 1 and 2 at 60).
 */
export function turnBeatsFor(delta: number, tempoBpm = 120): number {
  const seconds = Math.abs(delta) > 1.5 * QUARTER ? 1.5 : 1;
  return Math.max(1, Math.round((seconds * tempoBpm) / 60));
}

function weightedPick<T>(
  items: readonly T[],
  weight: (item: T) => number,
  rng: () => number
): T | null {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return null;
  let r = rng() * total;
  for (const item of items) {
    r -= Math.max(0, weight(item));
    if (r <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

function yawDirection(yaw: number): PhrasePoint {
  return { x: Math.cos(yaw), z: Math.sin(yaw) };
}

/**
 * Each staff's share of the night's beats in each plane. Wall and wheel carry
 * the night; floor (overhead and low horizontal spins) is occasional.
 * Techers lean wall, wanderers wheel.
 */
export function planeShareTargets(style: number): Record<PhrasePlane, number> {
  const techer = { wall: 0.55, wheel: 0.37, floor: 0.08 };
  const wanderer = { wall: 0.45, wheel: 0.48, floor: 0.07 };
  const s = clamp01(style);
  return {
    wall: techer.wall + (wanderer.wall - techer.wall) * s,
    wheel: techer.wheel + (wanderer.wheel - techer.wheel) * s,
    floor: techer.floor + (wanderer.floor - techer.floor) * s,
  };
}

/** A staff holds a plane this many beats before it changes. */
export const PLANE_RUN_MIN = 2;
export const PLANE_RUN_MAX = 6;
/** The mean run in wall and wheel taken together, before a sequence's end cuts runs short. */
const PLANE_RUN_MEAN = 4.3;
/** The chance a phrase holds one plane per staff the whole way through. */
const PLANE_HOLD_CHANCE = 0.15;
/** The facing target moves at most this far a phrase. */
const FACING_DRIFT_MAX = (70 * Math.PI) / 180;
/** How far either way of square an authored turn leaves the body facing. */
const TURN_SETTLE_SPREAD = (25 * Math.PI) / 180;
/** Past this far from the audience, the target drifts back toward it. */
const FACING_AWAY = (100 * Math.PI) / 180;

/** The mean of a run length drawn from 2..6 with each beat longer `decay` times as likely. */
function meanRun(decay: number): number {
  let sum = 0;
  let weight = 0;
  for (let k = PLANE_RUN_MIN; k <= PLANE_RUN_MAX; k++) {
    const w = decay ** (k - PLANE_RUN_MIN);
    sum += k * w;
    weight += w;
  }
  return sum / weight;
}

/** The decay whose runs average `mean` beats (meanRun rises with decay). */
function decayForMean(mean: number): number {
  let lo = 0.05;
  let hi = 4;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (meanRun(mid) < mean) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * One run's length, 2 to 6 beats and geometric over that range, from
 * `left` beats still to fill. It never leaves a single beat, and leaves
 * room for a second run when `minRuns` asks for one.
 */
function runLength(
  left: number,
  runsSoFar: number,
  minRuns: number,
  decay: number,
  rng: () => number
): number {
  const options: number[] = [];
  for (let k = PLANE_RUN_MIN; k <= Math.min(PLANE_RUN_MAX, left); k++) {
    const after = left - k;
    if (after === 1) continue;
    if (after === 0 && runsSoFar + 1 < minRuns) continue;
    options.push(k);
  }
  return (
    weightedPick(options, (n) => decay ** (n - PLANE_RUN_MIN), rng) ?? left
  );
}

/** One performer's night. */
export function planPhrases(input: PhraseBrainInput): ScheduledPhrase[] {
  const { performer, tempoBpm, lengthBeats, library } = input;
  const settings = input.settings ?? DEFAULT_PHRASE_BRAIN_SETTINGS;
  if (MOMENTUM_FAMILIES.has(performer.propFamily)) {
    throw new Error(
      `The phrase brain does not play ${performer.propFamily}; poi and rope dart stay on grid work`
    );
  }
  if (library.length === 0) throw new Error("The phrase brain needs a library");
  if (!(lengthBeats > 0)) throw new Error("lengthBeats must be positive");

  const rng = phraseRandom(performer.seed);
  const skill = clamp01(performer.personality.skill);
  const style = clamp01(performer.personality.style);
  const energy = clamp01(performer.personality.energy);

  const plantedCap = 0.25 + 0.75 * skill;
  const plantedTarget = 0.02 + 0.5 * skill;
  const jitterCap = 0.12 * (1 - skill);
  const driftCap = 0.03 * (1 - skill);
  const restChance = 0.25 * (1 - energy);
  const maxSteps = MIN_TRAVEL_STEPS + Math.round(5 * style);
  const beatsPerStep = beatsPerStepAt(tempoBpm);
  const secondsPerBeat = 60 / tempoBpm;
  const reach = Math.max(0, performer.areaRadius - AREA_MARGIN);

  const phrases: ScheduledPhrase[] = [];
  let beat = 0;
  let facing = performer.outwardYaw;
  let facingTarget = performer.outwardYaw;
  let position: PhrasePoint = { ...performer.home };
  let restedLast = true;

  // ------------------------------------------------------------- planes
  // Each staff carries its own plane from beat to beat. A new plane leans
  // toward the planes that staff has played less than its share, so the
  // night's shares land near the targets whatever the run structure does.
  const targets = planeShareTargets(style);
  const handPlane: Record<Hand, PhrasePlane> = {
    left: weightedPick(PHRASE_PLANES, (p) => targets[p], rng) ?? "wall",
    right: weightedPick(PHRASE_PLANES, (p) => targets[p], rng) ?? "wall",
  };
  const played: Record<Hand, Record<PhrasePlane, number>> = {
    left: { wall: 0, wheel: 0, floor: 0 },
    right: { wall: 0, wheel: 0, floor: 0 },
  };
  const playedShare = (hand: Hand, p: PhrasePlane) => {
    const total = PHRASE_PLANES.reduce((sum, q) => sum + played[hand][q], 0);
    return total === 0 ? targets[p] : played[hand][p] / total;
  };
  // A change always leaves the plane a staff is in, which on its own lifts
  // a rare plane's share toward a third; weighting by the target's 1.5 power
  // undoes that (floor lands near its share, not near 13%).
  const planeWeight = (hand: Hand, p: PhrasePlane) =>
    targets[p] ** 1.5 * Math.exp(8 * (targets[p] - playedShare(hand, p)));
  // A change always leaves the plane a staff is in, so with the floor
  // plane rare the staffs mostly alternate wall and wheel, and the two would
  // get equal time whatever the draw. A plane's runs are long in proportion
  // to its share instead (floor runs short), nudged by the same feedback.
  const majorityShare = (targets.wall + targets.wheel) / 2;
  const runDecay = (hand: Hand, p: PhrasePlane) =>
    decayForMean(
      Math.max(
        2.2,
        Math.min(
          5.5,
          ((PLANE_RUN_MEAN * targets[p]) / majorityShare) *
            Math.exp(4 * (targets[p] - playedShare(hand, p)))
        )
      )
    );
  const drawPlane = (hand: Hand, exclude: readonly PhrasePlane[]) =>
    weightedPick(
      PHRASE_PLANES.filter((p) => !exclude.includes(p)),
      (p) => planeWeight(hand, p),
      rng
    ) ?? handPlane[hand];

  /** One staff's planes over one play of a `beats`-beat sequence. */
  const handTrack = (
    hand: Hand,
    beats: number,
    repeats: number,
    steady: PhrasePlane | null,
    counted: boolean
  ): PhrasePlane[] => {
    if (steady) {
      handPlane[hand] = steady;
      if (counted) played[hand][steady] += beats * repeats;
      return Array.from({ length: beats }, () => steady);
    }
    const runs: Array<{ plane: PhrasePlane; length: number }> = [];
    const minRuns = repeats > 1 ? 2 : 1;
    let previous = handPlane[hand];
    for (let left = beats; left > 0; ) {
      // The first run carries on the plane the staff is in about half the
      // time; every later run changes plane.
      const plane =
        runs.length === 0 && rng() < 0.5
          ? previous
          : drawPlane(hand, [previous]);
      const length = runLength(
        left,
        runs.length,
        minRuns,
        runDecay(hand, plane),
        rng
      );
      runs.push({ plane, length });
      if (counted) played[hand][plane] += length * repeats;
      left -= length;
      previous = plane;
    }
    // A repeated pattern's last run differs from its first too, so the
    // repeat's seam is a change, not a run past six beats.
    const last = runs.at(-1)!;
    if (repeats > 1 && runs.length > 1 && last.plane === runs[0]!.plane) {
      const swap = drawPlane(hand, [runs[0]!.plane, runs.at(-2)!.plane]);
      if (counted) {
        played[hand][last.plane] -= last.length * repeats;
        played[hand][swap] += last.length * repeats;
      }
      last.plane = swap;
    }
    handPlane[hand] = last.plane;
    return runs.flatMap((run) =>
      Array.from({ length: run.length }, () => run.plane)
    );
  };

  /**
   * Both staffs' planes for one play of a sequence. `steady` holds each staff
   * in one plane throughout (a walk, a rest); otherwise a phrase sometimes
   * holds anyway, each staff in the plane it is in, or off the floor plane
   * when it is there: a whole phrase on the floor is not occasional.
   */
  const beatPlanesFor = (
    beats: number,
    repeats: number,
    steady: PhraseBeatPlanes | null,
    counted = true
  ): PhraseBeatPlanes[] => {
    const offFloor = (hand: Hand) =>
      handPlane[hand] === "floor"
        ? drawPlane(hand, ["floor"])
        : handPlane[hand];
    const hold =
      steady ??
      (rng() < PLANE_HOLD_CHANCE
        ? { left: offFloor("left"), right: offFloor("right") }
        : null);
    const left = handTrack("left", beats, repeats, hold?.left ?? null, counted);
    const right = handTrack(
      "right",
      beats,
      repeats,
      hold?.right ?? null,
      counted
    );
    return left.map((l, i) => ({ left: l, right: right[i]! }));
  };

  // ------------------------------------------------------------- facing
  /**
   * The facing target for a planted phrase: most phrases drift by up to 70
   * degrees either way, leaning back toward the audience, and pulled back
   * toward it once turned more than 100 degrees away; some hold.
   */
  const driftFacing = () => {
    if (rng() < 0.2) return;
    const off = wrapAngle(facingTarget - performer.outwardYaw);
    const drift =
      Math.abs(off) > FACING_AWAY
        ? -Math.sign(off) * FACING_DRIFT_MAX * (0.3 + 0.7 * rng())
        : Math.max(
            -FACING_DRIFT_MAX,
            Math.min(
              FACING_DRIFT_MAX,
              (rng() * 2 - 1) * FACING_DRIFT_MAX - 0.3 * off
            )
          );
    facingTarget = wrapAngle(facingTarget + drift);
  };

  // Rule 10: the chain is where the hands are now; every phrase starts there.
  const joinsById = new Map(library.map((e) => [e.id, phraseEntryJoins(e)]));
  const joinsOf = (entry: PhraseBrainEntry) => joinsById.get(entry.id) ?? null;
  let chain: PhraseJoinState | null = null;
  const startsOnChain = (entry: PhraseBrainEntry) => {
    const joins = joinsOf(entry);
    return !chain || !joins || joinDistance(joins.start, chain) === 0;
  };
  const closedLoop = (entry: PhraseBrainEntry) => {
    const joins = joinsOf(entry);
    return !joins || isClosedLoop(joins);
  };
  /**
   * The candidates that best continue the chain: those starting exactly where
   * the hands are, else those with the hands at the right locations, else the
   * closest.
   */
  const onChain = (
    candidates: readonly PhraseBrainEntry[]
  ): PhraseBrainEntry[] => {
    const here = chain;
    if (!here) return [...candidates];
    const exact = candidates.filter(startsOnChain);
    if (exact.length > 0) return exact;
    const located = candidates.filter((e) => {
      const joins = joinsOf(e);
      return !joins || joinLocationsMatch(joins.start, here);
    });
    if (located.length > 0) return located;
    const distance = (e: PhraseBrainEntry) =>
      joinDistance(joinsOf(e)!.start, here);
    const best = Math.min(...candidates.map(distance));
    return candidates.filter((e) => distance(e) === best);
  };

  // Sequences starting at each join. A sequence that ends where little else
  // starts leaves the next phrase with nothing that continues the chain, so
  // those are played only when nothing better continues it.
  const joinKey = (j: PhraseJoinState) =>
    `${j.left.location}/${j.left.orientation}|${j.right.location}/${j.right.orientation}`;
  const startingAt = new Map<string, number>();
  for (const joins of joinsById.values())
    if (joins)
      startingAt.set(
        joinKey(joins.start),
        (startingAt.get(joinKey(joins.start)) ?? 0) + 1
      );
  // An end is open when many sequences start there, or when some sequence
  // starting there leads (in a few phrases) back to such a join. Most
  // sequences that do not end where they start land on a quiet join, so
  // without the second half they would never be picked.
  const OPEN_END = 20;
  const openJoins = new Set(
    [...startingAt].filter(([, n]) => n >= OPEN_END).map(([key]) => key)
  );
  for (let grew = true; grew; ) {
    grew = false;
    for (const joins of joinsById.values()) {
      if (!joins) continue;
      const start = joinKey(joins.start);
      if (!openJoins.has(start) && openJoins.has(joinKey(joins.end))) {
        openJoins.add(start);
        grew = true;
      }
    }
  }
  const openEnded = (candidates: PhraseBrainEntry[]): PhraseBrainEntry[] => {
    const open = candidates.filter((e) => {
      const joins = joinsOf(e);
      return !joins || openJoins.has(joinKey(joins.end));
    });
    return open.length > 0 ? open : candidates;
  };
  /** A sequence that does not end where it starts is picked more readily, so they show. */
  const OPEN_SEQUENCE_WEIGHT = 6;
  const pickWeight = (entry: PhraseBrainEntry) =>
    closedLoop(entry) ? 1 : OPEN_SEQUENCE_WEIGHT;

  const isHard = (entry: PhraseBrainEntry) =>
    entry.tags.difficulty > settings.hardDifficulty;
  const walkPlanesOf = (entry: PhraseBrainEntry) =>
    PHRASE_PLANES.filter((p) => isWalkSafeIn(entry.tags, p, settings.walkSafe));

  const timing = (): PhraseTiming => ({
    jitterBeats: round((rng() * 2 - 1) * jitterCap, 3),
    tempoDrift: round((rng() * 2 - 1) * driftCap, 4),
  });

  /** Repeats for a sequence: energy lengthens, the slot and `minBeats` bound it. */
  const repeatsFor = (
    entry: PhraseBrainEntry,
    remaining: number,
    minBeats: number,
    maxRepeats: number
  ): number | null => {
    const wanted = 1 + Math.floor(rng() * (1 + 2 * energy));
    // Only a sequence that ends where it starts repeats without a jump.
    if (!closedLoop(entry)) maxRepeats = 1;
    const needed = Math.ceil(minBeats / entry.beats);
    let repeats = Math.min(
      maxRepeats,
      Math.max(Math.min(wanted, maxRepeats), needed, 1)
    );
    while (repeats > 1 && entry.beats * repeats > remaining) repeats--;
    if (repeats < needed || entry.beats * repeats > remaining) return null;
    return repeats;
  };

  /** Any library sequence may be picked; `accept` narrows it to the mode's material. */
  const pickSequence = (
    accept: (entry: PhraseBrainEntry) => boolean,
    weight: (entry: PhraseBrainEntry) => number,
    remaining: number,
    minBeats: number,
    maxRepeats = 3
  ): { entry: PhraseBrainEntry; repeats: number } | null => {
    const previous = phrases.at(-1)?.sequenceId;
    const allowed = library.filter(
      (e) =>
        accept(e) &&
        e.beats * (closedLoop(e) ? maxRepeats : 1) >= minBeats &&
        e.beats <= remaining
    );
    // A fresh sequence when one continues the chain exactly; more passes of
    // the one just played only when no other does.
    const fresh = openEnded(onChain(allowed.filter((e) => e.id !== previous)));
    const again = allowed.filter((e) => e.id === previous && startsOnChain(e));
    const candidates =
      fresh.length > 0 && fresh.every(startsOnChain)
        ? fresh
        : again.length > 0
          ? again
          : fresh.length > 0
            ? fresh
            : onChain(allowed);
    const entry = weightedPick(
      candidates,
      (e) => weight(e) * pickWeight(e),
      rng
    );
    if (!entry) return null;
    const repeats = repeatsFor(entry, remaining, minBeats, maxRepeats);
    return repeats ? { entry, repeats } : null;
  };

  /** The plane most of a phrase's staff-beats are in. */
  const dominantPlane = (beatPlanes: readonly PhraseBeatPlanes[]) => {
    const count: Record<PhrasePlane, number> = { wall: 0, wheel: 0, floor: 0 };
    for (const planes of beatPlanes) {
      count[planes.left]++;
      count[planes.right]++;
    }
    return PHRASE_PLANES.reduce((best, p) =>
      count[p] > count[best] ? p : best
    );
  };

  // Turning phrases in a row, and walks since the last turn (so a wanderer
  // can cross the area facing one way before turning back).
  let turnStreak = 0;
  let walksSinceTurn = 0;
  // Set by a turn: the next phrase is the walk it turned for.
  let walkNext = false;

  const push = (
    entry: PhraseBrainEntry,
    repeats: number,
    mode: PhraseMode,
    shape: {
      beatPlanes: PhraseBeatPlanes[];
      facingEnd: number;
      turnBeats: number | null;
      path: PhrasePath | null;
      rest: boolean;
      timing: PhraseTiming;
      beats?: number;
    }
  ) => {
    const beats = shape.beats ?? entry.beats * repeats;
    phrases.push({
      startBeat: beat,
      beats,
      sequenceId: entry.id,
      sequenceName: entry.name,
      repeats,
      plane: dominantPlane(shape.beatPlanes),
      beatPlanes: shape.beatPlanes,
      mode,
      facingStart: round(facing, 4),
      facingEnd: round(shape.facingEnd, 4),
      facingTarget: round(facingTarget, 4),
      turnBeats: shape.turnBeats,
      path: shape.path,
      rest: shape.rest,
      timing: shape.timing,
    });
    beat += beats;
    facing = shape.facingEnd;
    // A rest holds the hands where they are; anything played moves the chain
    // to where its sequence ends.
    if (!shape.rest) chain = joinsById.get(entry.id)?.end ?? chain;
    turnStreak = mode === "turning" ? turnStreak + 1 : 0;
    if (mode === "turning") walksSinceTurn = 0;
    else if (mode === "travelling") walksSinceTurn++;
  };

  const rest = (beats: number) => {
    // Props held still at the start of the named sequence: the one just
    // played when it starts where the hands are now (it ends where it
    // starts), otherwise one that starts there. The staffs keep their
    // planes and the body its facing.
    const last = phrases.at(-1);
    const entry = last
      ? library.find((e) => e.id === last.sequenceId)
      : undefined;
    const held =
      (entry && startsOnChain(entry) ? entry : undefined) ??
      library.find((e) => startsOnChain(e) && !isHard(e)) ??
      library.find(startsOnChain) ??
      entry ??
      library.find((e) => !isHard(e)) ??
      library[0]!;
    push(held, 1, "planted", {
      beats,
      beatPlanes: beatPlanesFor(
        held.beats,
        1,
        { left: handPlane.left, right: handPlane.right },
        false
      ),
      facingEnd: facing,
      turnBeats: null,
      path: null,
      rest: true,
      timing: { jitterBeats: 0, tempoDrift: 0 },
    });
    restedLast = true;
  };

  /** How far a heading runs from here before leaving the area. */
  const roomAlong = (heading: number): number => {
    // The ray from here meets the area's circle at t = -b + sqrt(b^2 - c).
    const dir = yawDirection(heading);
    const ox = position.x - performer.home.x;
    const oz = position.z - performer.home.z;
    const b = ox * dir.x + oz * dir.z;
    const c = ox * ox + oz * oz - reach * reach;
    return b * b - c >= 0 ? -b + Math.sqrt(b * b - c) : 0;
  };

  /** A straight walk ahead (within about 35 degrees of facing) that stays in the area. */
  const planWalk = (budgetBeats: number): PhrasePath | null => {
    const stepCap = Math.min(
      maxSteps,
      Math.floor((budgetBeats - 1) / beatsPerStep)
    );
    if (stepCap < MIN_TRAVEL_STEPS) return null;
    // Headings with the most room first, so a walk tends to cross the area
    // and leave room for the next one instead of running into the edge.
    const headings = Array.from(
      { length: 10 },
      () => facing + (rng() * 2 - 1) * 0.6
    ).sort((a, b) => roomAlong(b) - roomAlong(a));
    for (const heading of headings) {
      const dir = yawDirection(heading);
      const room = roomAlong(heading);
      const roomSteps = Math.min(stepCap, Math.floor(room / MIN_STRIDE));
      if (roomSteps < MIN_TRAVEL_STEPS) continue;
      // Use under half the room, so another walk fits after it.
      const longest = Math.max(
        MIN_TRAVEL_STEPS,
        Math.min(roomSteps, Math.ceil(roomSteps * 0.45))
      );
      const steps =
        MIN_TRAVEL_STEPS + Math.floor(rng() * (longest - MIN_TRAVEL_STEPS + 1));
      // The shortest strides when room is tight, so a second walk still fits.
      const loose = room > 2 * MIN_TRAVEL_STEPS * (MIN_STRIDE + 0.1);
      const stride = Math.min(
        MIN_STRIDE + rng() * (loose ? 0.08 : 0.02),
        room / steps
      );
      const distance = steps * stride;
      const to = {
        x: position.x + dir.x * distance,
        z: position.z + dir.z * distance,
      };
      if (Math.hypot(to.x - performer.home.x, to.z - performer.home.z) > reach)
        continue;
      if (
        !isExactStepCountSupported(
          distance,
          steps * beatsPerStep * secondsPerBeat,
          steps
        )
      )
        continue;
      return {
        from: { x: round(position.x, 3), z: round(position.z, 3) },
        to: { x: round(to.x, 3), z: round(to.z, 3) },
        steps,
        beatsPerStep,
      };
    }
    return null;
  };

  /**
   * The turn among `turns` with the most room to walk after it. Turning the
   * back on the audience costs a turn back later, so its room counts for half.
   */
  const roomiestTurn = (turns: readonly number[]): number =>
    turns
      .map((d) => {
        const off = Math.abs(wrapAngle(performer.outwardYaw - facing - d));
        const room = roomAlong(facing + d);
        return { d, score: off > (3 * Math.PI) / 4 ? room / 2 : room };
      })
      .sort((a, b) => b.score - a.score)[0]!.d;

  /** A turn toward `aim`, or with no aim, the turn back out to the audience. */
  const chooseTurn = (aim: number | null): number =>
    quantiseTurn(
      aim === null
        ? wrapAngle(performer.outwardYaw - facing)
        : wrapAngle(aim - facing)
    );

  /**
   * A walk-safe plane for one staff on a walk, leaning toward the plane it is
   * in. Each staff picks its own, so a pass (walk-safe in any plane) can walk
   * with the staffs in different planes.
   */
  const walkPlaneFor = (entry: PhraseBrainEntry, hand: Hand): PhrasePlane => {
    const planes = walkPlanesOf(entry);
    return (
      weightedPick(
        planes,
        (p) => planeWeight(hand, p) * (p === handPlane[hand] ? 2 : 1),
        rng
      ) ??
      planes[0] ??
      "wall"
    );
  };

  while (beat < lengthBeats) {
    const remaining = lengthBeats - beat;
    if (remaining < 4) {
      rest(remaining);
      break;
    }
    if (!walkNext && !restedLast && rng() < restChance) {
      rest(Math.min(remaining, 4 * (1 + Math.floor(rng() * 2))));
      continue;
    }

    const canTurn = turnStreak < 2;
    // Rule 6: with the back to the audience, turn back out before walking
    // again. A wanderer who has turned away walks off that way, up to two
    // walks, first.
    const offOut = Math.abs(wrapAngle(performer.outwardYaw - facing));
    const away = offOut > (3 * Math.PI) / 4;
    const walkingOff =
      phrases.at(-1)?.mode === "travelling" && walksSinceTurn < 2;
    const weights = away
      ? walkingOff
        ? { planted: 0.15 + 0.4 * (1 - style), travelling: 0.2 + 1.8 * style }
        : { planted: 0.05 + 0.15 * (1 - style), travelling: 2 }
      : { planted: 0.25 + 0.75 * (1 - style), travelling: 0.05 + 0.6 * style };
    const forcedWalk = walkNext;
    walkNext = false;
    let mode: PhraseMode =
      forcedWalk ||
      rng() * (weights.planted + weights.travelling) >= weights.planted
        ? "travelling"
        : "planted";
    let turnAim: number | null = null;
    let placed = false;

    if (mode === "travelling" && away && !walkingOff && !forcedWalk) {
      // Back out first; the walk follows.
      mode = canTurn ? "turning" : "planted";
    } else if (mode === "travelling") {
      const choice = pickSequence(
        (e) => walkPlanesOf(e).length > 0,
        () => 1,
        remaining,
        MIN_TRAVEL_STEPS * beatsPerStep + 1
      );
      const path = choice
        ? planWalk(choice.entry.beats * choice.repeats)
        : null;
      if (choice && path) {
        // A walk faces where it goes: its heading, within about 35 degrees
        // of the root facing.
        facingTarget = Math.atan2(
          path.to.z - path.from.z,
          path.to.x - path.from.x
        );
        push(choice.entry, choice.repeats, "travelling", {
          beatPlanes: beatPlanesFor(choice.entry.beats, choice.repeats, {
            left: walkPlaneFor(choice.entry, "left"),
            right: walkPlaneFor(choice.entry, "right"),
          }),
          facingEnd: facing,
          turnBeats: null,
          path,
          rest: false,
          timing: timing(),
        });
        position = { ...path.to };
        placed = true;
      } else if (choice && canTurn && turnStreak === 0 && rng() < 0.5) {
        // No room ahead: turn toward the most room (a quarter turn either
        // way, or a half turn) and walk next. Turned away already, the turn
        // is the one back out.
        mode = "turning";
        turnAim = away
          ? null
          : facing + roomiestTurn([QUARTER, -QUARTER, Math.PI]);
      } else {
        mode = "planted";
      }
    }

    if (!placed && mode === "turning") {
      const delta = chooseTurn(turnAim);
      const turnBeats = turnBeatsFor(delta, tempoBpm);
      // One pass of the sequence: the turn is the phrase, so it stays short.
      const choice = pickSequence(
        (e) => !isHard(e),
        () => 1,
        remaining,
        turnBeats + 2,
        1
      );
      if (choice) {
        const facingEnd = wrapAngle(facing + delta);
        // The body turns with the root here, and ends a little off square,
        // as a real turn does; the walk after it faces its own heading.
        facingTarget = wrapAngle(
          facingEnd + (rng() * 2 - 1) * TURN_SETTLE_SPREAD
        );
        push(choice.entry, choice.repeats, "turning", {
          beatPlanes: beatPlanesFor(choice.entry.beats, choice.repeats, null),
          facingEnd,
          turnBeats,
          path: null,
          rest: false,
          timing: timing(),
        });
        placed = true;
        walkNext = true;
      } else {
        mode = "planted";
      }
    }

    if (!placed) {
      const choice = pickSequence(
        (e) => e.tags.difficulty <= plantedCap,
        (e) =>
          Math.exp(-(((e.tags.difficulty - plantedTarget) / 0.12) ** 2)) + 0.01,
        remaining,
        4
      );
      if (!choice) {
        rest(Math.min(remaining, 4));
        continue;
      }
      driftFacing();
      push(choice.entry, choice.repeats, "planted", {
        beatPlanes: beatPlanesFor(choice.entry.beats, choice.repeats, null),
        facingEnd: facing,
        turnBeats: null,
        path: null,
        rest: false,
        timing: timing(),
      });
    }
    restedLast = false;
  }

  return phrases;
}

/** Where a performer stands at the start of each phrase, by the position rule. */
export function phraseStartPositions(
  home: PhrasePoint,
  phrases: readonly ScheduledPhrase[]
): PhrasePoint[] {
  let at = { ...home };
  return phrases.map((phrase) => {
    const here = phrase.path ? { ...phrase.path.from } : { ...at };
    if (phrase.path) at = { ...phrase.path.to };
    return here;
  });
}

/**
 * Joins where the hands jump: a phrase that does not start where the last
 * one left the hands, or a repeat of a sequence that does not end where it
 * starts (rule 10). With `loop`, the wrap from the night's last phrase to its
 * first counts too.
 */
export function countJoinMismatches(
  phrases: readonly ScheduledPhrase[],
  library: readonly PhraseBrainEntry[],
  options: { loop?: boolean } = {}
): number {
  const joins = new Map(library.map((e) => [e.id, phraseEntryJoins(e)]));
  let chain: PhraseJoinState | null = null;
  let mismatches = 0;
  for (const phrase of phrases) {
    const j = joins.get(phrase.sequenceId);
    if (!j) continue;
    if (chain && joinDistance(j.start, chain) !== 0) mismatches++;
    if (phrase.repeats > 1 && !isClosedLoop(j))
      mismatches += phrase.repeats - 1;
    if (!phrase.rest) chain = j.end;
  }
  const first = phrases[0] && joins.get(phrases[0].sequenceId);
  if (options.loop && first && chain && joinDistance(first.start, chain) !== 0)
    mismatches++;
  return mismatches;
}

export interface PhraseSchedulePerformer {
  id: string;
  seed: number;
  characterId: string;
  propFamily: string;
  personality: PhrasePersonality;
  home: PhrasePoint;
  areaRadius: number;
  phrases: ScheduledPhrase[];
}

export interface PhraseScheduleFile {
  version: "flow-fest-phrase-schedule-v1";
  tempoBpm: number;
  lengthBeats: number;
  performers: PhraseSchedulePerformer[];
}

/** Every performer's night, in the shared schedule file's shape. */
export function buildPhraseSchedule(
  performers: readonly PhrasePerformerSpec[],
  options: {
    tempoBpm: number;
    lengthBeats: number;
    library: readonly PhraseBrainEntry[];
    settings?: PhraseBrainSettings;
  }
): PhraseScheduleFile {
  return {
    version: "flow-fest-phrase-schedule-v1",
    tempoBpm: options.tempoBpm,
    lengthBeats: options.lengthBeats,
    performers: performers.map((performer) => ({
      id: performer.id,
      seed: performer.seed,
      characterId: performer.characterId,
      propFamily: performer.propFamily,
      personality: { ...performer.personality },
      home: { ...performer.home },
      areaRadius: performer.areaRadius,
      phrases: planPhrases({
        performer,
        tempoBpm: options.tempoBpm,
        lengthBeats: options.lengthBeats,
        library: options.library,
        settings: options.settings,
      }),
    })),
  };
}
