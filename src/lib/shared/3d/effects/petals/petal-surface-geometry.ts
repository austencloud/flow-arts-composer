import { PlaneGeometry } from "three";

export function createPetalSurfaceGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1, 4, 4);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const cup = 0.065 * (x * 2) ** 2 * (1 - 0.3 * (y * 2) ** 2);
    const tip = 0.065 * Math.max(0, y * 2 - 0.2) ** 2;
    positions.setZ(index, cup + tip);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
