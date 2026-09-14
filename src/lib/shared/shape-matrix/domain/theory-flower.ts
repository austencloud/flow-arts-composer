/**
 * The Theory surface's axis vocabulary: the Shape Matrix's own row-and-column
 * idea, carried onto rational prop-to-hand ratios beyond the named turn set.
 *
 * A matrix row is one hand doing one thing. On the Matrix surface that thing
 * is a TKA turn value, which pins the ratio to the turn ladder rather than
 * accepting a fraction directly. Here the ratio is chosen directly, so the
 * same four variants per hand open onto the complete 0–15 ratio field.
 *
 * Timing and direction stay where VTG puts them: BETWEEN the two hands. The
 * QfT model already carries both as knobs (`handPhase`, `handDirection`), so
 * they belong to the pairing rather than to either axis, exactly as split /
 * together / quarter and same / opposite do in the alphabet. The pairing is
 * named by the app's own `VtgMode`, so a Theory pairing and a Matrix cell's
 * realization are the same six things under the same six element names.
 */
import {
  makeSpinRatio,
  parseSpinRatio,
  spinRatioKey,
  spinRatioPetals,
  type SpinRatio,
  type SpinStyle,
} from "@vtg/domain";
import {
  propRateForKnobs,
  type QftKnobs,
} from "$lib/shared/notation/qft/qft-model";
import { theoryRatioLabel } from "./theory-ratio";
import type { VtgMode } from "../services/shape-matrix-realizations";

/** Where the prop points at the downbeat, relative to the hand's bearing. */
export type TheoryOri = "in" | "out" | "clock" | "counter";

export interface TheoryFlower {
  readonly ratio: SpinRatio;
  /** Prospin or antispin, relative to the hand. Float ratios have neither. */
  readonly style: SpinStyle;
  readonly ori: TheoryOri;
  readonly petals: number;
}

/** Compass eighths between the two hands' starting points, by VTG timing. */
const TIMING_OFFSET: Record<string, number> = {
  S: 4,
  T: 0,
  Q: 2,
};

/** Prop offset from the hand's own bearing, in compass eighths. */
const ORI_PHASE: Record<TheoryOri, number> = {
  out: 0,
  clock: 2,
  in: 4,
  counter: 6,
};

/** QfT publishes every table starting the hand at 8, straight up. */
const HAND_HOME = 8;

export function isFloatRatio(ratio: SpinRatio): boolean {
  return ratio.propRotations === 0;
}

export function isStationaryRatio(ratio: SpinRatio): boolean {
  return ratio.handCycles === 0;
}

export function theoryFlowerKey(flower: TheoryFlower): string {
  return `${spinRatioKey(flower.ratio)}-${flower.style}-${flower.ori}`;
}

function isTheoryOri(value: string | undefined): value is TheoryOri {
  return value !== undefined && value in ORI_PHASE;
}

function isSpinStyle(value: string | undefined): value is SpinStyle {
  return value === "pro" || value === "anti";
}

/**
 * The inverse of `theoryFlowerKey`, for restoring a shared link. Rebuilding
 * from the axis rather than from the key's own parts keeps petals and the
 * endpoint collapses (float, stationary) authoritative in one place.
 *
 * A link written before the axis stopped emitting coincident starts still
 * resolves. `1:2-pro-out` names a start that no longer has a row of its own,
 * because at two hand cycles `out` is `in` re-entered half a period later and
 * the two draw one curve. Falling to the start it coincides with shows that
 * link exactly the shape it always showed, rather than dropping the selection.
 */
export function parseTheoryFlowerKey(key: string): TheoryFlower | null {
  const parts = key.split("-");
  if (parts.length !== 3) return null;
  const [ratioKey, styleKey, oriKey] = parts;
  const ratio = parseSpinRatio(ratioKey ?? "");
  if (!ratio) return null;

  const axis = buildTheoryAxis(ratio);
  const exact = axis.find((candidate) => theoryFlowerKey(candidate) === key);
  if (exact) return exact;

  if (!isSpinStyle(styleKey) || !isTheoryOri(oriKey)) return null;
  return (
    axis.find(
      (candidate) =>
        candidate.style === styleKey &&
        startsCoincide(ratio, candidate.ori, oriKey)
    ) ?? null
  );
}

