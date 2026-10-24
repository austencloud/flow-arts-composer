import { BufferAttribute, BufferGeometry, Bone, DetachedBindMode, Matrix4, Skeleton, SkinnedMesh, Triangle, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FingerAnimator } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator";

type SurfaceProbe = {
  invalidateSurface(): void;
  posedVertex(mesh: SkinnedMesh, vertex: number): Vector3;
  triangleStaffDistance(triangle: Triangle, cylinder: { a: Vector3; b: Vector3 }): number;
};

function weightedMesh(vertexCount: number, detached = false): { mesh: SkinnedMesh; bones: Bone[] } {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(vertexCount * 3);
  const morph = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    positions[offset] = (vertex % 32) * 0.001;
    positions[offset + 1] = Math.floor(vertex / 32) * 0.001;
    positions[offset + 2] = (vertex % 7) * 0.0005;
    morph[offset] = 0.001;
    morph[offset + 1] = -0.0004;
    morph[offset + 2] = 0.0007;
    for (let influence = 0; influence < 4; influence += 1) {
      indices[vertex * 4 + influence] = influence;
      weights[vertex * 4 + influence] = [0.4, 0.3, 0.2, 0.1][influence]!;
    }
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(weights, 4));
  geometry.morphAttributes.position = [new BufferAttribute(morph, 3)];
  geometry.morphTargetsRelative = !detached;
  const bones = [0, 1, 2, 3].map(() => new Bone());
  bones[0]!.position.set(0.02, 0.03, 0);
  for (let index = 1; index < bones.length; index += 1) {
    bones[index - 1]!.add(bones[index]!);
    bones[index]!.position.set(0, 0.012, 0.001);
  }
  const mesh = new SkinnedMesh(geometry);
  if (detached) mesh.bindMode = DetachedBindMode;
  mesh.position.set(0.3, -0.2, 0.1);
  mesh.scale.set(1.2, 0.9, 1.1);
  mesh.add(bones[0]!);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones), new Matrix4().copy(mesh.matrixWorld));
  mesh.morphTargetInfluences![0] = 0.37;
  return { mesh, bones };
}

function originalTriangleDistance(triangle: Triangle, a: Vector3, b: Vector3): number {
  const axis = b.clone().sub(a);
  const length = axis.length();
  if (length > 1e-10) {
    const direction = axis.multiplyScalar(1 / length);
    const normal = triangle.getNormal(new Vector3());
    const denom = normal.dot(direction);
    if (Math.abs(denom) > 1e-12) {
      const distance = normal.dot(triangle.a.clone().sub(a)) / denom;
      if (distance >= 0 && distance <= length && triangle.containsPoint(a.clone().addScaledVector(direction, distance))) return 0;
    }
  }
  const closest = new Vector3();
  let distanceSq = Math.min(
    triangle.closestPointToPoint(a, closest).distanceToSquared(a),
    triangle.closestPointToPoint(b, closest).distanceToSquared(b)
  );
  const edgeDistance = (c: Vector3, d: Vector3) => {
    const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c);
    const uu = u.dot(u), uv = u.dot(v), vv = v.dot(v), uw = u.dot(w), vw = v.dot(w);
    const denominator = uu * vv - uv * uv;
    let s = denominator > 1e-12 ? (uv * vw - vv * uw) / denominator : 0;
    s = Math.max(0, Math.min(1, s));
    let t = vv > 1e-12 ? (uv * s + vw) / vv : 0;
    t = Math.max(0, Math.min(1, t));
    if (uu > 1e-12) s = Math.max(0, Math.min(1, (uv * t - uw) / uu));
    return a.clone().addScaledVector(u, s).distanceToSquared(c.clone().addScaledVector(v, t));
  };
  for (const [c, d] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]] as const)
    distanceSq = Math.min(distanceSq, edgeDistance(c, d));
  return Math.sqrt(distanceSq);
}

