// Run after build-flat-grip-fan.py to publish its transparent picker preview.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const output = "static/images/props/build-previews/fan-flat-grip-complete.webp";
await sharp(fileURLToPath(new URL("scratchpad/flat-grip/preview.png", root)))
  .webp({ quality: 88 })
  .toFile(fileURLToPath(new URL(output, root)));
const sources = [
  "scripts/assets/flat-grip-fire-reference.json",
  "scripts/build-flat-grip-fan.py",
  "static/models/props/fan-flat-grip.glb",
  "static/images/props/appearances/fan-flat-grip.svg",
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
      source: "https://forgedfans.com/products/flat-grip-fire-fans",
      output: { path: output, width: 640, height: 440 },
      sourceSha256,
    },
    null,
    2
  ) + "\n"
);
