import { getBetaOffsetSize } from "#lib/shared/render/core/constants/prop-classification.js";

/**
 * A tunnel pictograph lays several performers on one grid. Each pair's own
 * beta offset only sees its own two props, so a staff of the front pair and
 * one of the back pair can land on the same spot and draw as one. Where that
 * happens they slide apart across the staff, the same distance a beta offset
 * uses: the performer further back (further north in the tunnel) toward the
 * top, the front performer toward the bottom. A staff lying straight up and
 * down has no top side, so there the one further back goes right.
 */

type Hand = "left" | "right";
const HANDS: readonly Hand[] = ["left", "right"];

export interface TunnelNudgeMotion {
  endLocation?: string | null;
  endOrientation?: string | null;
  propType?: string | null;
}

/** One performer's landing, front performer first. */
export interface TunnelNudgePair {
  motions?: Partial<Record<Hand, TunnelNudgeMotion | null | undefined>> | null;
  /** The prop drawn for each hand, when it differs from the stored one. */
  propTypes?: Partial<Record<Hand, string | undefined>>;
}

export type TunnelPropNudges = Partial<Record<Hand, { x: number; y: number }>>;

const LOCATION_VECTORS: Record<string, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
  ne: [Math.SQRT1_2, -Math.SQRT1_2],
  se: [Math.SQRT1_2, Math.SQRT1_2],
  sw: [-Math.SQRT1_2, Math.SQRT1_2],
  nw: [-Math.SQRT1_2, -Math.SQRT1_2],
};

/** "radial" lies along the line from the center, "nonradial" across it. */
function staffAxis(
  orientation: string | null | undefined
): "radial" | "nonradial" | null {
  const value = orientation?.toLowerCase();
  if (value === "in" || value === "out") return "radial";
  if (value === "clock" || value === "counter") return "nonradial";
  return null;
}

/** The unit direction the performer further back slides, across the staff. */
function backwardSide(
  location: readonly [number, number],
  axis: "radial" | "nonradial"
): [number, number] {
  const [x, y] = location;
  // Across a radial staff is the perpendicular; across a nonradial one is the radius.
  let side: [number, number] = axis === "radial" ? [-y, x] : [x, y];
  const flat = Math.abs(side[1]) < 1e-9;
  if (flat ? side[0] < 0 : side[1] > 0) side = [-side[0], -side[1]];
  return side;
}

/**
 * The nudge for each performer's props, in pictograph units, in the order the
 * pairs were given. A pair with nothing to move gets an empty record.
 */
export function tunnelPropNudges(
  pairs: readonly (TunnelNudgePair | null | undefined)[]
): TunnelPropNudges[] {
  const nudges: TunnelPropNudges[] = pairs.map(() => ({}));
  const groups = new Map<
    string,
    { performer: number; hand: Hand; propType: string }[]
  >();
  pairs.forEach((pair, performer) => {
    for (const hand of HANDS) {
      const motion = pair?.motions?.[hand];
      const location = motion?.endLocation?.toLowerCase();
      const axis = staffAxis(motion?.endOrientation);
      const propType = (
        pair?.propTypes?.[hand] ??
        motion?.propType ??
        "staff"
      ).toLowerCase();
      if (
        !location ||
        !LOCATION_VECTORS[location] ||
        !axis ||
        propType === "hand"
      )
        continue;
      const key = `${location}:${axis}`;
      const group = groups.get(key) ?? [];
      group.push({ performer, hand, propType });
      groups.set(key, group);
    }
  });
  for (const [key, group] of groups) {
    const performers = [...new Set(group.map((prop) => prop.performer))].sort(
      (a, b) => a - b
    );
    // One performer alone, or a pair already split by its own beta offset.
    if (performers.length < 2 || performers.length !== group.length) continue;
    const [location, axis] = key.split(":") as [string, "radial" | "nonradial"];
    const [sx, sy] = backwardSide(LOCATION_VECTORS[location]!, axis);
    const middle = (performers.length - 1) / 2;
    for (const prop of group) {
      const step = performers.indexOf(prop.performer) - middle;
      const distance = getBetaOffsetSize(prop.propType) * 2 * step;
      nudges[prop.performer]![prop.hand] = {
        x: sx * distance,
        y: sy * distance,
      };
    }
  }
  return nudges;
}
