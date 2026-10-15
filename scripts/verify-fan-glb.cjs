const fs = require("fs");
const path = require("path");
const { Matrix4, Quaternion, Vector3 } = require("three");

const glbPath = path.join(
  __dirname,
  "..",
  "static",
  "models",
  "props",
  "fan.glb"
);
const tipGeometryPath = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "shared",
  "3d",
  "effects",
  "prop-build-tip-geometry-3d.ts"
);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseGlb(filePath) {
  const bytes = fs.readFileSync(filePath);
  invariant(bytes.length >= 20, "GLB is too short");
  invariant(bytes.readUInt32LE(0) === 0x46546c67, "GLB magic is invalid");
  invariant(bytes.readUInt32LE(4) === 2, "GLB must use glTF 2.0");
  invariant(
    bytes.readUInt32LE(8) === bytes.length,
    "GLB length header is invalid"
  );

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
  invariant(
    accessor.componentType === 5126,
    "POSITION data must use FLOAT components"
  );
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
  const nodeParent = new Map();
  const meshNodes = [];
  const meshBounds = new Map();
  const nodeWorldMatrices = new Map();
  let vertexCount = 0;
  let triangleCount = 0;
  let primitiveCount = 0;

  function visit(nodeIndex, parentMatrix, parentIndex = null) {
    const node = document.nodes[nodeIndex];
    const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
    nodeWorldMatrices.set(nodeIndex, worldMatrix);
    nodeParent.set(nodeIndex, parentIndex);
    if (node.mesh !== undefined) {
      meshNodes.push(nodeIndex);
      const nodeMinimum = new Vector3(Infinity, Infinity, Infinity);
      const nodeMaximum = new Vector3(-Infinity, -Infinity, -Infinity);
      const mesh = document.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        primitiveCount += 1;
        invariant(
          primitive.indices !== undefined,
          `${mesh.name ?? node.name} is unindexed triangle soup`
        );
        invariant(
          primitive.attributes.NORMAL !== undefined,
          `${mesh.name ?? node.name} has no normals`
        );
        invariant(
          primitive.attributes.TEXCOORD_0 !== undefined,
          `${mesh.name ?? node.name} has no UVs`
        );
        const positions = readPositions(
          document,
          binary,
          primitive.attributes.POSITION
        );
        vertexCount += positions.length;
        for (const position of positions) {
          position.applyMatrix4(worldMatrix);
          minimum.min(position);
          maximum.max(position);
          nodeMinimum.min(position);
          nodeMaximum.max(position);
        }
        const indices = document.accessors[primitive.indices];
        invariant(
          indices.count % 3 === 0,
          `${mesh.name ?? node.name} indices do not form triangles`
        );
        triangleCount += indices.count / 3;
      }
      meshBounds.set(nodeIndex, { minimum: nodeMinimum, maximum: nodeMaximum });
    }
    for (const child of node.children ?? []) {
      visit(child, worldMatrix, nodeIndex);
    }
  }

  const scene = document.scenes[document.scene ?? 0];
  for (const rootNode of scene.nodes ?? []) {
    visit(rootNode, new Matrix4());
  }
  return {
    minimum,
    maximum,
    dimensions: maximum.clone().sub(minimum),
    nodeParent,
    meshNodes,
    meshBounds,
    nodeWorldMatrices,
    vertexCount,
    triangleCount,
    primitiveCount,
  };
}

function isDescendant(nodeIndex, ancestorIndex, nodeParent) {
  let current = nodeParent.get(nodeIndex);
  while (current !== null && current !== undefined) {
    if (current === ancestorIndex) return true;
    current = nodeParent.get(current);
  }
  return false;
}

function descendantDimensions(ancestorIndex, stats) {
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const [nodeIndex, bounds] of stats.meshBounds) {
    if (!isDescendant(nodeIndex, ancestorIndex, stats.nodeParent)) continue;
    minimum.min(bounds.minimum);
    maximum.max(bounds.maximum);
  }
  return maximum.sub(minimum);
}

invariant(fs.existsSync(glbPath), "fan.glb is missing");
const { bytes, document, binary } = parseGlb(glbPath);
const stats = collectScene(document, binary);
const nodes = document.nodes ?? [];
const nodeIndexByName = new Map(nodes.map((node, index) => [node.name, index]));
const materialNames = new Set(
  (document.materials ?? []).map((material) => material.name)
);
const materialByName = new Map(
  (document.materials ?? []).map((material) => [material.name, material])
);