describe("finger surface reuse", () => {
  it("matches Three skinning exactly across changed poses, scale, and morph targets", () => {
    const animator = new FingerAnimator() as unknown as SurfaceProbe;
    for (const detached of [false, true]) {
      const { mesh, bones } = weightedMesh(128, detached);
      for (let pose = 0; pose < 5; pose += 1) {
        bones[1]!.rotation.z = pose * 0.11;
        bones[2]!.rotation.x = pose * -0.09;
        mesh.morphTargetInfluences![0] = pose * 0.17;
        mesh.scale.x = 1.2 + pose * 0.03;
        mesh.updateMatrixWorld(true);
        animator.invalidateSurface();
        for (let vertex = 0; vertex < 128; vertex += 1) {
          const expected = mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld);
          expect(animator.posedVertex(mesh, vertex).toArray()).toEqual(expected.toArray());
        }
      }
    }
  });

  it("matches the original triangle distance at intersections and separated edges", () => {
    const animator = new FingerAnimator() as unknown as SurfaceProbe;
    for (let index = 0; index < 100; index += 1) {
      const shift = index * 0.00031;
      const triangle = new Triangle(
        new Vector3(-0.02 + shift, -0.01, 0),
        new Vector3(0.02 + shift, -0.01, 0.003),
        new Vector3(0.001 + shift, 0.023, -0.002)
      );
      const a = new Vector3(0.002, -0.02, -0.025 + index * 0.0003);
      const b = new Vector3(0.002, 0.02, 0.025 + index * 0.0003);
      expect(animator.triangleStaffDistance(triangle, { a, b })).toBe(originalTriangleDistance(triangle, a, b));
    }
  });

  it("records the cost of a full candidate vertex pass", () => {
    const { mesh, bones } = weightedMesh(1024);
    const animator = new FingerAnimator() as unknown as SurfaceProbe;
    const oldPoint = new Vector3();
    const passes = 30;
    const run = (cached: boolean) => {
      const start = performance.now();
      let checksum = 0;
      for (let pass = 0; pass < passes; pass += 1) {
        bones[1]!.rotation.z = pass * 0.007;
        mesh.updateMatrixWorld(true);
        animator.invalidateSurface();
        for (let vertex = 0; vertex < 1024; vertex += 1)
          checksum += cached
            ? animator.posedVertex(mesh, vertex).x
            : mesh.getVertexPosition(vertex, oldPoint).applyMatrix4(mesh.matrixWorld).x;
      }
      return { ms: performance.now() - start, checksum };
    };
    run(false);
    run(true);
    const old = run(false);
    const current = run(true);
    expect(current.checksum).toBeCloseTo(old.checksum, 12);
    console.info(`finger vertex pass: Three ${old.ms.toFixed(1)} ms, cached ${current.ms.toFixed(1)} ms, ratio ${(old.ms / current.ms).toFixed(2)}x`);
  });

  it("records triangle distance cost without changing the result", () => {
    const animator = new FingerAnimator() as unknown as SurfaceProbe;
    const triangles = Array.from({ length: 256 }, (_, index) => new Triangle(
      new Vector3(index * 0.0001, -0.012, -0.005),
      new Vector3(index * 0.0001 + 0.008, 0.003, 0.002),
      new Vector3(index * 0.0001 - 0.002, 0.011, 0.004)
    ));
    const a = new Vector3(0.018, -0.03, -0.01);
    const b = new Vector3(0.018, 0.03, 0.01);
    const run = (scratch: boolean) => {
      const start = performance.now();
      let sum = 0;
      for (let pass = 0; pass < 50; pass += 1)
        for (const triangle of triangles)
          sum += scratch
            ? animator.triangleStaffDistance(triangle, { a, b })
            : originalTriangleDistance(triangle, a, b);
      return { ms: performance.now() - start, sum };
    };
    run(false);
    run(true);
    const original = run(false);
    const current = run(true);
    expect(current.sum).toBe(original.sum);
    console.info(`finger triangle distance: original ${original.ms.toFixed(1)} ms, scratch ${current.ms.toFixed(1)} ms, ratio ${(original.ms / current.ms).toFixed(2)}x`);
  });
});
