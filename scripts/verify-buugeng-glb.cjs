const fs = require("fs");
const path = require("path");

const { Matrix4, Quaternion, Vector3 } = require("three");

const glbPath = path.join(
  __dirname,
  "..",
  "static",
  "models",
  "props",
  "buugeng.glb"
);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseGlb(filePath) {
  const bytes = fs.readFileSync(filePath);
  invariant(bytes.length >= 20, "GLB is too short");
  invariant(bytes.readUInt32LE(0) === 0x46546c67, "GLB magic is invalid");
  invariant(bytes.readUInt32LE(4) === 2, "GLB must use glTF 2.0");
  invariant(bytes.readUInt32LE(8) === bytes.length, "GLB length header is invalid");

  let offset = 12;
  let document = null;
  let binary = null;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const payload = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) {
      document = JSON.parse(payload.toString("utf8").trim());
    } else if (chunkType === 0x004e4942) {
      binary = payload;
    }
    offset += 8 + chunkLength;
  }

  invariant(document, "GLB JSON chunk is missing");
  invariant(binary, "GLB binary chunk is missing");
  return { bytes, document, binary };
}

function nodeMatrix(node) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale ?? [1, 1, 1])
  );
}

function readPositions(document, binary, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor.bufferView];
  invariant(accessor.componentType === 5126, "POSITION data must use FLOAT components");
  invariant(accessor.type === "VEC3", "POSITION data must use VEC3 values");

  const stride = view.byteStride ?? 12;
  const baseOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const positions = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const offset = baseOffset + index * stride;
    positions.push(
      new Vector3(
        binary.readFloatLE(offset),
        binary.readFloatLE(offset + 4),
        binary.readFloatLE(offset + 8)
      )
    );
  }
  return positions;
}

function collectScene(document, binary) {
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  let vertexCount = 0;
  let triangleCount = 0;
  let primitiveCount = 0;
  // The two tips: the vertices farthest along -Y and +Y.
  let minusTip = null;
  let plusTip = null;

  function visit(nodeIndex, parentMatrix) {
    const node = document.nodes[nodeIndex];
    const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = document.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        primitiveCount += 1;
        invariant(primitive.indices !== undefined, `${mesh.name} is unindexed triangle soup`);
        invariant(primitive.attributes.NORMAL !== undefined, `${mesh.name} has no normals`);
        invariant(primitive.attributes.TEXCOORD_0 !== undefined, `${mesh.name} has no UVs`);

        const positions = readPositions(document, binary, primitive.attributes.POSITION);
        vertexCount += positions.length;
        for (const position of positions) {
          position.applyMatrix4(worldMatrix);
          minimum.min(position);
          maximum.max(position);
          if (!minusTip || position.y < minusTip.y) minusTip = position.clone();
          if (!plusTip || position.y > plusTip.y) plusTip = position.clone();
        }

        const indexAccessor = document.accessors[primitive.indices];
        invariant(indexAccessor.count % 3 === 0, `${mesh.name} indices do not form triangles`);
        triangleCount += indexAccessor.count / 3;
      }
    }
    for (const child of node.children ?? []) visit(child, worldMatrix);
  }

  const scene = document.scenes[document.scene ?? 0];
  for (const rootNode of scene.nodes ?? []) visit(rootNode, new Matrix4());
  return {
    minimum,
    maximum,
    dimensions: maximum.clone().sub(minimum),
    center: maximum.clone().add(minimum).multiplyScalar(0.5),
    vertexCount,
    triangleCount,
    primitiveCount,
    minusTip,
    plusTip,
  };
}

