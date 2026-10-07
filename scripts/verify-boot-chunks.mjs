/**
 * Guard the emitted startup graph, including Rollup's small-chunk merges.
 * Source import tests cannot see a lazy module merged into a startup chunk.
 * Run after a production build: npm run verify:boot-chunks
 * Compare another build: node scripts/verify-boot-chunks.mjs --manifest <file>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { staticClosure } from "./verify-public-firebase.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--manifest")) {
  throw new Error("usage: verify-boot-chunks.mjs [--manifest <file>]");
}
const manifest = JSON.parse(
  fs.readFileSync(
    args[1] ?? path.join(root, ".svelte-kit/output/client/.vite/manifest.json"),
    "utf8"
  )
);
const entries = ["entry/app", "entry/start", "nodes/0"].map((name) => {
  const keys = Object.keys(manifest).filter(
    (key) => manifest[key].isEntry && manifest[key].name === name
  );
  if (keys.length !== 1)
    throw new Error(`expected one startup entry named ${name}`);
  return keys[0];
});
const lazyChunks = [
  "vendor-three",
  "vendor-backgrounds",
  "vendor-media-export",
  "vendor-audio-inference",
];
const failures = [];
const closure = staticClosure(manifest, entries);
for (const key of closure) {
  if (!manifest[key]) failures.push(`missing startup manifest entry: ${key}`);
}
for (const name of lazyChunks) {
  const keys = Object.keys(manifest).filter(
    (key) => manifest[key].name === name
  );
  if (keys.length === 0) {
    failures.push(
      `missing ${name}; update this contract if the chunk was renamed`
    );
  }
  for (const key of keys) {
    if (!closure.has(key)) continue;
    const importers = [...closure].filter((parent) =>
      manifest[parent]?.imports?.includes(key)
    );
    failures.push(
      `${name} loads at startup, imported by ${importers.join(", ")}`
    );
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Startup graph: ${closure.size} chunks; Three, backgrounds, media export and audio inference stay lazy.`
  );
}
