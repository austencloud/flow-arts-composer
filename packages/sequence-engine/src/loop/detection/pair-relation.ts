/**
 * Pair-relation algebra for LOOP detection — the single canonical way to
 * recover transformation components from a step pair.
 *
 * Domain grounding (Flow Arts Knowledge MCP, "LOOP System and Compositional
 * Theory"): the LOOP algebra operates on a reduced space of grid positions
 * (where hands are), motion types (pro/anti/static/dash/float), and hand
 * identity (left/right). Letters, turns, and orientations do NOT determine the
 * LOOP classification. Per transform:
 *
 *   ROTATED   moves locations (90°/180°), keeps motionType + hand identity
 *   MIRRORED  reflects locations; legacy default is the N-S axis
 *   FLIPPED   legacy alias for E-W reflection
 *   SWAPPED   exchanges hand identity, keeps locations-as-a-set + motionType
 *   INVERTED  flips PRO ↔ ANTI, does not move locations
 *   REWOUND   plays the first half backward (temporal, checked separately)
 *
 * The aliasing bug family this module eliminates (2026-07-03 audit): the old
 * detectors read motionType on the SAME-COLOR axis in isolation. Under swap
 * the hands are exchanged, so with opposite-typed hands (pro/anti) a swap
 * looks exactly like an inversion on that axis, swap∘invert cancels to
 * nothing, and composites mis-resolve. The fix is structural: first find the
 * (location transform × hand correspondence) hypothesis that maps pair member
 * A onto pair member B, then read inversion as a pro↔anti flip ALONG THAT
 * CORRESPONDENCE. One signal per question:
 *
 *   hand correspondence  ← which hand owns each location path
 *   position component   ← the location map that aligns the paths
 *   inverted             ← motionType flip along the matched correspondence
 */

import {
  REFLECTION_LOCATION_MAPS,
  type ReflectionAxis,
} from "../position-maps/strict-loop-position-maps.js";

const ROTATE_180: Record<string, string> = {
  n: "s", s: "n", e: "w", w: "e",
  ne: "sw", sw: "ne", nw: "se", se: "nw",
};

const ROTATE_90_CW: Record<string, string> = {
  n: "e", e: "s", s: "w", w: "n",
  ne: "se", se: "sw", sw: "nw", nw: "ne",
};

const ROTATE_90_CCW: Record<string, string> = {
  n: "w", w: "s", s: "e", e: "n",
  ne: "nw", nw: "sw", sw: "se", se: "ne",
};

const IDENTITY: Record<string, string> = {
  n: "n", s: "s", e: "e", w: "w",
  ne: "ne", se: "se", sw: "sw", nw: "nw",
};

export type PairComponentId =
  | "rotated"
  | "mirrored"
  | "flipped"
  | "swapped"
  | "inverted"
  | "repeated";

export type RotationAngle = "180" | "90cw" | "90ccw";

/** Minimal per-hand motion view the algebra needs. */
export interface PairMotion {
  startLocation: string;
  endLocation: string;
  motionType: string;
}

export interface PairMotions {
  left: PairMotion;
  right: PairMotion;
}

export interface PairRelation {
  /** Sorted primitive ids, e.g. ["mirrored","swapped"]. Empty = repeated. */
  components: readonly PairComponentId[];
  /** Canonical key for unanimity matching, e.g. "rot180|swapped|inverted". */
  key: string;
  /** Present when the location transform is a rotation. */
  rotation?: RotationAngle;
  /** Present when the location transform is a reflection. */
  reflectionAxis?: ReflectionAxis;
  /** Complexity rank — lower explains the pair with fewer moving parts. */
  priority: number;
}

interface LocationTransform {
  id: string;
  map: Readonly<Record<string, string>>;
  components: PairComponentId[];
  rotation?: RotationAngle;
  reflectionAxis?: ReflectionAxis;
}

