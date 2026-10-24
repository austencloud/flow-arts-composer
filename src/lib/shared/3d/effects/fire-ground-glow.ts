import {
  AdditiveBlending,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
} from "three";

/**
 * The light a fire throws on the ground round it: an additive disk, bright at
 * the centre and gone by its edge. Paired with a few real point lights, this
 * is how a fire still reads on the ground where those lights fall short.
 *
 * Copied from the Flow Fest jam (flow-fest-jam-people.ts, buildFireGroundGlow)
 * so other scenes can use it without importing the jam. Each instance is a
 * unit disk; scale its matrix by the radius.
 */
export function buildFireGroundGlow(
  capacity: number,
  name = "FireGroundGlow"
): {
  mesh: InstancedMesh;
  matrix: Matrix4;
} {
  // Rings rather than a fan, so the falloff curve survives interpolation.
  const geometry = new RingGeometry(0.0001, 1, 28, 8);
  geometry.rotateX(-Math.PI / 2);
  // Radial falloff baked into vertex colour: white at the centre, black at the rim.
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getZ(i));
    const v = Math.pow(Math.max(0, 1 - r), 2.2);
    colours.set([v, v, v], i * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  const material = new MeshBasicMaterial({
    color: new Color(1.0, 0.45, 0.14),
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, capacity));
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, matrix: new Matrix4() };
}