const requiredNodes = [
  "TKA_Fan",
  "Fan_Fire",
  "Fan_Lotus",
  "Fan_Day",
  "Fan_Moon",
  "Fan_Astral",
  "Fan_Cover",
  "Fan_Fire_GripRing",
  "Fan_Fire_GripShell",
  "Fan_Fire_GripBridge_3",
  "Fan_Fire_LeftRail",
  "Fan_Fire_RightRail",
  "Fan_Fire_WickHorizon",
  "Fan_Fire_UpperLeftStar",
  "Fan_Fire_UpperRightStar",
  "Fan_Lotus_GripRing",
  "Fan_Lotus_FingerRing",
  "Fan_Lotus_LowerCradle",
  "Fan_Lotus_CenterPetal_Left",
  "Fan_Lotus_CenterPetal_Right",
  "Fan_Day_DoodleGripPlate",
  "Fan_Moon_DiffusionSkin",
  "Fan_Moon_GripRing",
  "Fan_Moon_GripGuard",
  "Fan_Moon_LED_Segment_A",
  "Fan_Moon_LED_Segment_B",
  "Fan_Astral_GripRing",
  "Fan_Astral_BladeDiffuser",
  "Fan_Astral_Blade_LED_01",
  "Fan_Astral_Blade_LED_30",
  "Fan_Astral_Sides_LED_6_6",
  "Fan_Cover_SolidFace",
  "Fan_Cover_StripedFace",
];
for (const name of requiredNodes) {
  invariant(nodeIndexByName.has(name), `Required node is missing: ${name}`);
}
for (const obsoleteName of [
  "Fan_Fire_LowerCourse",
  "Fan_Fire_UpperCourse",
  "Fan_Fire_LeftDiagonal",
  "Fan_Fire_RightDiagonal",
]) {
  invariant(
    !nodeIndexByName.has(obsoleteName),
    `Obsolete rounded webbing remains: ${obsoleteName}`
  );
}
const dayPlate = nodes[nodeIndexByName.get("Fan_Day_DoodleGripPlate")];
const fireGroup = nodes[nodeIndexByName.get("Fan_Fire")];
const lotusGroup = nodes[nodeIndexByName.get("Fan_Lotus")];
const moonGroup = nodes[nodeIndexByName.get("Fan_Moon")];
const astralGroup = nodes[nodeIndexByName.get("Fan_Astral")];
invariant(
  moonGroup.extras?.tka_led_count === 78 &&
    moonGroup.extras?.tka_led_segments === 2,
  "Moon fan no longer carries its documented 2 x 39 LED layout"
);
invariant(
  Math.abs(moonGroup.extras?.tka_ring_hole_diameter_m - 0.081) < 1e-6,
  "Moon fan grip no longer preserves the published 81mm opening"
);
invariant(
  astralGroup.extras?.tka_led_count === 66 &&
    astralGroup.extras?.tka_led_segments === 2,
  "Astral fan no longer carries its documented 66-pixel, two-zone layout"
);
for (const [zone, expected] of [
  ["Blade", 30],
  ["Sides", 36],
]) {
  const emitters = nodes.filter((node) =>
    node.name?.startsWith(`Fan_Astral_${zone}_LED_`)
  );
  invariant(
    emitters.length === expected,
    `Astral ${zone} must have ${expected} emitters`
  );
  invariant(
    emitters.every((node) =>
      (astralGroup.children ?? []).includes(nodes.indexOf(node))
    ),
    "Astral emitter escaped its build group"
  );
}
invariant(
  JSON.stringify(astralGroup.extras?.tka_control_zones) ===
    JSON.stringify(["blade", "sides"]),
  "Astral fan lost its independent Blade/Sides controls"
);
invariant(
  fireGroup.extras?.tka_build ===
    "Forged Creations five-wick DoodleGrip fire fan",
  "Fire fan is not identified as the five-wick DoodleGrip build"
);
invariant(
  fireGroup.extras?.tka_reference_lower_fan_excluded === true,
  "Fire fan geometry was not built from the isolated upper-fan cutout"
);
invariant(
  fireGroup.extras?.tka_grip_shell_geometry === "constant-radius circle",
  "Fire fan grip shell is not a constant-radius circular arc"
);
invariant(
  JSON.stringify(fireGroup.extras?.tka_reference_bbox_px) ===
    JSON.stringify([32, 26, 272, 181]),
  "Fire fan reference crop no longer excludes the paired lower fan"
);
invariant(
  JSON.stringify(fireGroup.extras?.tka_reference_pivot_px) ===
    JSON.stringify([152, 154]),
  "Fire fan reference pivot moved away from the isolated spinning ring"
);
invariant(
  Math.abs(fireGroup.extras?.tka_spinning_ring_id_m - 0.0381) < 1e-6,
  "Fire fan spinning ring is no longer the 1.5-inch option"
);
invariant(
  Math.abs(fireGroup.extras?.tka_wick_length_m - 0.0381) < 1e-6,
  "Fire fan no longer uses 1.5-inch rolled wicks"
);
invariant(
  Math.abs(fireGroup.extras?.tka_outer_spine_diameter_m - 0.0047625) < 1e-7,
  "Fire fan curved outside spines are no longer 3/16-inch stock"
);
invariant(
  Math.abs(fireGroup.extras?.tka_inner_spine_diameter_m - 0.003175) < 1e-7,
  "Fire fan inside spines are no longer 1/8-inch stock"
);
invariant(
  lotusGroup.extras?.tka_build ===
    "Home of Poi Medium Lotus five-wick fire fan",
  "Lotus fan is not identified as the measured medium five-wick build"
);
invariant(
  JSON.stringify(lotusGroup.extras?.tka_reference_bbox_px) ===
    JSON.stringify([45, 310, 1769, 1503]),
  "Lotus fan reference crop no longer matches the isolated product photograph"
);
invariant(
  JSON.stringify(lotusGroup.extras?.tka_reference_pivot_px) ===
    JSON.stringify([900, 1230]),
  "Lotus fan pivot moved away from the Russian grip centre"
);
invariant(
  Math.abs(lotusGroup.extras?.tka_spinning_ring_id_m - 0.092075) < 1e-7,
  "Lotus fan spinning ring is no longer the published 3 5/8-inch ID"
);
invariant(
  Math.abs(lotusGroup.extras?.tka_finger_ring_id_m - 0.022) < 1e-7,
  "Lotus fan finger ring no longer matches the calibrated photograph"
);
invariant(
  Math.abs(lotusGroup.extras?.tka_grip_ring_center_m?.[0]) < 1e-7 &&
    Math.abs(lotusGroup.extras?.tka_grip_ring_center_m?.[1] + 0.007628) < 1e-7,
  "Lotus fan grip ring no longer keeps its measured offset below the hand pivot"
);
invariant(
  Math.abs(lotusGroup.extras?.tka_wick_tape_width_m - 0.05) < 1e-7 &&
    Math.abs(lotusGroup.extras?.tka_wick_roll_length_m - 0.05) < 1e-7 &&
    Math.abs(lotusGroup.extras?.tka_wick_diameter_m - 0.028) < 1e-7,
  "Lotus fan wick roll no longer matches the calibrated 50 x 28mm body"
);
invariant(
  Math.abs(lotusGroup.extras?.tka_frame_stock_diameter_m - 0.004) < 1e-7 &&
    Math.abs(lotusGroup.extras?.tka_grip_stock_diameter_m - 0.007) < 1e-7,
  "Lotus fan no longer uses the published 4mm / 7mm welded steel stock"
);
invariant(
  lotusGroup.extras?.tka_lower_cradle_geometry === "constant-radius circle",
  "Lotus lower Russian-grip cradle is no longer a circular arc"
);
invariant(
  lotusGroup.extras?.tka_petal_count === 5 &&
    lotusGroup.extras?.tka_frame_path_count === 10 &&
    lotusGroup.extras?.tka_frame_symmetry ===
      "mirrored Illustrator SVG centerlines" &&
    lotusGroup.extras?.tka_vector_reference ===
      "scripts/assets/lotus-fire-reference.svg" &&
    lotusGroup.extras?.tka_vector_path_count === 10,
  "Lotus fan no longer carries the ten mirrored SVG centerlines"
);
invariant(
  lotusGroup.extras?.tka_side_weld_boss_count === 2 &&
    nodeIndexByName.has("Fan_Lotus_SideWeld_Left") &&
    nodeIndexByName.has("Fan_Lotus_SideWeld_Right"),
  "Lotus fan is missing the two built-up grip junction welds"
);
invariant(
  lotusGroup.extras?.tka_finger_ring_brace_count === 0 &&
    lotusGroup.extras?.tka_finger_ring_weld_count === 3 &&
    lotusGroup.extras?.tka_rail_root_weld_count === 10 &&
    !nodeIndexByName.has("Fan_Lotus_FingerBrace_Left") &&
    !nodeIndexByName.has("Fan_Lotus_FingerBrace_Right") &&
    nodeIndexByName.has("Fan_Lotus_FingerWeld_Lower") &&
    Array.from(
      { length: 10 },
      (_, index) => `Fan_Lotus_Weld_${index + 1}`
    ).every((name) => nodeIndexByName.has(name)),
  "Lotus traced rail roots are missing their symmetric welds"
);
invariant(
  lotusGroup.extras?.tka_wick_mount ===
    "intact Illustrator SVG terminals through inward-facing end caps",
  "Lotus wire no longer preserves the Illustrator terminals at the five wick caps"
);
invariant(
  dayPlate.extras?.tka_trace_contours === 18,
  "Day fan is not the 18-contour product-image trace"
);
invariant(
  dayPlate.extras?.tka_trace_holes === 17,
  "Day fan no longer preserves all 17 reference cutouts"
);
invariant(
  dayPlate.extras?.tka_trace_points >= 250,
  "Day fan trace was simplified past the reference detail target"
);
invariant(
  Math.abs(dayPlate.extras?.tka_ring_diameter_m - 0.044) < 1e-6,
  "Day fan no longer uses the selected 1.75-inch / 44mm ring"
);
invariant(
  Math.abs(dayPlate.extras?.tka_finished_ring_control_diameter_m - 0.044) <
    1e-6,
  "Finished Day fan grip control boundary is no longer 44mm"
);
invariant(
  dayPlate.extras?.tka_minimum_web_m >= 0.007,
  `Day fan web clearance is too thin: ${dayPlate.extras?.tka_minimum_web_m}m`
);
invariant(
  dayPlate.extras?.tka_symmetry ===
    "bilateral average of eight left/right cutout pairs",
  "Day fan is missing its bilateral camera-skew correction"
);
invariant(
  dayPlate.extras?.tka_official_dimensions_source ===
    "https://flowtoys.com/products/doodlegrip-practice-fans",
  "Day fan no longer records the manufacturer dimensions source"
);
invariant(
  !nodes.some((node) => /^Fan_Fire_Web_\d+$/.test(node.name ?? "")),
  "Detached first-pass fire webbing is still present"
);
invariant(
  !nodes.some((node) => /^Fan_Fire_ControlLoop_/.test(node.name ?? "")),
  "Incorrect three-ring Fire handle is still present"
);
invariant(
  !nodeIndexByName.has("Fan_Fire_Spine_1") &&
    !nodeIndexByName.has("Fan_Fire_Spine_5"),
  "Outside Fire spines are duplicated instead of using the curved rails"
);
for (let index = 1; index <= 5; index += 1) {
  invariant(
    nodeIndexByName.has(`Fan_Fire_Wick_${index}`),
    `Fire fan wick ${index} is missing`
  );
  invariant(
    nodeIndexByName.has(`Fan_Lotus_Wick_${index}`),
    `Lotus fan wick ${index} is missing`
  );
}

