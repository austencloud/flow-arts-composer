import {
  JOIN_HAND_RADIUS,
  JOIN_GRID_LOCATIONS,
  joinedPointColors,
  joinedPointKey,
  planJoinedGridPoints,
  type GridJoinSpec,
} from "@tka/render-core";

/** Point ownership and tint use the same plan as cards and 2D playback. */
export function joinedGridPointColors3D(
  join: GridJoinSpec,
  gridMode: "diamond" | "box",
  handRadius: number,
  outerRadius: number,
  handColors: Readonly<Record<"left" | "right", string>>
): Record<"left" | "right", ReadonlyMap<string, string>> {
  // The planner's merge tolerances are in card units, not world meters.
  const { points } = planJoinedGridPoints(join, JOIN_GRID_LOCATIONS[gridMode], {
    handRadius: JOIN_HAND_RADIUS,
    outerRadius: (outerRadius / handRadius) * JOIN_HAND_RADIUS,
  });
  const colors = joinedPointColors(points, "#ffffff", handColors);
  const result = {
    left: new Map<string, string>(),
    right: new Map<string, string>(),
  };
  points.forEach((point, index) => {
    const owner = point.members[0]!;
    result[owner.hand].set(
      joinedPointKey(point.kind, owner.location),
      colors[index]!
    );
  });
  return result;
}