const LOCATION_TRANSFORMS: LocationTransform[] = [
  { id: "identity", map: IDENTITY, components: [] },
  { id: "rot180", map: ROTATE_180, components: ["rotated"], rotation: "180" },
  { id: "rot90cw", map: ROTATE_90_CW, components: ["rotated"], rotation: "90cw" },
  { id: "rot90ccw", map: ROTATE_90_CCW, components: ["rotated"], rotation: "90ccw" },
  {
    id: "reflect-north-south",
    map: REFLECTION_LOCATION_MAPS["north-south"],
    components: ["mirrored"],
    reflectionAxis: "north-south",
  },
  {
    id: "reflect-east-west",
    map: REFLECTION_LOCATION_MAPS["east-west"],
    components: ["flipped"],
    reflectionAxis: "east-west",
  },
  {
    id: "reflect-northeast-southwest",
    map: REFLECTION_LOCATION_MAPS["northeast-southwest"],
    components: ["mirrored"],
    reflectionAxis: "northeast-southwest",
  },
  {
    id: "reflect-northwest-southeast",
    map: REFLECTION_LOCATION_MAPS["northwest-southeast"],
    components: ["mirrored"],
    reflectionAxis: "northwest-southeast",
  },
];

type MotionAxis = "same" | "flipped" | "neutral" | "mismatch";

const PRO_ANTI = new Set(["pro", "anti"]);

/**
 * Compare motion types along a correspondence.
 * - pro/anti vs pro/anti: same type → "same", opposite → "flipped"
 * - static/dash/float vs itself → "neutral" (invert leaves them unchanged,
 *   so they carry no pro/anti signal either way)
 * - anything else → "mismatch" (no transform in the algebra maps a pro/anti
 *   motion onto a static/dash/float or across those families)
 */
function motionAxis(t1: string, t2: string): MotionAxis {
  const a = t1?.toLowerCase?.() ?? "";
  const b = t2?.toLowerCase?.() ?? "";
  const aPA = PRO_ANTI.has(a);
  const bPA = PRO_ANTI.has(b);
  if (aPA && bPA) return a === b ? "same" : "flipped";
  if (!aPA && !bPA && a === b) return "neutral";
  return "mismatch";
}

function locationsMatch(
  map: Readonly<Record<string, string>>,
  source: PairMotion,
  target: PairMotion,
): boolean {
  return (
    map[source.startLocation] === target.startLocation &&
    map[source.endLocation] === target.endLocation
  );
}

/**
 * All (location transform × hand correspondence × inversion) hypotheses that
 * exactly explain how pair member `a` maps onto pair member `b`.
 */
export function relationsForPair(a: PairMotions, b: PairMotions): PairRelation[] {
  const relations: PairRelation[] = [];
  if (
    !a?.left?.startLocation || !a?.right?.startLocation ||
    !b?.left?.startLocation || !b?.right?.startLocation
  ) {
    return relations;
  }

  for (const swapped of [false, true]) {
    // The hand each of b's colors corresponds to in a.
    const leftSource = swapped ? a.right : a.left;
    const rightSource = swapped ? a.left : a.right;

    for (const t of LOCATION_TRANSFORMS) {
      if (
        !locationsMatch(t.map, leftSource, b.left) ||
        !locationsMatch(t.map, rightSource, b.right)
      ) {
        continue;
      }

      // Location hypothesis holds — read inversion along this correspondence.
      const leftAxis = motionAxis(leftSource.motionType, b.left.motionType);
      const rightAxis = motionAxis(rightSource.motionType, b.right.motionType);
      if (leftAxis === "mismatch" || rightAxis === "mismatch") continue;
      const axes = [leftAxis, rightAxis];
      const hasFlip = axes.includes("flipped");
      const hasSame = axes.includes("same");
      // Mixed flip+same is neither the transform nor its inversion.
      if (hasFlip && hasSame) continue;

      // Which inversion variants does this pair support?
      //   flipped present          → inverted only
      //   a pro/anti stayed same   → plain only (contradicts inversion)
      //   ALL neutral (static/dash/float only) → BOTH: invert leaves those
      //     motion types unchanged, so the pair carries no pro/anti signal
      //     and is genuinely consistent with either reading. Emitting both
      //     lets unanimity resolve the ambiguity from the pairs that DO
      //     carry signal. (A loop where every pair is neutral resolves to
      //     plain via the priority sort — inversion is never claimed without
      //     at least one genuine flip somewhere.)
      const variants: boolean[] = hasFlip ? [true] : hasSame ? [false] : [false, true];

      for (const inverted of variants) {
        const components: PairComponentId[] = [...t.components];
        if (swapped) components.push("swapped");
        if (inverted) components.push("inverted");
        components.sort();

        relations.push({
          components,
          key: `${t.id}|${swapped ? "swapped" : "same"}|${inverted ? "inverted" : "plain"}`,
          rotation: t.rotation,
          reflectionAxis: t.reflectionAxis,
          priority: components.length,
        });
      }
    }
  }

  return relations;
}