const lotusTinePairs = lotusGroup.extras?.tka_wick_tine_pairs_m;
const lotusWickCenters = lotusGroup.extras?.tka_wick_centers_m;
const lotusWickDirections = lotusGroup.extras?.tka_wick_directions_m;
invariant(
  lotusTinePairs?.length === 5 &&
    lotusWickCenters?.length === 5 &&
    lotusWickDirections?.length === 5,
  "Lotus wick mounting metadata must describe five paired axial mounts"
);
const expectedLotusTines = lotusTinePairs.flat();
const actualLotusTines = nodes
  .map((node, nodeIndex) => ({ node, nodeIndex }))
  .filter(({ node }) => node.extras?.tka_wick_tine_neck_m)
  .map(({ node, nodeIndex }) => ({
    nodeIndex,
    neck: node.extras.tka_wick_tine_neck_m,
    entry: node.extras.tka_wick_tine_entry_m,
  }));
invariant(
  expectedLotusTines.length === 10 && actualLotusTines.length === 10,
  "Lotus fan must carry ten independently verifiable wick tines"
);

const pointsMatch = (left, right, tolerance = 1e-7) =>
  left.every((value, axis) => Math.abs(value - right[axis]) < tolerance);
const pointsReflectAcrossCenter = (left, right, tolerance = 1e-7) =>
  Math.abs(left[0] + right[0]) < tolerance &&
  Math.abs(left[1] - right[1]) < tolerance &&
  Math.abs(left[2] - right[2]) < tolerance;
