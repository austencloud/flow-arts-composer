#!/usr/bin/env node
/**
 * Optimise the Blender-built lunar outpost (scripts/build-moon-outpost.py) for
 * the web. The model carries no textures (every surface is shaded at runtime),
 * so this is geometry only: dedupe, prune, weld, then meshopt quantisation and
 * compression, which the viewer already decodes for every other scene.
 *
 * Node names are kept: the runtime finds the terrain, the habitat and the
 * templates it places around the pad by name, so no flatten or join here.
 */
import { createRequire } from "node:module";
import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const INPUT = resolve("static/models/cosmic/moon-outpost_raw.glb");
const OUTPUT = resolve("static/models/cosmic/moon-outpost.glb");

const cliPackage = resolve(
  "node_modules/.pnpm/@gltf-transform+cli@4.3.0/node_modules/@gltf-transform/cli/package.json",
);
const requireFromCli = createRequire(cliPackage);
const load = (id) => import(pathToFileURL(requireFromCli.resolve(id)).href);
const { NodeIO, PropertyType } = await load("@gltf-transform/core");
const { ALL_EXTENSIONS } = await load("@gltf-transform/extensions");
const { dedup, prune, weld, meshopt } = await load("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder } = await load("meshoptimizer");

if (!existsSync(INPUT)) {
  console.error(`Input not found: ${INPUT}. Run scripts/build-moon-outpost.py first.`);
  process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
const document = await io.read(INPUT);

// The tracks and bootprints are shaded from their UVs (across and along the
// tread, one sole per quad), and the runtime tells their materials apart by
// name. So materials are never merged, and prune keeps vertex attributes;
// every other mesh then drops its unused UVs here to stay small.
const KEEPS_UV = new Set(["MO_RoverTracks", "MO_Bootprints"]);
const dropUnusedUvs = () => (doc) => {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || KEEPS_UV.has(node.getName())) continue;
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (semantic.startsWith("TEXCOORD_")) primitive.setAttribute(semantic, null);
      }
    }
  }
};

await document.transform(
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
  dropUnusedUvs(),
  prune({ keepLeaves: true, keepAttributes: true }),
  weld(),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(OUTPUT, document);

const mb = (path) => (statSync(path).size / 1024 / 1024).toFixed(2);
console.log(`Input:  ${INPUT} (${mb(INPUT)} MB)`);
console.log(`Output: ${OUTPUT} (${mb(OUTPUT)} MB)`);
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const vertices = mesh
    .listPrimitives()
    .reduce((sum, primitive) => sum + (primitive.getAttribute("POSITION")?.getCount() ?? 0), 0);
  console.log(`  ${node.getName().padEnd(24)} ${String(vertices).padStart(7)} vertices`);
}