export interface UniformRelation {
  /** Sorted primitive ids; empty array means the halves literally repeat. */
  components: readonly PairComponentId[];
  rotation?: RotationAngle;
  reflectionAxis?: ReflectionAxis;
}

/**
 * The simplest relation that UNANIMOUSLY explains every step pair at the
 * given interval. Pairs are (i, i+interval); `wrap` additionally closes the
 * cycle (used for quartered rotation scans).
 */
export function uniformRelationAtInterval(
  steps: readonly PairMotions[],
  interval: number,
  opts: { wrap?: boolean } = {},
): UniformRelation | null {
  const n = steps.length;
  if (interval <= 0 || interval >= n) return null;

  const pairRelations: PairRelation[][] = [];
  if (opts.wrap) {
    for (let i = 0; i < n; i++) {
      pairRelations.push(relationsForPair(steps[i]!, steps[(i + interval) % n]!));
    }
  } else {
    for (let i = 0; i + interval < n; i++) {
      pairRelations.push(relationsForPair(steps[i]!, steps[i + interval]!));
    }
  }
  if (pairRelations.length === 0) return null;

  // Unanimity: a relation key present in every pair.
  const first = pairRelations[0]!;
  const candidates = first.filter((r) =>
    pairRelations.every((rels) => rels.some((x) => x.key === r.key)),
  );
  if (candidates.length === 0) return null;

  // Simplest explanation wins; among equals prefer no-invert, then no-swap
  // (a positional reading over a semantic flip).
  candidates.sort((x, y) => {
    if (x.priority !== y.priority) return x.priority - y.priority;
    const xi = x.components.includes("inverted") ? 1 : 0;
    const yi = y.components.includes("inverted") ? 1 : 0;
    if (xi !== yi) return xi - yi;
    const xs = x.components.includes("swapped") ? 1 : 0;
    const ys = y.components.includes("swapped") ? 1 : 0;
    return xs - ys;
  });

  const best = candidates[0]!;
  return {
    components: best.components,
    rotation: best.rotation,
    reflectionAxis: best.reflectionAxis,
  };
}

/**
 * The halved-interval uniform relation: pairs (i, i+half) for i < half.
 */
export function uniformHalvedRelation(
  steps: readonly PairMotions[],
): UniformRelation | null {
  const n = steps.length;
  if (n < 2 || n % 2 !== 0) return null;
  return uniformRelationAtInterval(steps, n / 2);
}

/**
 * REWOUND: the second half plays the first half backward. Step i corresponds
 * to step n-1-i with start/end locations exchanged and motionType preserved
 * (reversing a motion in time reverses both hand path and prop rotation, so
 * the pro/anti relationship is unchanged).
 */
export function detectRewoundPattern(steps: readonly PairMotions[]): boolean {
  const n = steps.length;
  if (n < 2 || n % 2 !== 0) return false;

  for (let i = 0; i < n / 2; i++) {
    const fwd = steps[i]!;
    const rev = steps[n - 1 - i]!;
    for (const hand of ["left", "right"] as const) {
      const f = fwd[hand];
      const r = rev[hand];
      if (!f?.startLocation || !r?.startLocation) return false;
      if (
        f.startLocation !== r.endLocation ||
        f.endLocation !== r.startLocation ||
        (f.motionType ?? "").toLowerCase() !== (r.motionType ?? "").toLowerCase()
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Multi-point inner-rotation scan: does a uniform 180° rotation relate steps
 * one quarter apart WITHIN the first half? This is the nested structure the
 * generator produces for mirrored_rotated-family loops (rotation doubles the
 * seed, then the reflection doubles the rotated pair), where the halved
 * relation alone only shows the outer reflection.
 */
export function detectsInnerRotation(steps: readonly PairMotions[]): boolean {
  const n = steps.length;
  if (n < 8 || n % 4 !== 0) return false;
  const quarter = n / 4;
  const firstHalf = steps.slice(0, n / 2);
  const rel = uniformRelationAtInterval(firstHalf, quarter);
  return (
    rel !== null &&
    rel.components.length === 1 &&
    rel.components[0] === "rotated"
  );
}

// The two location tables that are not reflections, exported for the
// per-step hand relationship constraint so it does not keep its own copy.
export { IDENTITY as IDENTITY_LOCATION_MAP, ROTATE_180 as ROTATE_180_LOCATION_MAP };
