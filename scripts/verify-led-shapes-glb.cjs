const fs = require("fs");
const path = require("path");

const glbPath = path.join(
  __dirname,
  "..",
  "static",
  "models",
  "props",
  "led-shapes.glb"
);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseDocument(filePath) {
  const bytes = fs.readFileSync(filePath);
  invariant(bytes.readUInt32LE(0) === 0x46546c67, "GLB magic is invalid");
  invariant(bytes.readUInt32LE(4) === 2, "GLB must use glTF 2.0");
  invariant(bytes.readUInt32LE(8) === bytes.length, "GLB length is invalid");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return {
        bytes,
        document: JSON.parse(
          bytes
            .subarray(offset + 8, offset + 8 + length)
            .toString("utf8")
            .trim()
        ),
      };
    }
    offset += 8 + length;
  }
  throw new Error("GLB JSON chunk is missing");
}

invariant(fs.existsSync(glbPath), "led-shapes.glb is missing");
const { bytes, document } = parseDocument(glbPath);
const nodes = document.nodes ?? [];
const nodeByName = new Map(nodes.map((node) => [node.name, node]));
const materialNames = new Set(
  (document.materials ?? []).map((material) => material.name)
);

for (const name of [
  "TKA_LED_Shapes",
  "Triquetra_Day",
  "Triquetra_LED",
  "Triangle_Day",
  "Triangle_LED",
]) {
  invariant(nodeByName.has(name), `Required node is missing: ${name}`);
}
const stations = JSON.parse(
  fs.readFileSync(path.join(__dirname, "hoop-family-stations.json"), "utf8")
);
for (const [shape, grips, count] of [
  ["Triquetra", ["Armpit", "Tip"], 60],
  ["Triangle", ["Corner", "Side"], 48],
]) {
  for (const grip of grips) {
    for (const build of ["Day", "LED"]) {
      const group = nodeByName.get(`${shape}_${build}_${grip}`);
      invariant(group, `Missing ${shape} ${grip} ${build} group`);
      invariant(
        group.extras?.tka_grip === grip.toLowerCase(),
        "Grip identity changed"
      );
      if (build === "LED") {
        invariant(
          group.extras?.tka_led_count === count,
          `Wrong ${shape} emitter metadata`
        );
        const emitters = nodes.filter((node) =>
          new RegExp(`^${shape}_${grip}_LED_Emitter_\\d+$`).test(node.name)
        );
        invariant(
          emitters.length === count,
          `Wrong ${shape} ${grip} emitter count`
        );
        invariant(
          emitters.every((node) =>
            (group.children ?? []).includes(nodes.indexOf(node))
          ),
          "Emitter escaped its build/grip group"
        );
      }
      if (shape === "Triangle") {
        for (const [extra, expected] of [
          ["tka_side_length_m", stations.triangle_side_mm.value / 1000],
          ["tka_sagitta_m", stations.triangle_sagitta_mm.value / 1000],
          ["tka_tube_radius_m", stations.tube_od_mm.value / 2000],
          [
            "tka_sleeve_radius_m",
            (stations.tube_od_mm.value / 2000) * stations.hardware_ratio.value,
          ],
          ["tka_elbow_leg_m", stations.elbow_leg_mm.value / 1000],
        ])
          invariant(
            Math.abs(group.extras?.[extra] - expected) < 1e-9,
            `Triangle station mismatch: ${extra}`
          );
        invariant(
          nodeByName.has(
            `${shape}_${grip}_${build === "Day" ? "Day_Tube" : "LED_Diffuser"}`
          ),
          "Triangle tubing is missing"
        );
      } else {
        invariant(
          group.extras?.tka_removable_center_ring === true,
          "Triquetra centre ring metadata is missing"
        );
        invariant(
          nodeByName.has(`${shape}_${grip}_${group.name}_CenterRing`),
          "Triquetra centre ring is missing"
        );
      }
    }
  }
}

for (const material of [
  "TKA_Triquetra_Day_Tube",
  "TKA_Triangle_Day_Tube",
  "TKA_Shape_LED_Diffuser",
  "TKA_Shape_LED_LightCore",
  "TKA_Shape_Connector",
  "TKA_Shape_LED_1",
]) {
  invariant(
    materialNames.has(material),
    `Required material is missing: ${material}`
  );
}

const emitterCount = nodes.filter((node) =>
  /_LED_Emitter_\d+$/.test(node.name)
).length;
invariant(
  emitterCount === 216,
  `Expected 216 discrete emitters, found ${emitterCount}`
);
invariant(
  (document.meshes ?? []).length >= 120,
  "Shape model lost structural detail"
);
invariant(bytes.length > 200_000, "Shape model is implausibly small");
invariant(bytes.length < 12_000_000, "Shape model exceeds its asset budget");

console.log(
  JSON.stringify(
    {
      file: path.relative(path.join(__dirname, ".."), glbPath),
      bytes: bytes.length,
      nodes: nodes.length,
      meshes: (document.meshes ?? []).length,
      materials: (document.materials ?? []).length,
      discreteEmitters: emitterCount,
    },
    null,
    2
  )
);
