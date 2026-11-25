#!/usr/bin/env node
/**
 * Copy the built web app into the folder Capgo uploads as the phone app's
 * over-the-air bundle, leaving out what lib/capgo-ota-bundle-policy.mjs rules
 * out. Capgo also drops 0-byte files, so empty code files are staged with a
 * short comment (the build folder is never touched), other empty files are
 * reported, and the run fails if a code file the app names would be missing.
 * Run after `pnpm run build` and scripts/generate-native-env.mjs.
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
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  OTA_BUNDLE_BUDGET_BYTES,
  OTA_EMPTY_FILE_PLACEHOLDER,
  OTA_REQUIRED_FILES,
  findMissingNamedCodeFiles,
  planEmptyFileHandling,
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

const bytesOf = (paths) =>
  paths.reduce((sum, path) => sum + statSync(join(buildDir, path)).size, 0);
const megabytes = (paths) => (bytesOf(paths) / 1024 / 1024).toFixed(1);

if (!existsSync(buildDir)) {
  console.error(`[capgo-ota] Build directory not found: ${buildDir}`);
  process.exit(1);
}

const buildFiles = listFiles(buildDir);
const { keep, unreferenced, whitespace, references } = selectOtaBundleFiles(
  buildFiles,
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

const keptBytes = bytesOf(keep);
if (keptBytes > OTA_BUNDLE_BUDGET_BYTES) {
  const byFolder = new Map();
  for (const path of keep) {
    const folder = path.split("/").slice(0, 2).join("/");
    byFolder.set(
      folder,
      (byFolder.get(folder) ?? 0) + statSync(join(buildDir, path)).size
    );
  }
  console.error(
    `[capgo-ota] The bundle would be ${megabytes(keep)} MiB, over the ` +
      `${OTA_BUNDLE_BUDGET_BYTES / 1024 / 1024} MiB budget that keeps its ` +
      "zip under Capgo's 1 GiB cap. Largest folders:"
  );
  for (const [folder, bytes] of [...byFolder]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)) {
    console.error(`  ${(bytes / 1024 / 1024).toFixed(1)} MiB  ${folder}`);
  }
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
for (const path of keep) {
  const destination = join(outDir, path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(buildDir, path), destination);
}

// Sizes come from the staged copy on disk, after any filling below.
const stagedSizes = () =>
  new Map(keep.map((path) => [path, statSync(join(outDir, path)).size]));

const { fill, dropped } = planEmptyFileHandling(stagedSizes());
for (const path of fill) {
  writeFileSync(join(outDir, path), OTA_EMPTY_FILE_PLACEHOLDER);
}
if (fill.length > 0) {
  console.log(
    `[capgo-ota] Filled ${fill.length} empty code files so Capgo keeps them:`
  );
  for (const path of fill) console.log(`  ${path}`);
}
if (dropped.length > 0) {
  console.warn(
    `[capgo-ota] Warning: ${dropped.length} empty files are not code, so ` +
      "Capgo will leave them out of the bundle:"
  );
  for (const path of dropped) console.warn(`  ${path}`);
}

const missingCode = findMissingNamedCodeFiles(
  buildFiles,
  stagedSizes(),
  references
);
if (missingCode.length > 0) {
  console.error(
    `[capgo-ota] ${missingCode.length} code files the built app names would ` +
      "be missing or empty in the phone bundle, so it could not finish loading:"
  );
  for (const path of missingCode) console.error(`  ${path}`);
  process.exit(1);
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