export function theoryFlowerLabel(flower: TheoryFlower): string {
  const label = theoryRatioLabel(flower.ratio);
  if (isStationaryRatio(flower.ratio)) return `${label} stationary hand`;
  if (isFloatRatio(flower.ratio)) return `${label} float ${flower.ori}`;
  const style = flower.style === "pro" ? "prospin" : "antispin";
  return `${label} ${style} ${flower.ori} · ${flower.petals}p`;
}

/**
 * Whether two prop starts draw the same curve at this ratio.
 *
 * The tip is a hand circle plus a prop circle, so shifting time by δ carries
 * the hand δ eighths and the prop (P/Q)·δ. The hand only returns to its own
 * start every 8 eighths, so δ = 8k is the only shift a closed curve can
 * absorb, and such a shift moves the prop start by 8kP/Q. Solving
 * 8kP/Q ≡ Δφ (mod 8) for an integer k leaves one condition, and it is on the
 * hand-cycle count alone: Δφ·Q has to be a whole number of eighths.
 *
 * At 1:2 that makes `in` and `out` one flower entered half a period apart, and
 * the grid drew it as two identical tiles with the flipped variant nowhere on
 * the surface. It is a property of the field rather than a painter artefact:
 * every ratio with an even hand-cycle count loses a start this way, and one
 * whose count divides by four keeps only a single compass start.
 */
function startsCoincide(ratio: SpinRatio, a: TheoryOri, b: TheoryOri): boolean {
  return (Math.abs(ORI_PHASE[a] - ORI_PHASE[b]) * ratio.handCycles) % 8 === 0;
}

/**
 * The prop starts that actually differ, in the order the axis prefers them.
 *
 * `in` and `out` lead because they are the pair the Matrix axis uses, so every
 * odd-cycle ratio keeps exactly the axis it had. Where those two coincide the
 * quarter-turn starts still do not, and `clock` draws the flower flipped end
 * for end: the missing variant, not a fifth one.
 */
const START_PREFERENCE: readonly TheoryOri[] = [
  "in",
  "out",
  "clock",
  "counter",
];

function distinctStarts(ratio: SpinRatio, limit: number): TheoryOri[] {
  const starts: TheoryOri[] = [];
  for (const ori of START_PREFERENCE) {
    if (starts.length >= limit) break;
    if (starts.some((kept) => startsCoincide(ratio, kept, ori))) continue;
    starts.push(ori);
  }
  return starts;
}

/**
 * Two semantic starts keep every rotating ratio on the same four-entry axis.
 *
 * Some closed paths re-enter the same locus from several compass starts. Those
 * starts still describe different downbeat orientations, which matter when two
 * hands are played together. When geometry leaves only one distinct locus, the
 * second entry therefore preserves the familiar in/out pairing instead of
 * collapsing the matrix to 2×2.
 */
function gridStarts(ratio: SpinRatio): [TheoryOri, TheoryOri] {
  const starts = distinctStarts(ratio, 2);
  const [firstStart, secondStart] = starts;
  if (firstStart && secondStart) return [firstStart, secondStart];

  const first = firstStart ?? "in";
  const second = START_PREFERENCE.find((ori) => ori !== first) ?? "out";
  return [first, second];
}

/**
 * The variants one hand has at a ratio.
 *
 * Two spins, each with the starts that genuinely draw something different —
 * usually the same two-by-two the Matrix axis uses, prop pointing in or out.
 *
 * Copies are not padding, they are a lie the grid tells once per tile, so no
 * branch here emits one. A float prop never rotates, so pro and anti are the
 * same motion and the four DISTINCT starts are the four compass quarters —
 * the float axis the Matrix already builds. A stationary hand has no bearing
 * for the prop to be offset from, so 1:0 traces one circle and gets one row.
 * An even-cycle ratio is the third case: `startsCoincide` chooses the most
 * visually distinct starts available, while `gridStarts` keeps the four-entry
 * interaction contract when every compass start shares one locus.
 */
