import { PlaneGeometry } from "three";

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function createPetalSurfaceGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1, 8, 8);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index) * 2;
    const cross = positions.getX(index) * 2 - 0.07 * y;
    const edgeRise =
      Math.sin((Math.PI / 2) * Math.min(1, Math.abs(cross) / 0.78)) ** 2;
    const cup = (cross < 0 ? 0.105 : 0.145) * edgeRise * (0.86 - 0.18 * y * y);
    const fold =
      -0.042 * Math.exp(-((cross / 0.31) ** 2)) * (0.9 - 0.2 * y * y);
    const tip =
      0.13 *
      smoothstep(0.04, 0.7, y) *
      (1 - 0.26 * smoothstep(0.78, 1, y)) *
      (1 - 0.16 * Math.abs(cross));
    positions.setZ(index, cup + fold + tip);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