for (const [leftWick, leftTine, rightWick, rightTine] of [
  [0, 0, 4, 1],
  [0, 1, 4, 0],
  [1, 0, 3, 1],
  [1, 1, 3, 0],
  [2, 0, 2, 1],
]) {
  const [leftNeck, leftEntry] = lotusTinePairs[leftWick][leftTine];
  const [rightNeck, rightEntry] = lotusTinePairs[rightWick][rightTine];
  invariant(
    pointsReflectAcrossCenter(leftNeck, rightNeck) &&
      pointsReflectAcrossCenter(leftEntry, rightEntry),
    `Lotus SVG tine ${leftWick + 1}/${leftTine + 1} is not an exact reflection of ${rightWick + 1}/${rightTine + 1}: ${JSON.stringify({ leftNeck, rightNeck, leftEntry, rightEntry })}`
  );
}
for (const actual of actualLotusTines) {
  invariant(
    expectedLotusTines.some(
      ([neck, entry]) =>
        pointsMatch(actual.neck, neck) && pointsMatch(actual.entry, entry)
    ),
    `Lotus tine node ${nodes[actual.nodeIndex].name} drifted from its measured mount pair`
  );
  const bounds = stats.meshBounds.get(actual.nodeIndex);
  const entry = new Vector3().fromArray(actual.entry);
  invariant(
    entry.x >= bounds.minimum.x - 0.0021 &&
      entry.x <= bounds.maximum.x + 0.0021 &&
      entry.y >= bounds.minimum.y - 0.0021 &&
      entry.y <= bounds.maximum.y + 0.0021 &&
      entry.z >= bounds.minimum.z - 0.0021 &&
      entry.z <= bounds.maximum.z + 0.0021,
    `Lotus tine node ${nodes[actual.nodeIndex].name} does not physically reach its wick entry point`
  );
}

