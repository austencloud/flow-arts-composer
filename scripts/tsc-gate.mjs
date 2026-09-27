#!/usr/bin/env node
/**
 * Plain-`tsc` gate for the app's own TypeScript.
 *
 * WHY THIS EXISTS
 *
 * `svelte-check` is the project's headline type gate, but it does not stand in
 * for `tsc`. It gives TypeScript's language service a 20 MB budget for
 * non-TypeScript files, and this app's `.svelte` files have been over it since
 * 2026-08-01. Past that budget the service silently drops every project file,
 * so `npm run check` checks only declaration files and still reports
 * "0 errors". `npm run check:full` uses `tsconfig.check-full.json` to lift the
 * cap. A plain compiler pass over the same `tsconfig.json` is cheap, has no
 * such cap, and is the thing that keeps the `.ts` files in `src/` and `tests/`
 * honest while `npm run check` cannot see them.
 *
 * WHY IT FILTERS
 *
 * `tsconfig.json` uses `moduleResolution: "Bundler"` with the `svelte` export
 * condition, so some dependencies resolve to their raw `.ts` sources instead of
 * `.d.ts` files. `skipLibCheck` does not skip those, and this app's stricter
 * flags (`noUncheckedIndexedAccess`, `strict`) then surface errors inside
 * `node_modules` and inside sibling workspace packages that those packages
 * never opted into and that this repo cannot fix from here. Workspace packages
 * have their own gate — `pnpm run build:packages` builds them under their own
 * tsconfig, and CI already runs it.
 *
 * So the gate reports every diagnostic and fails only on the ones this
 * tsconfig actually owns: files under `src/` and `tests/` in this checkout.
 * Anything else is printed as context, never as a build failure.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OWNED_PREFIXES = ["src/", "tests/"];

/** `path(line,col): error TS1234: message` — tsc's non-pretty diagnostic line. */
const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): /;

function ownsFile(rawPath) {
  const path = rawPath.replace(/\\/g, "/");
  // A relative path that climbs out of the repo, or lands in node_modules, is
  // someone else's source reached through resolution — not ours to gate on.
  if (path.startsWith("../") || path.includes("node_modules/")) return false;
  return OWNED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const result = spawnSync(
  process.execPath,
  [
    resolve(ROOT, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--incremental",
    "false",
    "--pretty",
    "false",
    "-p",
    resolve(ROOT, "tsconfig.json"),
  ],
  { cwd: ROOT, encoding: "utf8" }
);

if (result.error) {
  console.error(`tsc could not be started: ${result.error.message}`);
  process.exit(1);
}

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const owned = [];
const foreign = [];

for (const line of output.split(/\r?\n/)) {
  const match = DIAGNOSTIC.exec(line);
  if (!match) continue;
  (ownsFile(match[1]) ? owned : foreign).push(line);
}

if (foreign.length > 0) {
  console.log(
    `Ignoring ${foreign.length} pre-existing diagnostic(s) outside src/ and tests/ ` +
      `(dependencies and sibling workspace packages have their own gates):`
  );
  for (const line of foreign) console.log(`  ${line}`);
  console.log("");
}

if (owned.length > 0) {
  console.error(`tsc found ${owned.length} error(s) in src/ and tests/:`);
  for (const line of owned) console.error(line);
  process.exit(1);
}

// A non-zero tsc exit with nothing owned means either the foreign diagnostics
// above or a compiler-level failure. Only the second is a gate failure, and it
// leaves no parseable diagnostic line behind.
if (result.status !== 0 && foreign.length === 0) {
  console.error("tsc failed without emitting a parseable diagnostic:");
  console.error(output.trim() || `(no output, exit code ${result.status})`);
  process.exit(1);
}

console.log("tsc: 0 errors in src/ and tests/.");
