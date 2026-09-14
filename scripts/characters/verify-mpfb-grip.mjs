/** Validate an MPFB export, optionally comparing it with its previous export.
 * Run: node --import tsx scripts/characters/verify-mpfb-grip.mjs [before.glb] after.glb
 * This measures joints, not skin contact; inspect the real viewer as well.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Bone, Vector3 } from "three";
import { FingerAnimator } from "../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator.ts";
import {
  FINGER_BONES,
  GripType,
} from "../../node_modules/@austencloud/scene-3d/src/lib/domain/models/GripPose.ts";

const require = createRequire(import.meta.url);
const { parseGlb, nodeMatrix } = require("../lib/glb-measure.cjs");

function measure(path) {
  const { document } = parseGlb(path);
  const nodes = document.nodes.map((node) => {
    const bone = new Bone();
    bone.name = node.name ?? "";
    nodeMatrix(node).decompose(bone.position, bone.quaternion, bone.scale);
    return bone;
  });
  document.nodes.forEach((node, i) => {
    for (const child of node.children ?? []) nodes[i].add(nodes[child]);
  });
  const roots = nodes.filter((node) => !node.parent);
  const update = () => roots.forEach((root) => root.updateMatrixWorld(true));
  update();
  const joints = new Map(
    nodes.map((node) => [node.name.replace(/^mixamorig\d*:?/, ""), node])
  );
  const position = (name) => {
    assert(joints.has(name), `Missing ${name}`);
    return joints.get(name).getWorldPosition(new Vector3());
  };
  const rest = new Map(
    [...joints.keys()]
      .filter((name) => /^(Left|Right|Hips|Spine|Neck|Head)/.test(name))
      .map((name) => [name, position(name)])
  );
  const chains = {};
  for (const side of ["left", "right"]) {
    const prefix = `${side[0].toUpperCase()}${side.slice(1)}Hand`;
    chains[side] = new Map(
      FINGER_BONES.map((name) => [name, joints.get(prefix + name)])
    );
  }
  const animator = new FingerAnimator();
  animator.initialize(chains);
  animator.setGrips(GripType.SQUARE, GripType.SQUARE);
  animator.update(1);
  update();
  const distances = ["Left", "Right"].map((side) => {
    const prefix = side + "Hand";
    return {
      side,
      // Distal joint is retained in optimized GLBs; tip end bones are not.
      thumbIndex: position(prefix + "Thumb3").distanceTo(
        position(prefix + "Index2")
      ),
      palmLength: rest.get(prefix).distanceTo(rest.get(prefix + "Middle1")),
    };
  });
  animator.dispose();
  return { rest, distances };
}

const paths = process.argv.slice(2);
assert(
  paths.length >= 1 && paths.length <= 2,
  "Provide an MPFB GLB, or previous and repaired GLBs"
);
const before = paths.length === 2 ? measure(paths[0]) : null;
const after = measure(paths.at(-1));
if (before) {
  assert.equal(after.rest.size, before.rest.size, "Joint count changed");
  for (const [name, position] of before.rest) {
    assert(
      position.distanceTo(after.rest.get(name)) < 1e-5,
      `${name}: rest joint moved`
    );
  }
}
for (const [index, hand] of after.distances.entries()) {
  if (before)
    assert(
      hand.thumbIndex < before.distances[index].thumbIndex * 0.6,
      `${hand.side}: thumb still extends away from the grip`
    );
  assert(
    hand.thumbIndex < hand.palmLength * 0.5,
    `${hand.side}: thumb misses the index side of the grip`
  );
}
assert(
  Math.abs(after.distances[0].thumbIndex - after.distances[1].thumbIndex) <
    0.001,
  "Hands curl asymmetrically"
);
console.log(
  JSON.stringify(
    {
      ...(before
        ? { before: before.distances, restJointsUnchanged: after.rest.size }
        : {}),
      after: after.distances,
    },
    null,
    2
  )
);
