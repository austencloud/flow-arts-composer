/**
 * Guard the emitted startup graph, including the bundler's small-chunk merges.
 * Source import tests cannot see a lazy module merged into a startup chunk.
 * Run after a production build: npm run verify:boot-chunks
 * Compare another build: add --manifest <file> --generated-dir <client-optimized>
 * Both inputs must come from that same build; generated node indices can change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  GENERATED_CLIENT_DIR,
  startEntryKeys,
  staticClosure,
} from "./verify-public-firebase.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    "generated-dir": { type: "string" },
  },
});
if (Boolean(values.manifest) !== Boolean(values["generated-dir"]))
  throw new Error("alternate builds need both --manifest and --generated-dir");
const manifest = JSON.parse(
  fs.readFileSync(
    values.manifest ??
      path.join(root, ".svelte-kit/output/client/.vite/manifest.json"),
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
entries.push(...startEntryKeys(manifest, entries[1]).slice(1));
const generatedNodes = path.join(
  values["generated-dir"] ?? path.join(root, GENERATED_CLIENT_DIR),
  "nodes"
);
const generatedSources = fs
  .readdirSync(generatedNodes)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    file,
    source: fs.readFileSync(path.join(generatedNodes, file), "utf8"),
  }));
for (const sourcePath of [
  "src/routes/+page.svelte",
  "src/routes/[...appPath]/+layout.ts",
  "src/routes/[...appPath]/+page.svelte",
]) {
  const nodes = generatedSources.filter(({ source }) =>
    source.includes(sourcePath)
  );
  if (nodes.length !== 1)
    throw new Error(`expected one generated node for ${sourcePath}`);
  const name = `nodes/${path.basename(nodes[0].file, ".js")}`;
  const keys = Object.keys(manifest).filter(
    (key) => manifest[key].isEntry && manifest[key].name === name
  );
  if (keys.length !== 1)
    throw new Error(`expected one manifest entry for ${sourcePath} (${name})`);
  entries.push(keys[0]);
}
const lazyChunks = [
  "vendor-three",
  "vendor-backgrounds",
  "vendor-media-export",
  "vendor-audio-inference",
  "vendor-video-editor",
];
// A name alone proves nothing: on 2026-10-22 the bundler had moved Three and
// the backgrounds into a chunk with another name, left `vendor-backgrounds`
// at 11 KB, and this check passed while startup loaded 4.4 MB. Each lazy
// chunk must still hold its packages, and the whole startup graph has a
// ceiling. docs/performance/2026-10-22-boot-measurements.md
const MIN_LAZY_CHUNK_BYTES = 100_000;
const MAX_STARTUP_RAW_BYTES = 3_000_000;
const clientDir = values.manifest
  ? path.join(path.dirname(values.manifest), "..")
  : path.join(root, ".svelte-kit/output/client");
const bytesOf = (key) => {
  try {
    return fs.statSync(path.join(clientDir, manifest[key].file)).size;
  } catch {
    return 0;
  }
};
const failures = [];
const closure = staticClosure(manifest, entries);
for (const key of closure) {
  if (!manifest[key]) failures.push(`missing startup manifest entry: ${key}`);
}
const startupBytes = [...closure]
  .filter((key) => manifest[key]?.file?.endsWith(".js"))
  .reduce((sum, key) => sum + bytesOf(key), 0);
if (startupBytes > MAX_STARTUP_RAW_BYTES) {
  const largest = [...closure]
    .filter((key) => manifest[key]?.file?.endsWith(".js"))
    .sort((a, b) => bytesOf(b) - bytesOf(a))
    .slice(0, 5)
    .map((key) => `${manifest[key].name ?? key} ${bytesOf(key)}`);
  failures.push(
    `startup graph is ${startupBytes} raw bytes, over ${MAX_STARTUP_RAW_BYTES}; largest: ${largest.join(", ")}`
  );
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
  const size = keys.reduce((sum, key) => sum + bytesOf(key), 0);
  if (keys.length > 0 && size < MIN_LAZY_CHUNK_BYTES) {
    failures.push(
      `${name} is only ${size} bytes; its packages were bundled elsewhere`
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
    `Startup graph (common, home and app shell): ${closure.size} chunks, ${startupBytes} raw bytes; Three, backgrounds, media export, audio inference and the video editor stay lazy.`
  );
}
