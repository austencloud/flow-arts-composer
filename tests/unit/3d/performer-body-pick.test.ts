import { describe, expect, it } from "vitest";
import {
  Bone,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";
import {
  BODY_PICK_SEGMENT_STRIDE,
  createLiveBodyPick,
  fitBodyPickCapsules,
  raycastBodyPickSegments,
  writeBodyPickSegments,
} from "#lib/shared/3d/domain/performer-body-pick.js";

const ORIGIN_FRONT = { x: 0, y: 0, z: 5 };
const TOWARD_ORIGIN = { x: 0, y: 0, z: -1 };

function segmentsOf(
  ...capsules: [number, number, number, number, number, number, number][]
): Float32Array {
  return new Float32Array(capsules.flat());
}

describe("raycastBodyPickSegments", () => {
  // A vertical capsule: axis (0,0,0)-(0,1,0), radius 0.2.
  const upright = segmentsOf([0, 0, 0, 0, 1, 0, 0.2]);

  it("hits the side of the cylinder part and reports the distance", () => {
    const hit = raycastBodyPickSegments(
      { x: 0, y: 0.5, z: 5 },
      TOWARD_ORIGIN,
      upright
    );
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(4.8, 5);
    expect(hit!.point.z).toBeCloseTo(0.2, 5);
    expect(hit!.point.y).toBeCloseTo(0.5, 5);
  });

  it("hits the round cap above the axis end but not beyond it", () => {
    const cap = raycastBodyPickSegments(
      { x: 0, y: 1.1, z: 5 },
      TOWARD_ORIGIN,
      upright
    );
    expect(cap).not.toBeNull();
    expect(cap!.point.y).toBeCloseTo(1.1, 5);
    expect(
      raycastBodyPickSegments({ x: 0, y: 1.25, z: 5 }, TOWARD_ORIGIN, upright)
    ).toBeNull();
  });

  it("misses beside the capsule", () => {
    expect(
      raycastBodyPickSegments({ x: 0.3, y: 0.5, z: 5 }, TOWARD_ORIGIN, upright)
    ).toBeNull();
  });

  it("hits a ray running parallel to the axis through the end cap", () => {
    const hit = raycastBodyPickSegments(
      { x: 0, y: 5, z: 0 },
      { x: 0, y: -1, z: 0 },
      upright
    );
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(3.8, 5);
  });

  it("ignores a capsule behind the ray origin", () => {
    expect(
      raycastBodyPickSegments({ x: 0, y: 0.5, z: -5 }, TOWARD_ORIGIN, upright)
    ).toBeNull();
  });

  it("treats a zero-length segment as a sphere", () => {
    const sphere = segmentsOf([0, 0, 0, 0, 0, 0, 0.3]);
    const hit = raycastBodyPickSegments(ORIGIN_FRONT, TOWARD_ORIGIN, sphere);
    expect(hit!.distance).toBeCloseTo(4.7, 5);
  });

  it("returns the nearest of several capsules", () => {
    const two = segmentsOf([0, 0, -2, 0, 1, -2, 0.2], [0, 0, 0, 0, 1, 0, 0.2]);
    const hit = raycastBodyPickSegments(
      { x: 0, y: 0.5, z: 5 },
      TOWARD_ORIGIN,
      two
    );
    expect(hit!.distance).toBeCloseTo(4.8, 5);
  });
});

/**
 * Two bones stacked along +Y: `root` at the origin owns the lower half of a
 * 2-unit cylinder, `upper` (child of root, at y = 1) owns the upper half. An
 * optional `tip` bone (child of upper) owns the last few vertices.
 */
function buildTwoBoneCylinder(options: { withTip?: boolean } = {}) {
  const geometry = new CylinderGeometry(0.2, 0.2, 2, 16, 20, false);
  geometry.translate(0, 1, 0);
  const position = geometry.getAttribute("position");
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const tipRows: number[] = [];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const y = position.getY(vertex);
    let bone = y < 0.999 ? 0 : 1;
    if (options.withTip && y > 1.99 && tipRows.length < 3) {
      tipRows.push(vertex);
      bone = 2;
    }
    skinIndex.push(bone, 0, 0, 0);
    skinWeight.push(1, 0, 0, 0);
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(skinWeight, 4)
  );

  const root = new Bone();
  const upper = new Bone();
  upper.position.set(0, 1, 0);
  root.add(upper);
  const bones = [root, upper];
  if (options.withTip) {
    const tip = new Bone();
    tip.position.set(0, 1, 0);
    upper.add(tip);
    bones.push(tip);
  }

  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  const group = new Group();
  group.add(root, mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  return { group, mesh, root, upper, bones };
}

describe("fitBodyPickCapsules", () => {
  it("fits one capsule per major bone with about the right size", () => {
    const { group, root, upper } = buildTwoBoneCylinder();
    const fit = fitBodyPickCapsules(group);
    expect(fit.capsules).toHaveLength(2);
    const owners = fit.capsules.map((capsule) => capsule.bone);
    expect(owners).toContain(root);
    expect(owners).toContain(upper);
    for (const capsule of fit.capsules) {
      expect(capsule.radius).toBeGreaterThan(0.2);
      expect(capsule.radius).toBeLessThan(0.23);
      // The round caps are included in the covered length: about half the
      // cylinder, which is one unit.
      const covered = capsule.a.distanceTo(capsule.b) + 2 * capsule.radius;
      expect(covered).toBeGreaterThan(0.8);
      expect(covered).toBeLessThan(1.1);
    }
  });

  it("writes world segments that follow a rotated bone", () => {
    const { group, upper } = buildTwoBoneCylinder();
    const fit = fitBodyPickCapsules(group);
    const out = new Float32Array(
      fit.capsules.length * BODY_PICK_SEGMENT_STRIDE
    );

    writeBodyPickSegments(fit, out);
    const upperIndex = fit.capsules.findIndex(
      (capsule) => capsule.bone === upper
    );
    const at = upperIndex * BODY_PICK_SEGMENT_STRIDE;
    // Rest pose: the upper capsule stands on the y axis, above y = 1.
    expect(Math.abs(out[at]!)).toBeLessThan(1e-4);
    expect(Math.abs(out[at + 3]!)).toBeLessThan(1e-4);
    expect(Math.min(out[at + 1]!, out[at + 4]!)).toBeGreaterThan(0.99);

    upper.rotation.z = Math.PI / 2;
    group.updateMatrixWorld(true);
    writeBodyPickSegments(fit, out);
    // Turned a quarter turn about z at y = 1: the capsule now lies along -x.
    expect(Math.abs(out[at + 1]! - 1)).toBeLessThan(1e-3);
    expect(Math.abs(out[at + 4]! - 1)).toBeLessThan(1e-3);
    expect(Math.max(out[at]!, out[at + 3]!)).toBeLessThan(-0.1);
  });

  it("scales the radius by the bone's world scale", () => {
    const { group } = buildTwoBoneCylinder();
    const fit = fitBodyPickCapsules(group);
    const out = new Float32Array(
      fit.capsules.length * BODY_PICK_SEGMENT_STRIDE
    );
    group.scale.setScalar(2);
    group.updateMatrixWorld(true);
    writeBodyPickSegments(fit, out);
    expect(out[6]).toBeCloseTo(fit.capsules[0]!.radius * 2, 4);
  });

  it("folds a small bone into its nearest major ancestor", () => {
    const { group, bones } = buildTwoBoneCylinder({ withTip: true });
    const fit = fitBodyPickCapsules(group);
    expect(fit.capsules).toHaveLength(2);
    expect(fit.capsules.some((capsule) => capsule.bone === bones[2])).toBe(
      false
    );
  });

  it("skips invisible and excluded meshes", () => {
    const hidden = buildTwoBoneCylinder();
    hidden.mesh.visible = false;
    expect(fitBodyPickCapsules(hidden.group).capsules).toHaveLength(0);

    const excluded = buildTwoBoneCylinder();
    excluded.mesh.userData.performerInteractionExcluded = true;
    expect(fitBodyPickCapsules(excluded.group).capsules).toHaveLength(0);

    const parentExcluded = buildTwoBoneCylinder();
    const wrapper = new Group();
    wrapper.userData.performerInteractionExcluded = true;
    parentExcluded.group.add(wrapper);
    wrapper.add(parentExcluded.mesh);
    expect(fitBodyPickCapsules(parentExcluded.group).capsules).toHaveLength(0);
  });

  it("returns no capsules for a root without skinned meshes", () => {
    expect(fitBodyPickCapsules(new Group()).capsules).toHaveLength(0);
  });
});

describe("createLiveBodyPick", () => {
  it("is empty until a skinned mesh appears, then fits once it does", () => {
    const group = new Group();
    const pick = createLiveBodyPick(group);
    expect(pick()).toBeNull();

    const { group: loaded } = buildTwoBoneCylinder();
    for (const child of [...loaded.children]) group.add(child);
    group.updateMatrixWorld(true);
    const segments = pick();
    expect(segments).not.toBeNull();
    expect(segments!.length).toBe(2 * BODY_PICK_SEGMENT_STRIDE);
    // The same array comes back while nothing changes.
    expect(pick()).toBe(segments);
  });
});