export function buildTheoryAxis(ratio: SpinRatio): TheoryFlower[] {
  const petalsFor = (style: SpinStyle) => spinRatioPetals(ratio, style);

  if (isStationaryRatio(ratio)) {
    return [{ ratio, style: "pro", ori: "out", petals: petalsFor("pro") }];
  }

  if (isFloatRatio(ratio)) {
    return (["in", "out", "clock", "counter"] as const).map((ori) => ({
      ratio,
      style: "pro" as const,
      ori,
      petals: petalsFor("pro"),
    }));
  }

  const starts = gridStarts(ratio);
  const variants: TheoryFlower[] = [];
  for (const style of ["pro", "anti"] as const) {
    for (const ori of starts) {
      variants.push({ ratio, style, ori, petals: petalsFor(style) });
    }
  }
  return variants;
}

/**
 * One hand's knobs in its own frame: home bearing, travelling clockwise.
 *
 * This is the hand's own shape and nothing else, which is exactly what a tile
 * draws. A Matrix tile is the blue hand's mandala against the red hand's, with
 * no pairing baked into either, and a Theory tile is that same picture at
 * ratios the Matrix's turn selector does not enumerate directly.
 */
export function theorySoloKnobs(flower: TheoryFlower): QftKnobs {
  const stationary = isStationaryRatio(flower.ratio);
  return {
    radius: stationary ? 0 : 1,
    downbeats: stationary
      ? flower.ratio.propRotations
      : flower.ratio.propRotations / flower.ratio.handCycles,
    ratio: flower.ratio,
    spin: flower.style === "pro" ? "inspin" : "antispin",
    phase: ORI_PHASE[flower.ori],
    handPhase: HAND_HOME,
    handDirection: 1,
  };
}

/**
 * QfT knobs for one hand of a pairing, which is what the animation runs.
 *
 * The left hand keeps its own frame; timing and direction are expressed
 * entirely as the right hand's offset and sign. That is a choice of frame, not
 * of physics — rotating both hands together would spin the whole picture
 * without changing a single relationship in it.
 *
 * `phase` has to move with `handPhase`, and it does not move by the same
 * amount. The model reads `hand = h·u + handPhase` and
 * `prop = s·u + handPhase + phase`, so shifting `handPhase` alone carries the
 * prop one eighth for every eighth it carries the hand — while a hand that is
 * genuinely δ steps ahead has already turned its prop `s·δ`. The two agree
 * only when `s` is `h`, which is a prop locked to its hand and nothing else.
 *
 * So the two pairings are transformed rather than merely offset:
 *
 * - Same Direction is the same motion δ = offset steps ahead, which leaves the
 *   prop needing the remaining `(s − 1)·offset` on top of its own start.
 * - Opposite Direction is the same motion run BACKWARDS from δ steps in:
 *   `hand(u) = left(δ − u)`, `prop(u) = leftProp(δ − u)`. The model already
 *   flips the prop's rate with the hand's sign, so the prop's own start needs
 *   exactly the same `(s − 1)·offset` the forward play needs.
 *
 * Both rules keep each hand on its tile's locus, which is the whole point:
 * timing and direction live between the hands, never in the shape. The
 * earlier reading of Opposite Direction as a MIRROR about the axis between
 * the hands only holds when the flower happens to be symmetric about that
 * axis — an integer-turn ratio at split time — and rotated every other
 * flower (2:3 in Fire turned the red hand's five petals into their gaps).
 *
 * A stationary hand has no clock to be ahead of, so its timing stays the plain
 * bearing offset it always was.
 */
export function theoryKnobs(
  flower: TheoryFlower,
  hand: "left" | "right",
  mode: VtgMode
): QftKnobs {
  const solo = theorySoloKnobs(flower);
  if (hand === "left") return solo;

  const offset = TIMING_OFFSET[mode.charAt(0)] ?? 0;
  const opposite = mode.charAt(1) === "O";
  const soloPhase = solo.phase ?? 0;
  const travelling = !isStationaryRatio(flower.ratio);

  return {
    ...solo,
    handPhase: HAND_HOME + offset,
    handDirection: opposite ? -1 : 1,
    phase: travelling
      ? soloPhase + (propRateForKnobs(solo) - 1) * offset
      : soloPhase,
  };
}

/** The stationary-hand endpoint, kept out of `buildBoundedSpinRatios`. */
export const STATIONARY_RATIO: SpinRatio = makeSpinRatio(1, 0);
