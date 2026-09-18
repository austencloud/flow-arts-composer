// Run after build-star-fan.py to publish its transparent picker preview.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const output = "static/images/props/build-previews/fan-star-complete.webp";
await sharp(fileURLToPath(new URL("scratchpad/star-fan/preview.png", root)))
  .webp({ quality: 88 })
  .toFile(fileURLToPath(new URL(output, root)));
const sources = [
  "scripts/assets/star-fire-reference.json",
  "scripts/build-star-fan.py",
  "static/models/props/fan-star.glb",
  "static/images/props/appearances/fan-star.svg",
];
const sourceSha256 = Object.fromEntries(
  await Promise.all(
    sources.map(async (path) => [
      path,
      createHash("sha256")
        .update(await readFile(new URL(path, root)))
        .digest("hex"),
    ])
  )
);
await writeFile(
  new URL(output.replace(".webp", ".provenance.json"), root),
  JSON.stringify(
    {
      referenceVersion: 1,
      source: "https://renegadejuggling.com/products/fire-fan-star",
      output: { path: output, width: 640, height: 440 },
      sourceSha256,
    },
    null,
    2
  ) + "\n"
);
