/** Verify the reference MPFB casual-suit PBR maps survive export and intake. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseGlb } = require("../lib/glb-measure.cjs");

const [file, expectedStrengthText, fixtureMode] = process.argv.slice(2);
assert(file, "Usage: verify-mpfb-materials.mjs <character.glb>");
assert(
  fixtureMode === undefined || fixtureMode === "--ao-strength-fixture",
  "Unknown MPFB material verification fixture"
);
const { document } = parseGlb(file);
const outfit = document.materials?.find(
  (material) => material.name === "MPFB Proof.female_casualsuit01"
);
assert(outfit, "Missing the MPFB casual-suit material");
if (fixtureMode !== "--ao-strength-fixture") {
  assert(
    outfit.pbrMetallicRoughness?.baseColorTexture,
    "Suit diffuse texture is missing"
  );
  assert(outfit.normalTexture, "Suit normal texture is missing");
}
assert(outfit.occlusionTexture, "Suit authored AO texture is missing");

const texture = document.textures?.[outfit.occlusionTexture.index];
assert(texture, "Suit AO texture index is invalid");
const imageIndex =
  texture.source ?? texture.extensions?.EXT_texture_webp?.source;
const image = document.images?.[imageIndex];
assert(image, "Suit AO image is missing");
assert.match(
  image.name ?? "",
  /^female_casualsuit01_ao$/,
  "Suit occlusion texture does not use the authored AO map"
);
const expectedStrength =
  expectedStrengthText === undefined ? undefined : Number(expectedStrengthText);
assert(
  expectedStrength === undefined || Number.isFinite(expectedStrength),
  "Expected AO strength must be a number"
);
if (expectedStrength !== undefined) {
  assert.ok(
    Math.abs((outfit.occlusionTexture.strength ?? 1) - expectedStrength) < 1e-6,
    `Suit AO strength is ${outfit.occlusionTexture.strength ?? 1}, expected ${expectedStrength}`
  );
}
console.log(
  JSON.stringify({
    material: outfit.name,
    occlusionImage: image.name,
    mimeType: image.mimeType,
    strength: outfit.occlusionTexture.strength ?? 1,
  })
);