function near(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

const { bytes, document, binary } = parseGlb(glbPath);
const stats = collectScene(document, binary);
const nodeNames = new Set((document.nodes ?? []).map((node) => node.name));
const materialNames = new Set((document.materials ?? []).map((item) => item.name));

invariant(bytes.length <= 600_000, `Buugeng exceeds 600 KB: ${bytes.length}`);
invariant(document.scenes?.length === 1, "Buugeng must contain exactly one scene");
invariant((document.cameras?.length ?? 0) === 0, "QA camera leaked into the GLB");
invariant(
  !(document.extensionsUsed ?? []).includes("KHR_lights_punctual"),
  "QA lights leaked into the GLB"
);
invariant(nodeNames.has("TKA_Buugeng"), "Root node TKA_Buugeng is missing");
invariant(
  nodeNames.has("TKA_Buugeng_PerforatedBody_Recolor"),
  "Perforated body node is missing"
);
invariant(nodeNames.has("TKA_Hand_Pivot"), "Hand pivot is missing");
invariant(
  !nodeNames.has("TKA_Buugeng_RubberizedGrip"),
  "The obsolete bar grip is still present"
);
invariant(materialNames.has("TKA_Buugeng_Recolor"), "Recolor material is missing");
invariant(
  materialNames.size === 1,
  `Unexpected Buugeng material set: ${[...materialNames].join(", ")}`
);
invariant(stats.vertexCount <= 14_000, `Too many vertices: ${stats.vertexCount}`);
invariant(stats.triangleCount <= 14_000, `Too many triangles: ${stats.triangleCount}`);
invariant(
  near(stats.dimensions.y, 0.83, 0.005),
  `Local Y length must be 0.83m, got ${stats.dimensions.y.toFixed(4)}`
);
// Across the tip chord the S bows out wider than the trace's bounding box did
// (0.31 m) when the box, not the chord, was the long axis.
invariant(
  stats.dimensions.x >= 0.37 && stats.dimensions.x <= 0.41,
  `Unexpected silhouette width: ${stats.dimensions.x.toFixed(4)}`
);
// Effects emit along local Y, so both pointed tips must sit on that axis.
for (const [name, tip] of [["-Y", stats.minusTip], ["+Y", stats.plusTip]]) {
  invariant(tip, `No ${name} tip vertex`);
  invariant(
    Math.abs(tip.x) <= 0.004,
    `${name} tip is off the long axis by ${tip.x.toFixed(4)} m`
  );
}
invariant(
  stats.dimensions.z >= 0.009 && stats.dimensions.z <= 0.012,
  `Body stock depth is wrong: ${stats.dimensions.z.toFixed(4)}`
);
invariant(stats.center.length() <= 0.003, `Hand pivot drifted: ${stats.center.toArray()}`);

const root = (document.nodes ?? []).find((node) => node.name === "TKA_Buugeng");
invariant(root?.extras?.authored_length_m === 0.83, "83cm length metadata is missing");
invariant(root?.extras?.body_depth_m === 0.0095, "9.5mm body metadata is missing");
invariant(root?.extras?.grip_length_m === 0.15, "15cm waist metadata is missing");
invariant(root?.extras?.cutout_count === 10, "Ten slots were not exported");
invariant(
  root?.extras?.waist_width_m >= 0.018 && root?.extras?.waist_width_m <= 0.03,
  `Narrow waist metadata is wrong: ${root?.extras?.waist_width_m}`
);
invariant(
  root?.extras?.canonical_source === "scripts/assets/buugeng-reference.svg",
  "Reference trace metadata is missing"
);
invariant(
  root?.extras?.long_axis_source === "tip-to-tip chord",
  "Long axis must be authored as the tip-to-tip chord"
);
invariant(
  root?.extras?.design_credit === "Flow DNA" &&
    root?.extras?.design_source_url === "https://flowtoys.com/flowgeng",
  "Flow DNA design credit metadata is missing"
);
invariant(
  root?.extras?.symmetry_method === "lower reference half rotated 180 degrees",
  "Half-turn symmetry metadata is missing"
);

console.log(`Verified ${glbPath}`);
console.log(`  bytes: ${bytes.length}`);
console.log(`  meshes: ${document.meshes.length}`);
console.log(`  primitives: ${stats.primitiveCount}`);
console.log(`  vertices: ${stats.vertexCount}`);
console.log(`  triangles: ${stats.triangleCount}`);
console.log(`  materials: ${[...materialNames].join(", ")}`);
console.log(
  `  bounds: ${stats.dimensions.x.toFixed(4)} x ${stats.dimensions.y.toFixed(4)} x ${stats.dimensions.z.toFixed(4)} m`
);
console.log(`  hand pivot: ${stats.center.toArray().map((value) => value.toFixed(5)).join(", ")}`);
console.log(
  `  tips: ${[stats.minusTip, stats.plusTip]
    .map((tip) => tip.toArray().map((value) => value.toFixed(4)).join(", "))
    .join(" | ")}`
);
console.log(`  trace to chord turn: ${root.extras.trace_to_chord_turn_deg.toFixed(3)} deg`);