const lotusRollLengths = lotusGroup.extras.tka_wick_roll_lengths_m;
const lotusDiameters = lotusGroup.extras.tka_wick_diameters_m;
invariant(
  lotusRollLengths?.length === 5 && lotusDiameters?.length === 5,
  "Lotus fan must preserve five calibrated wick silhouettes"
);
for (const [leftIndex, rightIndex] of [
  [0, 4],
  [1, 3],
]) {
  const leftCenter = lotusWickCenters[leftIndex];
  const rightCenter = lotusWickCenters[rightIndex];
  const leftDirection = lotusWickDirections[leftIndex];
  const rightDirection = lotusWickDirections[rightIndex];
  invariant(
    Math.abs(leftCenter[0] + rightCenter[0]) < 1e-7 &&
      Math.abs(leftCenter[1] - rightCenter[1]) < 1e-7 &&
      Math.abs(leftCenter[2] - rightCenter[2]) < 1e-7 &&
      Math.abs(leftDirection[0] + rightDirection[0]) < 1e-7 &&
      Math.abs(leftDirection[1] - rightDirection[1]) < 1e-7 &&
      Math.abs(leftDirection[2] - rightDirection[2]) < 1e-7 &&
      Math.abs(lotusRollLengths[leftIndex] - lotusRollLengths[rightIndex]) <
        1e-7 &&
      Math.abs(lotusDiameters[leftIndex] - lotusDiameters[rightIndex]) < 1e-7,
    `Lotus wick pair ${leftIndex + 1}/${rightIndex + 1} is not an exact bilateral reflection`
  );
}
invariant(
  Math.abs(lotusWickCenters[2][0]) < 1e-7 &&
    Math.abs(lotusWickDirections[2][0]) < 1e-7 &&
    Math.abs(lotusWickDirections[2][1] - 1) < 1e-7,
  "Lotus center wick is not locked vertically to the symmetry axis"
);
console.log("FAN_LOTUS_SYMMETRY=verified-5-wicks-exact-bilateral-reflection");
const lotusInsertionDepth = lotusGroup.extras.tka_wick_tine_insertion_depth_m;
const lotusSvgImportTolerance = 1e-4;
for (let wickIndex = 0; wickIndex < 5; wickIndex += 1) {
  const center = new Vector3().fromArray(lotusWickCenters[wickIndex]);
  const direction = new Vector3()
    .fromArray(lotusWickDirections[wickIndex])
    .normalize();
  const lotusRollHalf = lotusRollLengths[wickIndex] / 2;
  const baseCenter = center.clone().addScaledVector(direction, -lotusRollHalf);
  const terminals = [];
  for (const [neckArray, entryArray] of lotusTinePairs[wickIndex]) {
    const neck = new Vector3().fromArray(neckArray);
    const entry = new Vector3().fromArray(entryArray);
    const axialRun = entry.clone().sub(neck);
    invariant(
      Math.abs(axialRun.length() - lotusInsertionDepth) < 1e-7 &&
        axialRun.clone().normalize().dot(direction) > 0.999999,
      `Lotus wick ${wickIndex + 1} has a terminal extension that is not axial inside the roll`
    );
    const neckOffset = neck.clone().sub(baseCenter);
    const axialOffset = neckOffset.dot(direction);
    const transverse = neckOffset
      .clone()
      .addScaledVector(direction, -axialOffset)
      .length();
    invariant(
      Math.abs(axialOffset) < lotusSvgImportTolerance &&
        transverse < lotusDiameters[wickIndex] / 2,
      `Lotus wick ${wickIndex + 1} Illustrator terminal misses the inward-facing base cap`
    );
    terminals.push(neck);
  }
  const terminalMidpoint = terminals[0]
    .clone()
    .add(terminals[1])
    .multiplyScalar(0.5);
  invariant(
    terminalMidpoint.distanceTo(baseCenter) < lotusSvgImportTolerance,
    `Lotus wick ${wickIndex + 1} is no longer centered on its Illustrator terminal pair`
  );
}
console.log(
  "FAN_LOTUS_WICK_MOUNTS=verified-10-intact-svg-terminals-through-5-base-caps"
);

