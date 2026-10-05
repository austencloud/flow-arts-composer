#!/usr/bin/env node
/**
 * Copy the built web app into the folder Capgo uploads as the phone app's
 * over-the-air bundle, leaving out what lib/capgo-ota-bundle-policy.mjs rules
 * out. Run after `pnpm run build` and scripts/generate-native-env.mjs.
 *
 *   node scripts/stage-capgo-ota-bundle.mjs [buildDir] [outDir]
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  OTA_REQUIRED_FILES,
  selectOtaBundleFiles,
} from "./lib/capgo-ota-bundle-policy.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const buildDir = resolve(repoRoot, process.argv[2] ?? ".svelte-kit/cloudflare");
const outDir = resolve(repoRoot, process.argv[3] ?? ".svelte-kit/capgo-ota");

function listFiles(root) {
  const files = [];
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(absolutePath);
      else files.push(relative(root, absolutePath).replace(/\\/g, "/"));
    }
  }
  return files.sort();
}

const megabytes = (paths) =>
  (
    paths.reduce((sum, path) => sum + statSync(join(buildDir, path)).size, 0) /
    1024 /
    1024
  ).toFixed(1);

if (!existsSync(buildDir)) {
  console.error(`[capgo-ota] Build directory not found: ${buildDir}`);
  process.exit(1);
}

const { keep, unreferenced, whitespace } = selectOtaBundleFiles(
  listFiles(buildDir),
  (path) => readFileSync(join(buildDir, path), "utf8")
);

const missing = OTA_REQUIRED_FILES.filter((path) => !keep.includes(path));
if (missing.length > 0) {
  console.error(
    `[capgo-ota] Missing ${missing.join(", ")}. Run the build and ` +
      "scripts/generate-native-env.mjs first."
  );
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
for (const path of keep) {
  const destination = join(outDir, path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(buildDir, path), destination);
}

console.log(
  `[capgo-ota] Staged ${keep.length} files (${megabytes(keep)} MiB) in ` +
    relative(repoRoot, outDir).replace(/\\/g, "/")
);
console.log(
  `[capgo-ota] Left out ${unreferenced.length} model files the built app ` +
    `never names (${megabytes(unreferenced)} MiB):`
);
for (const path of unreferenced) console.log(`  ${path}`);
console.log(
  `[capgo-ota] Left out ${whitespace.length} files with spaces in their ` +
    `paths, which Capgo delta uploads reject (${megabytes(whitespace)} MiB):`
);
for (const path of whitespace) console.log(`  ${path}`);
