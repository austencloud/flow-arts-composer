#!/usr/bin/env node
/**
 * Trim the Cloudflare Pages build output:
 * 1. Remove entire directories that are dev-only or served from R2/CDN
 * 2. Remove individual files larger than the 25 MiB per-file limit
 *
 * The rules live in deploy-asset-trim-policy.js. The client build already
 * skips matching static/ files while copying them, so this sweep normally
 * finds little; it stays as the last check on everything the build wrote.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { normalizeCloudflareRouteRules } from "./cloudflare-route-rules.js";
import {
  DEPLOY_DIRECTORY_FILE_ALLOWLISTS,
  DEPLOY_EXCLUDED_DIRECTORIES,
  DEPLOY_EXCLUDED_FILES,
  DEPLOY_MAX_FILE_BYTES,
  getDisallowedDeployEntries,
  isRawSourceModel,
} from "./deploy-asset-trim-policy.js";

const OUTPUT_DIR = ".svelte-kit/cloudflare";

function normalizeRoutesFile() {
  const routesPath = join(OUTPUT_DIR, "_routes.json");
  if (!existsSync(routesPath)) return;

  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  const normalized = normalizeCloudflareRouteRules(routes);
  const removed =
    routes.include.length +
    routes.exclude.length -
    normalized.include.length -
    normalized.exclude.length;

  if (removed === 0) return;

  writeFileSync(routesPath, `${JSON.stringify(normalized, null, 2)}\n`);
  console.log(
    `  Removed ${removed} overlapping Cloudflare route rule${removed === 1 ? "" : "s"}`
  );
}

let rawRemovedBytes = 0;

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else {
      const size = statSync(fullPath).size;
      if (isRawSourceModel(entry.name)) {
        console.log(
          `  Removing raw source ${fullPath} (${(size / 1024 / 1024).toFixed(1)} MiB)`
        );
        rawRemovedBytes += size;
        unlinkSync(fullPath);
      } else if (size > DEPLOY_MAX_FILE_BYTES) {
        console.log(
          `  Removing ${fullPath} (${(size / 1024 / 1024).toFixed(1)} MiB)`
        );
        unlinkSync(fullPath);
      }
    }
  }
}

console.log(`Trimming deploy output in ${OUTPUT_DIR}...`);
normalizeRoutesFile();

for (const dir of DEPLOY_EXCLUDED_DIRECTORIES) {
  const fullPath = join(OUTPUT_DIR, dir);
  if (existsSync(fullPath)) {
    const files = readdirSync(fullPath, { recursive: true });
    rmSync(fullPath, { recursive: true, force: true });
    console.log(`  Removed ${fullPath}/ (${files.length} entries)`);
  }
}

for (const file of DEPLOY_EXCLUDED_FILES) {
  const fullPath = join(OUTPUT_DIR, file);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
    console.log(`  Removed ${fullPath}`);
  }
}

// Autumn's floor directory is a texture workshop, not a runtime bundle. The
// GLB carries the baked macro atlas, and the browser fetches exactly one loose
// detail map. An allowlist prevents future bake outputs from silently shipping
// just because Vite copied `static/` into the Cloudflare artifact.
for (const [directory, allowedEntries] of Object.entries(
  DEPLOY_DIRECTORY_FILE_ALLOWLISTS
)) {
  const fullPath = join(OUTPUT_DIR, directory);
  if (!existsSync(fullPath)) continue;

  const entries = readdirSync(fullPath, { withFileTypes: true });
  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
  const disallowed = getDisallowedDeployEntries(
    entries.map((entry) => entry.name),
    allowedEntries
  );
  let removedBytes = 0;
  for (const entryName of disallowed) {
    const entry = entriesByName.get(entryName);
    if (!entry) continue;
    const entryPath = join(fullPath, entryName);
    if (entry.isDirectory()) {
      rmSync(entryPath, { recursive: true, force: true });
    } else {
      removedBytes += statSync(entryPath).size;
      unlinkSync(entryPath);
    }
  }
  console.log(
    `  Kept ${allowedEntries.length} runtime file${allowedEntries.length === 1 ? "" : "s"} in ${fullPath}; removed ${disallowed.length} build entr${disallowed.length === 1 ? "y" : "ies"} (${(removedBytes / 1024 / 1024).toFixed(1)} MiB)`
  );
}

console.log("Trimming raw source models and files > 25 MiB...");
walk(OUTPUT_DIR);
if (rawRemovedBytes > 0) {
  console.log(
    `  Raw source models removed: ${(rawRemovedBytes / 1024 / 1024).toFixed(1)} MiB`
  );
}
console.log("Done.");