const requiredMaterials = [
  "TKA_Fan_Fire_Steel",
  "TKA_Fan_Lotus_Powdercoat",
  "TKA_Fan_Lotus_Wick",
  "TKA_Fan_Wick",
  "TKA_Fan_Wick_Wrap",
  "TKA_Fan_Day_Frame",
  "TKA_Fan_Moon_Fabric",
  "TKA_Fan_Moon_Frame",
  "TKA_Fan_Moon_LED_A",
  "TKA_Fan_Moon_LED_B",
  "TKA_Fan_Cover_Solid_Recolor",
  "TKA_Fan_Cover_Stripe_Dark",
  "TKA_Fan_Cover_Stripe_Light",
  "TKA_Fan_Cover_Seam",
];
for (const name of requiredMaterials) {
  invariant(materialNames.has(name), `Required material is missing: ${name}`);
}
const dayMaterial = materialByName.get("TKA_Fan_Day_Frame");
invariant(
  dayMaterial.pbrMetallicRoughness?.metallicFactor === 0,
  "Day fan HDPE must remain nonmetallic"
);
invariant(
  dayMaterial.pbrMetallicRoughness?.roughnessFactor >= 0.68,
  "Day fan HDPE is too glossy"
);
const moonFabric = materialByName.get("TKA_Fan_Moon_Fabric");
invariant(
  moonFabric.pbrMetallicRoughness?.metallicFactor === 0 &&
    moonFabric.pbrMetallicRoughness?.roughnessFactor >= 0.82,
  "Moon fan skin no longer reads as matte diffusion fabric"
);
const fireMaterial = materialByName.get("TKA_Fan_Fire_Steel");
invariant(
  fireMaterial.pbrMetallicRoughness?.metallicFactor >= 0.7,
  "Fire fan frame no longer reads as steel"
);
invariant(
  fireMaterial.pbrMetallicRoughness?.roughnessFactor >= 0.44,
  "Fire fan frame is glossier than an oil-rubbed finish"
);
const lotusMaterial = materialByName.get("TKA_Fan_Lotus_Powdercoat");
invariant(
  lotusMaterial.pbrMetallicRoughness?.metallicFactor === 0,
  "Lotus powder coat must remain a dielectric black finish"
);
invariant(
  lotusMaterial.pbrMetallicRoughness?.roughnessFactor >= 0.46,
  "Lotus powder coat is reading glossier than the product photograph"
);
const lotusWickMaterial = materialByName.get("TKA_Fan_Lotus_Wick");
invariant(
  Number.isInteger(
    lotusWickMaterial.pbrMetallicRoughness?.baseColorTexture?.index
  ),
  "Lotus Kevlar is missing its embedded row-braided color texture"
);
invariant(
  Number.isInteger(lotusWickMaterial.normalTexture?.index) &&
    lotusWickMaterial.normalTexture.scale > 0,
  "Lotus Kevlar is missing its embedded woven normal texture"
);
const lotusTextureImages = (document.images ?? []).filter((image) =>
  image.name?.startsWith("lotus-wick-")
);
invariant(
  lotusTextureImages.length === 2 &&
    lotusTextureImages.every(
      (image) =>
        image.mimeType === "image/png" && Number.isInteger(image.bufferView)
    ),
  "Lotus wick textures must remain two PNGs embedded inside the GLB"
);
console.log("FAN_LOTUS_WICK_TEXTURES=verified-color-normal-embedded");

