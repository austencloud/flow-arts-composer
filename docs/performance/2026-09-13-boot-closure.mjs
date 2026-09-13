/**
 * Static boot closure from a client build's Vite manifest. Companion to
 * `docs/performance/2026-09-13-startup-boot-graph.md`.
 *
 *   npm run build:fast
 *   node docs/performance/2026-09-13-boot-closure.mjs
 *   node docs/performance/2026-09-13-boot-closure.mjs --top "app /create,/browse (shell)"
 *   node docs/performance/2026-09-13-boot-closure.mjs --json out.json
 *
 * "Closure" here is the transitive set of chunks reachable through STATIC
 * imports from a route's SvelteKit nodes — the set the document modulepreloads
 * and the router must evaluate before it can render. Dynamic imports are
 * deliberately excluded: they are the escape hatch, and counting them would
 * hide whether the escape hatch works.
 *
 * Raw bytes are what the browser parses and evaluates; gzip is what it
 * transfers. They are different costs and must not be added together.
 *
 * NODE INDICES CHANGE. `.svelte-kit/generated/client-optimized/nodes/N.js` is
 * regenerated on every build, so re-derive them before trusting a comparison:
 *   grep -l "routes/+page.svelte"      .svelte-kit/generated/client-optimized/nodes/*.js
 *   grep -l "appPath"                  .svelte-kit/generated/client-optimized/nodes/*.js
 * Node 0 is always the root layout.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const OUT_DIR = path.join(PROJECT_ROOT, ".svelte-kit/output/client");
const GENERATED = path.join(
  PROJECT_ROOT,
  ".svelte-kit/generated/client-optimized"
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(OUT_DIR, ".vite/manifest.json"), "utf8")
);

const sizeCache = new Map();
function sizesOf(file) {
  if (sizeCache.has(file)) return sizeCache.get(file);
  let value = { raw: 0, gz: 0 };
  try {
    const buf = fs.readFileSync(path.join(OUT_DIR, file));
    value = { raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length };
  } catch {
    // A manifest entry with no emitted file contributes nothing.
  }
  sizeCache.set(file, value);
  return value;
}

/** Resolve the generated node whose module re-exports `sourcePath`. */
function nodeFor(sourcePath) {
  for (const file of fs.readdirSync(path.join(GENERATED, "nodes"))) {
    const body = fs.readFileSync(path.join(GENERATED, "nodes", file), "utf8");
    if (body.includes(sourcePath))
      return `.svelte-kit/generated/client-optimized/nodes/${file}`;
  }
  throw new Error(`no generated node re-exports ${sourcePath}`);
}

function closure(entries) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length > 0) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    const entry = manifest[key];
    if (!entry) continue;
    seen.add(key);
    for (const imported of entry.imports ?? []) stack.push(imported);
  }
  return seen;
}

function report(name, entries) {
  const files = [];
  let raw = 0;
  let gz = 0;
  for (const key of closure(entries)) {
    const entry = manifest[key];
    if (!entry?.file?.endsWith(".js")) continue;
    const size = sizesOf(entry.file);
    raw += size.raw;
    gz += size.gz;
    files.push({ key, file: entry.file, ...size });
  }
  files.sort((a, b) => b.raw - a.raw);
  return { name, chunks: files.length, raw, gz, files };
}

const APP = ".svelte-kit/generated/client-optimized/app.js";
const ROOT_LAYOUT = ".svelte-kit/generated/client-optimized/nodes/0.js";
const HOME = nodeFor("src/routes/+page.svelte");
const APP_SHELL_LAYOUT = nodeFor("src/routes/[...appPath]/+layout.ts");
const APP_SHELL_PAGE = nodeFor("src/routes/[...appPath]/+page.svelte");

const ROUTES = {
  "home /": [APP, ROOT_LAYOUT, HOME],
  "app /create,/browse (shell)": [
    APP,
    ROOT_LAYOUT,
    APP_SHELL_LAYOUT,
    APP_SHELL_PAGE,
  ],
  "root layout only": [ROOT_LAYOUT],
};

const format = (n) => n.toLocaleString("en-US");
const results = {};
for (const [name, entries] of Object.entries(ROUTES)) {
  const result = report(name, entries);
  results[name] = result;
  console.log(
    `${name.padEnd(30)} chunks=${String(result.chunks).padStart(4)}  ` +
      `raw=${format(result.raw).padStart(11)}  gzip=${format(result.gz).padStart(10)}`
  );
}

const mode = process.argv[2];
if (mode === "--top") {
  const target = process.argv[3];
  const result = results[target];
  if (!result) throw new Error(`unknown route group: ${target}`);
  console.log(`\nTop chunks in ${result.name}:`);
  for (const file of result.files.slice(0, 30)) {
    console.log(
      `  ${format(file.raw).padStart(9)}  ${format(file.gz).padStart(8)}  ${file.file}`
    );
  }
}
if (mode === "--json") {
  const out = process.argv[3];
  if (!out) throw new Error("--json needs an output path");
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  console.log("wrote", out);
}
