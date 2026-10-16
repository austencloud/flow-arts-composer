import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSiteData, exportSite } from "./export-site";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const flag = process.argv.indexOf("--source-root");
const sourceRoot = resolve(flag >= 0 ? process.argv[flag + 1]! : repoRoot);
const outputDir = join(repoRoot, "unreal/FlowFest/Content/Data");

const first = await exportSite(sourceRoot);
const second = await buildSiteData(sourceRoot);
assert.equal(JSON.stringify(first), JSON.stringify(second), "same sources must generate identical JSON");
assert.equal(await readFile(join(outputDir, "site.json"), "utf8"), `${JSON.stringify(second, null, 2)}\n`);

assert.equal(first.version, 1);
assert.deepEqual(first.terrain, {
  width: 1025, height: 1025, spacing: 1, originElevation: 270,
  minX: -512, minZ: -512, heightFile: "terrain-height.f32",
  imageryFile: "ortho.webp", canopyFile: "surface-offset.u16", manifestFile: "terrain.manifest.json",
});
assert.equal(first.roads.length, 7);
const loop = first.roads.find((road) => road.id === "lower-campground-loop");
assert.ok(loop);
assert.equal(loop.kind, "internal-drive");
assert.deepEqual(loop.points.slice(0, 3), [[321.1, -108.8], [321.6, -115.6], [328, -128.1]]);
assert.equal(first.roads.find((road) => road.id === "middle-to-lower")?.points.length, 7);
assert.deepEqual(first.landmarks.map((item) => item.id), [
  "gate", "camp-lower", "camp-upper", "camp-car", "parking", "workshop", "fire", "start",
]);
assert.deepEqual(first.landmarks.find((item) => item.id === "camp-upper"), {
  id: "camp-upper", label: "Upper tent camp", x: -62, z: -74,
});
assert.deepEqual(first.landmarks.find((item) => item.id === "fire"), {
  id: "fire", label: "Night fire", x: 89, z: -113.5,
});
assert.equal(first.landmarks.find((item) => item.id === "workshop")?.provisional, true);
assert.equal(first.counts.measuredCanopyTrees, 428);
assert.equal(first.trees.length, 677);
assert.equal(first.backdropTrees.length, 2162);
assert.equal(first.camps.filter((item) => item.type === "canopy").length, 8);
assert.equal(first.camps.filter((item) => item.type === "player-tent").length, 1);
assert.equal(first.camps.filter((item) => item.type !== "canopy").length, 53);
assert.equal(first.vehicles.length, 44);
assert.equal(first.assets.length, 39);
assert.ok(first.grass.length > 20000, "source woodland and clearing grass must be retained");
assert.ok(first.groundLife.length > 0, "source sedge and hazel understory must be retained");
assert.equal(first.ecologyAudit.grassRouteIntrusions, 0);
assert.equal(first.ecologyAudit.groundLifeRouteIntrusions, 0);
assert.equal(first.groundSurface.file, "ground-family-mask.rgba");
assert.equal(first.groundSurface.width, 512);
assert.equal(first.groundSurface.height, 512);
assert.equal(first.groundSurface.audit.sourceRouteCount, first.roads.length);
assert.ok(first.groundSurface.audit.lowerLoopPaintedPixels > 0);
const groundMask = await readFile(join(outputDir, first.groundSurface.file));
assert.equal(groundMask.length, first.groundSurface.width * first.groundSurface.height * 4);
assert.ok(groundMask.includes(255), "registered source mask must include painted families");
assert.deepEqual(new Set(first.grass.map((item) => item.species)), new Set(["summer-sward", "woodland-grass"]));
for (const item of [...first.grass, ...first.groundLife]) {
  assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.z));
  assert.ok(item.x >= -512 && item.x <= 512 && item.z >= -512 && item.z <= 512);
}

const families = new Set(first.assets.map((asset) => asset.family));
for (const tree of [...first.trees, ...first.backdropTrees]) {
  assert.ok(families.has(tree.family), `missing asset for ${tree.family}`);
  assert.ok(Number.isFinite(tree.x) && Number.isFinite(tree.y) && Number.isFinite(tree.z));
  assert.ok(tree.height > 0 && tree.scale > 0);
  assert.ok(tree.x >= -512 && tree.x <= 512 && tree.z >= -512 && tree.z <= 512);
}
for (const road of first.roads) {
  assert.ok(road.width > 0 && road.points.length >= 2);
  for (const [x, z] of road.points) assert.ok(Number.isFinite(x) && Number.isFinite(z));
}
for (const camp of first.camps) {
  assert.ok(Number.isFinite(camp.x) && Number.isFinite(camp.y) && Number.isFinite(camp.z));
  assert.ok(Number.isFinite(camp.rotation) && camp.scale > 0);
}
for (const name of ["terrain-height.f32", "surface-offset.u16", "terrain.manifest.json", "ortho.webp"]) {
  const source = await readFile(join(sourceRoot, "static/data/flow-fest-sim", name));
  const copy = await readFile(join(outputDir, name));
  assert.deepEqual(copy, source, `${name} copy must be byte-for-byte identical`);
}
console.log("Flow Fest site export: deterministic, current plan coordinates and counts verified.");