for (const groupName of [
  "Fan_Fire",
  "Fan_Lotus",
  "Fan_Day",
  "Fan_Moon",
  "Fan_Cover",
]) {
  const groupIndex = nodeIndexByName.get(groupName);
  const meshCount = stats.meshNodes.filter((nodeIndex) =>
    isDescendant(nodeIndex, groupIndex, stats.nodeParent)
  ).length;
  const minimumMeshCount = groupName === "Fan_Day" ? 1 : 2;
  invariant(
    meshCount >= minimumMeshCount,
    `${groupName} has no usable mesh layer`
  );
}
const dayDimensions = descendantDimensions(
  nodeIndexByName.get("Fan_Day"),
  stats
);
const fireDimensions = descendantDimensions(
  nodeIndexByName.get("Fan_Fire"),
  stats
);
const lotusDimensions = descendantDimensions(
  nodeIndexByName.get("Fan_Lotus"),
  stats
);
const moonDimensions = descendantDimensions(
  nodeIndexByName.get("Fan_Moon"),
  stats
);
invariant(
  Math.abs(dayDimensions.x - 0.51) <= 0.0002,
  `Traced Day fan width drifted: ${dayDimensions.x.toFixed(4)}m`
);
invariant(
  Math.abs(dayDimensions.y - 0.35) <= 0.0002,
  `Traced Day fan height drifted: ${dayDimensions.y.toFixed(4)}m`
);
invariant(
  Math.abs(dayDimensions.z - 0.0095) <= 0.0002,
  `Traced Day fan stock thickness drifted: ${dayDimensions.z.toFixed(4)}m`
);
invariant(
  Math.abs(moonDimensions.x - 0.6) <= 0.01,
  `Moon fan width drifted: ${moonDimensions.x.toFixed(4)}m`
);
invariant(
  Math.abs(moonDimensions.y - 0.38) <= 0.01,
  `Moon fan height drifted: ${moonDimensions.y.toFixed(4)}m`
);
invariant(
  Math.abs(fireDimensions.x - 0.4826) <= 0.00001,
  `DoodleGrip Fire width drifted: ${fireDimensions.x.toFixed(6)}m`
);
invariant(
  Math.abs(fireDimensions.y - 0.3302) <= 0.00001,
  `DoodleGrip Fire height drifted: ${fireDimensions.y.toFixed(6)}m`
);
invariant(
  Math.abs(lotusDimensions.x - 0.48) <= 0.01,
  `Lotus fan width drifted: ${lotusDimensions.x.toFixed(6)}m`
);
invariant(
  Math.abs(lotusDimensions.y - 0.35) <= 0.005,
  `Lotus fan height drifted: ${lotusDimensions.y.toFixed(6)}m`
);

const root = nodes[nodeIndexByName.get("TKA_Fan")];
const rootTranslation = new Vector3().fromArray(root.translation ?? [0, 0, 0]);
invariant(
  rootTranslation.length() < 1e-6,
  `Hand pivot moved away from the origin: ${rootTranslation.toArray()}`
);

