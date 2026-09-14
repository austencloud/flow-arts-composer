import { IcosahedronGeometry, Vector3, type BufferGeometry } from "three";

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 97) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const corner = (dx: number, dy: number, dz: number) =>
    hash3(ix + dx, iy + dy, iz + dz, seed);
  const x00 = corner(0, 0, 0) + (corner(1, 0, 0) - corner(0, 0, 0)) * sx;
  const x10 = corner(0, 1, 0) + (corner(1, 1, 0) - corner(0, 1, 0)) * sx;
  const x01 = corner(0, 0, 1) + (corner(1, 0, 1) - corner(0, 0, 1)) * sx;
  const x11 = corner(0, 1, 1) + (corner(1, 1, 1) - corner(0, 1, 1)) * sx;
  const y0 = x00 + (x10 - x00) * sy;
  const y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz;
}

export interface EmberBoulderGeometryOptions {
  detail?: number;
  seed?: number;
  /** Radial displacement from the low-frequency lump field, as a fraction of radius. */
  lump?: number;
  /** Radial displacement from the high-frequency grit field. */
  grit?: number;
}

/**
 * A unit boulder for the instanced scatter. The near-field rubble and the
 * outer-field outcrops both rendered as `IcosahedronGeometry(1, 2)`, which is
 * a sphere to within a percent, and on a metre-scale outcrop in raking lava
 * light that read as a row of dropped balls. Every vertex is pushed along its
 * own radius by two octaves of lattice noise keyed on direction, so the
 * non-indexed icosahedron's shared corners displace identically and the shell
 * stays watertight under flat shading.
 */
export function createEmberBoulderGeometry({
  detail = 2,
  seed = 71,
  lump = 0.36,
  grit = 0.1,
}: EmberBoulderGeometryOptions = {}): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute("position");
  const point = new Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).normalize();
    const lumpField = valueNoise3(
      point.x * 1.7 + 11.3,
      point.y * 1.7 + 5.1,
      point.z * 1.7 + 2.9,
      seed
    );
    const gritField = valueNoise3(
      point.x * 5.3 + 31.7,
      point.y * 5.3 + 17.2,
      point.z * 5.3 + 9.4,
      seed + 1
    );
    const radius = 1 + (lumpField - 0.5) * 2 * lump + (gritField - 0.5) * 2 * grit;
    // Boulders sit on their broad face: flatten the underside so the seated
    // quarter of the mesh reads as bedded rather than balanced on a point.
    const squat = point.y < 0 ? 1 - 0.28 * -point.y : 1;
    position.setXYZ(
      index,
      point.x * radius,
      point.y * radius * squat,
      point.z * radius
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
