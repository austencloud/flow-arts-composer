import { TRIANGLE_STATIONS_M } from "#lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.js";

export type ManufacturedLedShapeKind = "triquetra" | "triquetra2" | "triangle";
export type ManufacturedTriangleGrip = "corner" | "side";
export interface ShapePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const TRIQUETRA_LED_COUNT = 60;
export const TRIANGLE_LED_COUNT = 48;
const TRIQUETRA_SCALE_M = (0.5842 - 0.028) / 5.47132;

export function manufacturedShapeLedCount(
  kind: ManufacturedLedShapeKind
): number {
  return kind === "triangle" ? TRIANGLE_LED_COUNT : TRIQUETRA_LED_COUNT;
}

export function manufacturedTriangleVertices(
  grip: ManufacturedTriangleGrip
): readonly ShapePoint[] {
  const { sideChord, sagitta, height } = TRIANGLE_STATIONS_M;
  return grip === "side"
    ? [
        { x: -sideChord / 2, y: sagitta, z: 0 },
        { x: sideChord / 2, y: sagitta, z: 0 },
        { x: 0, y: sagitta + height, z: 0 },
      ]
    : [
        { x: 0, y: 0, z: 0 },
        { x: sideChord / 2, y: height, z: 0 },
        { x: -sideChord / 2, y: height, z: 0 },
      ];
}

// The station table owns the bowed sides and the hand pivot. This is the
// same circle construction as scripts/hoop-family-math.mjs, in +Y prop space.
function trianglePath(grip: ManufacturedTriangleGrip): readonly ShapePoint[] {
  const vertices = manufacturedTriangleVertices(grip);
  const centroid = {
    x: vertices.reduce((sum, point) => sum + point.x, 0) / 3,
    y: vertices.reduce((sum, point) => sum + point.y, 0) / 3,
  };
  const { bowRadius, sagitta, arcAngle } = TRIANGLE_STATIONS_M;
  return vertices.flatMap((point, index) => {
    const next = vertices[(index + 1) % 3]!;
    const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    const nx = mid.x - centroid.x;
    const ny = mid.y - centroid.y;
    const length = Math.hypot(nx, ny);
    const cx = mid.x - (nx / length) * (bowRadius - sagitta);
    const cy = mid.y - (ny / length) * (bowRadius - sagitta);
    const start = Math.atan2(ny, nx) - arcAngle / 2;
    return Array.from({ length: 96 }, (_, sample) => {
      const angle = start + (arcAngle * sample) / 96;
      return {
        x: cx + bowRadius * Math.cos(angle),
        y: cy + bowRadius * Math.sin(angle),
        z: 0,
      };
    });
  });
}

function triquetraPath(
  kind: "triquetra" | "triquetra2"
): readonly ShapePoint[] {
  return Array.from({ length: 120 }, (_, index) => {
    const angle = (2 * Math.PI * index) / 120;
    const x = TRIQUETRA_SCALE_M * (Math.sin(angle) + 2 * Math.sin(2 * angle));
    const y = TRIQUETRA_SCALE_M * (-Math.cos(angle) + 2 * Math.cos(2 * angle));
    const z = 0.0065 * Math.sin(3 * angle);
    // Preserve today's armpit/tip grip identities. The manufactured knot has
    // a fixed physical size; it does not replace the staff-scaled day plate.
    return kind === "triquetra2"
      ? { x: -x, y: 3 * TRIQUETRA_SCALE_M - y, z }
      : { x, y: y + 1.5 * TRIQUETRA_SCALE_M, z };
  });
}

function resamplePath(
  path: readonly ShapePoint[],
  count: number
): readonly ShapePoint[] {
  const cumulative = [0];
  for (let index = 0; index < path.length; index++) {
    const point = path[index]!;
    const next = path[(index + 1) % path.length]!;
    cumulative.push(
      cumulative[index]! +
        Math.hypot(next.x - point.x, next.y - point.y, next.z - point.z)
    );
  }
  const total = cumulative[cumulative.length - 1]!;
  return Array.from({ length: count }, (_, index) => {
    const target = (total * index) / count;
    let left = 0;
    while (cumulative[left + 1]! < target) left++;
    const a = path[left]!;
    const b = path[(left + 1) % path.length]!;
    const amount =
      (target - cumulative[left]!) /
      (cumulative[left + 1]! - cumulative[left]!);
    return {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
      z: a.z + (b.z - a.z) * amount,
    };
  });
}

export function manufacturedShapeLedPoints(
  kind: ManufacturedLedShapeKind,
  grip: ManufacturedTriangleGrip = "corner"
): readonly ShapePoint[] {
  return resamplePath(
    kind === "triangle" ? trianglePath(grip) : triquetraPath(kind),
    manufacturedShapeLedCount(kind)
  );
}
