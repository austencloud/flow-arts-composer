/**
 * Builds dist/: one ESM bundle that runs in a browser or Node, with the
 * unpublished @tka/render-core bundled in, plus standalone declarations.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

rmSync(dist, { recursive: true, force: true });

await esbuild.build({
  entryPoints: [join(here, "src/index.ts")],
  outfile: join(dist, "index.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  sourcemap: true,
  alias: { "@tka/render-core": join(here, "../render-core/src/index.ts") },
  // fsArtSource's dynamic import stays a runtime import, reached only on Node.
  external: ["node:fs"],
  logLevel: "warning",
});

// Declarations are emitted for the whole program (render-core included), then
// only the files the public entry reaches are kept.
const typesTmp = join(here, ".types-tmp");
rmSync(typesTmp, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json", "--outDir", typesTmp],
  { cwd: here, stdio: "inherit" }
);
const typesSrc = join(typesTmp, "tka-pictograph", "src");
const pending = ["index.d.ts"];
const kept = new Set();
while (pending.length) {
  const file = pending.pop();
  if (kept.has(file)) continue;
  kept.add(file);
  const text = readFileSync(join(typesSrc, file), "utf-8");
  for (const [, spec] of text.matchAll(/from\s+["']([^"']+)["']/g)) {
    if (!spec.startsWith("./")) throw new Error(`${file} imports ${spec}; public types must stay standalone`);
    pending.push(spec.slice(2).replace(/\.js$/, ".d.ts"));
  }
}
for (const file of kept) copyFileSync(join(typesSrc, file), join(dist, file));
rmSync(typesTmp, { recursive: true, force: true });

// The bundle must not need Node, and the declarations must not name unpublished packages.
const bundle = readFileSync(join(dist, "index.js"), "utf-8");
const nodeImports = bundle.match(/(?:from\s*|import\s*\()\s*["'](?:node:)?(?:fs|path|url|child_process)["']/g) ?? [];
const allowed = nodeImports.filter((m) => /import\s*\(\s*["']node:fs["']/.test(m));
if (nodeImports.length !== allowed.length || allowed.length !== 1) {
  throw new Error(`Bundle imports Node modules: ${nodeImports.join(", ")}`);
}
for (const file of readdirSync(dist).filter((f) => f.endsWith(".d.ts"))) {
  if (readFileSync(join(dist, file), "utf-8").includes("@tka/")) {
    throw new Error(`${file} refers to an unpublished @tka package`);
  }
}
console.log("tka-pictograph: built dist/");