function verifyWickCentres(extraName, constantName, nodePrefix, label) {
  if (!root.extras?.[extraName]) {
    console.log(`${label.toUpperCase()}_WICK_CENTERS=missing-extras`);
    return;
  }
  const source = fs.readFileSync(tipGeometryPath, "utf8");
  const constantBody = source.match(
    new RegExp(`${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`)
  );
  invariant(constantBody, `TypeScript ${label} wick constants are missing`);
  const typeScriptCenters = [
    ...constantBody[1].matchAll(
      /\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/g
    ),
  ].map((match) => match.slice(1).map(Number));
  const bakedCenters = root.extras[extraName];
  invariant(
    typeScriptCenters.length === 5,
    `TypeScript must define five ${label} wicks`
  );
  invariant(
    bakedCenters.length === 5,
    `GLB extras must define five ${label} wicks`
  );
  for (let index = 0; index < 5; index += 1) {
    const nodeIndex = nodeIndexByName.get(`${nodePrefix}_${index + 1}`);
    const nodeCenter = new Vector3().setFromMatrixPosition(
      stats.nodeWorldMatrices.get(nodeIndex)
    );
    for (let axis = 0; axis < 3; axis += 1) {
      invariant(
        Math.abs(typeScriptCenters[index][axis] - bakedCenters[index][axis]) <
          1e-7,
        `TypeScript ${label} wick ${index + 1} does not match the baked GLB extras`
      );
      invariant(
        Math.abs(
          typeScriptCenters[index][axis] - nodeCenter.getComponent(axis)
        ) < 1e-7,
        `TypeScript ${label} wick ${index + 1} does not match its GLB world position`
      );
    }
  }
  console.log(
    `${label.toUpperCase()}_WICK_CENTERS=verified-typescript-extras-nodes`
  );
}

verifyWickCentres(
  "tka_wick_centers_m",
  "FAN_FIRE_WICK_CENTERS_M",
  "Fan_Fire_Wick",
  "fan-fire"
);
verifyWickCentres(
  "tka_lotus_wick_centers_m",
  "FAN_LOTUS_WICK_CENTERS_M",
  "Fan_Lotus_Wick",
  "fan-lotus"
);

invariant(
  bytes.length >= 40_000,
  `fan.glb is suspiciously small: ${bytes.length}`
);
// Five physical builds and the optional cover share this request. Keep
// the complete family below 2.5 MB while retaining discrete Astral lenses.
invariant(bytes.length <= 2_500_000, `fan.glb is too large: ${bytes.length}`);
invariant(
  stats.triangleCount >= 2_000,
  "Fan detail collapsed below the art target"
);
invariant(
  stats.triangleCount <= 80_000,
  "Fan exceeds the mobile triangle budget"
);
console.log(
  `FAN_DIMENSIONS_M=${stats.dimensions.x.toFixed(4)},${stats.dimensions.y.toFixed(4)},${stats.dimensions.z.toFixed(4)}`
);
invariant(
  stats.dimensions.x >= 0.5 && stats.dimensions.x <= 0.62,
  `Fan width is outside the supported physical builds: ${stats.dimensions.x.toFixed(4)}m`
);
invariant(
  stats.dimensions.y >= 0.34 && stats.dimensions.y <= 0.41,
  `Fan height is outside the 13.75-inch class: ${stats.dimensions.y.toFixed(4)}m`
);
invariant(
  stats.dimensions.z >= 0.018 &&
    stats.dimensions.z <= Math.max(...lotusDiameters) + 0.001,
  `Fan depth is implausible: ${stats.dimensions.z.toFixed(4)}m`
);

console.log(`FAN_GLB=${glbPath}`);
console.log(`FAN_BYTES=${bytes.length}`);
console.log(`FAN_NODES=${nodes.length}`);
console.log(`FAN_MATERIALS=${materialNames.size}`);
console.log(`FAN_VERTICES=${stats.vertexCount}`);
console.log(`FAN_TRIANGLES=${stats.triangleCount}`);
console.log(
  `FAN_DAY_DIMENSIONS_M=${dayDimensions.x.toFixed(4)},${dayDimensions.y.toFixed(4)},${dayDimensions.z.toFixed(4)}`
);
console.log(
  `FAN_FIRE_DIMENSIONS_M=${fireDimensions.x.toFixed(6)},${fireDimensions.y.toFixed(6)},${fireDimensions.z.toFixed(6)}`
);
console.log(
  `FAN_MOON_DIMENSIONS_M=${moonDimensions.x.toFixed(4)},${moonDimensions.y.toFixed(4)},${moonDimensions.z.toFixed(4)}`
);
console.log(
  `FAN_LOTUS_DIMENSIONS_M=${lotusDimensions.x.toFixed(6)},${lotusDimensions.y.toFixed(6)},${lotusDimensions.z.toFixed(6)}`
);
console.log(
  "FAN_VARIANTS=fire,lotus,day-black,day-white,moon,astral,bare,covered-solid,covered-striped"
);
