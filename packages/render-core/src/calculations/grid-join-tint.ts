/**
 * Joined-grid tint: on two joined grids, each grid's dots lean toward its
 * hand's color so a reader can see which grid a point belongs to. A point the
 * two grids share leans toward both colors mixed.
 *
 * Every joined painter (the 2D animation, the app's card canvas, the MCP's SVG
 * renderers) colors its dots through `joinedPointColors`, so the three agree.
 */
import type { JoinedGridPoint } from "./grid-join-layout.js";

type Hand = "left" | "right";

/** Share of the hand color mixed into a joined grid's dot color. */
export const JOINED_GRID_TINT = 0.45;

/** Two points closer than this are at one spot. */
const SAME_SPOT = 1;

/**
 * The grids each planned point belongs to: one hand's, or "both" when the two
 * grids share the spot. A spot is shared when the point merges both grids'
 * points, or when the other grid has a point of another kind there (one step
 * apart, each grid's center sits on the other's hand point).
 */
export function joinedPointsHands(
  points: readonly JoinedGridPoint[]
): (Hand | "both")[] {
  return points.map((point) => {
    const hands = new Set<Hand>(point.members.map((member) => member.hand));
    for (const other of points) {
      if (Math.hypot(other.x - point.x, other.y - point.y) >= SAME_SPOT) {
        continue;
      }
      for (const member of other.members) hands.add(member.hand);
    }
    if (hands.size > 1) return "both";
    return point.members[0]?.hand ?? "left";
  });
}

function parseHexColor(color: string): [number, number, number] | null {
  let hex = color.trim().replace(/^#/, "");
  if (hex.length === 3) hex = [...hex].map((digit) => digit + digit).join("");
  if (!/^[0-9a-fA-F]{6}/.test(hex)) return null;
  return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toHexColor(channels: readonly number[]): string {
  return `#${channels
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

/**
 * `from` moved `amount` (0-1) of the way to `to`, channel by channel. A color
 * that is not a 3- or 6-digit hex leaves `from` unchanged.
 */
export function mixHexColors(from: string, to: string, amount: number): string {
  const a = parseHexColor(from);
  const b = parseHexColor(to);
  if (!a || !b) return from;
  return toHexColor(
    a.map((channel, index) => channel + (b[index]! - channel) * amount)
  );
}

/**
 * The colors to draw a joined layout's points with, in the same order: the
 * painter's usual dot color (`base`) leaning `tint` of the way toward the
 * point's hand color, or toward the two hand colors mixed half and half where
 * the grids share the spot.
 */
export function joinedPointColors(
  points: readonly JoinedGridPoint[],
  base: string,
  handColors: Readonly<Record<Hand, string>>,
  tint: number = JOINED_GRID_TINT
): string[] {
  const shared = mixHexColors(handColors.left, handColors.right, 0.5);
  return joinedPointsHands(points).map((hands) =>
    mixHexColors(base, hands === "both" ? shared : handColors[hands], tint)
  );
}
