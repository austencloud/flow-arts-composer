/**
 * Offline desktop asset bundle.
 *
 * The desktop build ships every runtime 3D asset the product loads — scene
 * GLBs, textures, decoder runtimes, animations, characters — so a demo at the
 * park never touches the network. This module owns three things:
 *
 * 1. Discovering what the product loads: a literal scan of `src/` for
 *    `/models|/textures|/animations|/environments|/draco|/basis` paths plus
 *    `${R2_CDN}/...` templates, and the scene-3d character registry.
 * 2. Materializing the bundle under `src-tauri/desktop-assets/` (copied from
 *    `static/`, or downloaded from R2 into `r2/<path>`), with a manifest the
 *    frontend reads at boot to decide which URLs it may rewrite.
 * 3. Verifying a bundle before Tauri packages it.
 *
 * Lab, test, and promo surfaces are excluded on purpose: the frontend passes
 * any URL absent from the manifest through to the network unchanged, so an
 * excluded asset degrades to today's behaviour rather than to a 404.
 */

import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDirectory, "..");
export const defaultBundleDirectory = resolve(
  repoRoot,
  "src-tauri/desktop-assets"
);
export const MANIFEST_FILENAME = "manifest.json";
export const R2_ORIGIN = "https://assets.tkaflowarts.com";
/** Bundle-relative prefix for files mirrored from R2. */
export const R2_BUNDLE_PREFIX = "r2";

const ASSET_ROOTS = [
  "models",
  "textures",
  "animations",
  "environments",
  "draco",
  "basis",
];
const LOCAL_LITERAL = new RegExp(
  `["'\`](\\/(?:${ASSET_ROOTS.join("|")})\\/[A-Za-z0-9_.\\/%-]+?)["'\`?]`,
  "g"
);
const R2_TEMPLATE = /\$\{R2_CDN\}(\/[A-Za-z0-9_./-]+)/g;

/**
 * Source files whose asset literals are NOT bundled. Anything under these is a
 * development harness, a lab, or a one-off tool — not the demo surface.
 */
const EXCLUDED_SOURCE_PATTERNS = [
  /\/routes\/test\//,
  /\/routes\/lab\//,
  /\.test\./,
  /-composer-plugin\.ts$/,
  /\/features\/(?:lab|assemble-lab|contact-lab|skewlab|sticker-lab|themes-lab|loop-labeler|water-traverse|promo-generator)\//,
  /\/scene-composer\//,
  // The resolver's own documentation mentions the roots it rewrites.
  /\/shared\/desktop\//,
];

/**
 * R2 assets referenced through a helper rather than a literal the scan can see
 * (`oceanFloraSceneUrl()` builds the reef path from a file table).
 */
const EXPLICIT_R2_PATHS = [`${R2_BUNDLE_PREFIX}/models/ocean/ocean_flora_scene.glb`];

/**
 * Static directories the scene package resolves at runtime from constructed
 * paths the scan cannot see: prop models (`prop-model-registry`) and every
 * animation pack (locomotion, terminal stops, turns, idles). Expanded to files
 * by `expandStaticDirectories`; every accepted file is required.
 */
const EXPLICIT_STATIC_DIRECTORIES = ["models/props/", "animations/"];

/** Files inside an expanded directory literal that are build inputs, not runtime assets. */
const EXCLUDED_BUNDLE_FILES = [
  /_raw\.glb$/,
  /_decimated\.glb$/,
  /-review\.glb$/,
  /\/candidates\//,
  /\.blend1?$/,
  /\.md$/,
  /\.py$/,
  // Sculpting inputs for the buugeng prop, not a runtime model.
  /\/buugeng-raw\//,
];

function toPosix(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isExcludedSource(filePath) {
  const normalized = toPosix(filePath);
  return EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isExcludedBundleFile(file) {
  return EXCLUDED_BUNDLE_FILES.some((pattern) => pattern.test(toPosix(file)));
}

/** Expand a static directory path (trailing slash) into its accepted bundle files. */
function expandStaticDirectory(staticRoot, directoryPath) {
  const root = join(staticRoot, directoryPath);
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  return walkFiles(root, (file) => !isExcludedBundleFile(file)).map((file) =>
    toPosix(relative(staticRoot, file))
  );
}

function walkFiles(directory, accept) {
  const out = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (accept(full)) out.push(full);
    }
  }
  return out;
}

/**
 * Scan source for asset URL literals. Returns a Map of bundle path (no leading
 * slash; R2 paths prefixed with `r2/`) to the first source file referencing it.
 */
export function scanAssetLiterals(sourceRoot = join(repoRoot, "src")) {
  const hits = new Map();
  const files = walkFiles(
    sourceRoot,
    (file) => /\.(?:ts|js|svelte)$/.test(file) && !isExcludedSource(file)
  );
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const label = toPosix(relative(repoRoot, file));
    for (const match of source.matchAll(LOCAL_LITERAL)) {
      const assetPath = decodeURIComponent(match[1]).replace(/^\//, "");
      if (!hits.has(assetPath)) hits.set(assetPath, label);
    }
    for (const match of source.matchAll(R2_TEMPLATE)) {
      // A trailing slash is a directory prefix inside a template, not a file.
      if (match[1].endsWith("/")) continue;
      const assetPath = posix.join(
        R2_BUNDLE_PREFIX,
        match[1].replace(/^\//, "")
      );
      if (!hits.has(assetPath)) hits.set(assetPath, label);
    }
  }
  return hits;
}

/**
 * Character models live in scene-3d's registry (hard-coded R2 URLs), so they
 * never appear as literals in `src/`. Their picker portraits are app static
 * files (static/images/character-portraits) and ship with the build.
 */
export async function characterAssetPaths() {
  return (await registryAssetPaths()).filter(
    (path) => !EXPLICIT_R2_PATHS.includes(path) && !path.endsWith("/")
  );
}

/** Everything the literal scan cannot see: the character registry plus explicit R2 files. */
export async function registryAssetPaths() {
  const modulePath = join(
    repoRoot,
    "node_modules/@austencloud/scene-3d/dist/lib/config/avatar-definitions.js"
  );
  const module = await import(pathToFileURL(modulePath).href);
  const paths = [];
  for (const definition of module.AVATAR_DEFINITIONS) {
    const url = module.getAvatarModelPath(definition.id);
    if (!url.startsWith(R2_ORIGIN)) continue;
    paths.push(
      posix.join(R2_BUNDLE_PREFIX, url.slice(R2_ORIGIN.length + 1))
    );
  }
  return [...paths, ...EXPLICIT_R2_PATHS, ...EXPLICIT_STATIC_DIRECTORIES];
}

function isR2Path(bundlePath) {
  return bundlePath.startsWith(`${R2_BUNDLE_PREFIX}/`);
}

function r2Url(bundlePath) {
  return `${R2_ORIGIN}/${bundlePath.slice(R2_BUNDLE_PREFIX.length + 1)}`;
}

async function downloadIfMissing(url, target) {
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) throw new Error(`${url} → HTTP ${head.status}`);
  const expected = Number(head.headers.get("content-length") ?? -1);
  if (
    existsSync(target) &&
    expected >= 0 &&
    statSync(target).size === expected
  ) {
    return { bytes: expected, downloaded: false };
  }
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${url} → HTTP ${response.status}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  renameSync(partial, target);
  return { bytes: statSync(target).size, downloaded: true };
}

/** Sibling buffers/images a `.gltf` (as opposed to a `.glb`) references relatively. */
function gltfDependencies(bundlePath, gltfFile) {
  const json = JSON.parse(readFileSync(gltfFile, "utf8"));
  const base = posix.dirname(bundlePath);
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((entry) => entry.uri)
    .filter((uri) => typeof uri === "string" && !uri.startsWith("data:"));
  return uris.map((uri) => posix.join(base, decodeURIComponent(uri)));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

/**
 * Materialize the bundle. Idempotent: existing files with the right size are
 * kept, so re-running after a partial download only fetches what is missing.
 */
export async function collectDesktopAssets({
  bundleDirectory = defaultBundleDirectory,
  staticRoot = join(repoRoot, "static"),
  sourceRoot = join(repoRoot, "src"),
  extraPaths,
  log = console.log,
} = {}) {
  const wanted = scanAssetLiterals(sourceRoot);
  for (const path of extraPaths ?? (await registryAssetPaths())) {
    if (!wanted.has(path)) wanted.set(path, "asset registry");
  }

  const files = [];
  const missing = [];
  const r2Queue = [];

  for (const [bundlePath, source] of wanted) {
    if (isR2Path(bundlePath)) {
      r2Queue.push(bundlePath);
      continue;
    }
    const staticPath = join(staticRoot, bundlePath);
    if (!existsSync(staticPath)) {
      missing.push({ path: bundlePath, source });
      continue;
    }
    if (statSync(staticPath).isDirectory()) {
      files.push(...expandStaticDirectory(staticRoot, bundlePath));
    } else {
      files.push(bundlePath);
    }
  }

  const copied = new Set();
  let copiedBytes = 0;
  for (const bundlePath of files) {
    if (copied.has(bundlePath)) continue;
    copied.add(bundlePath);
    const from = join(staticRoot, bundlePath);
    const to = join(bundleDirectory, bundlePath);
    const size = statSync(from).size;
    if (!existsSync(to) || statSync(to).size !== size) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
    copiedBytes += size;
  }

  const downloaded = new Map();
  let downloadedBytes = 0;
  const pending = [...r2Queue];
  while (pending.length > 0) {
    const batch = [...new Set(pending.splice(0, pending.length))].filter(
      (path) => !downloaded.has(path)
    );
    const results = await mapWithConcurrency(batch, 4, async (bundlePath) => {
      const target = join(bundleDirectory, bundlePath);
      const result = await downloadIfMissing(r2Url(bundlePath), target);
      log(
        `  ${result.downloaded ? "downloaded" : "cached"}  ${bundlePath} (${(
          result.bytes / 1e6
        ).toFixed(1)} MB)`
      );
      return { bundlePath, target, ...result };
    });
    for (const result of results) {
      downloaded.set(result.bundlePath, result.bytes);
      downloadedBytes += result.bytes;
      if (result.bundlePath.endsWith(".gltf")) {
        for (const dependency of gltfDependencies(
          result.bundlePath,
          result.target
        )) {
          if (!downloaded.has(dependency)) pending.push(dependency);
        }
      }
    }
  }

  const entries = [...copied, ...downloaded.keys()].sort().map((path) => ({
    path,
    bytes: statSync(join(bundleDirectory, path)).size,
  }));
  const manifest = {
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    files: entries,
  };
  mkdirSync(bundleDirectory, { recursive: true });
  writeFileSync(
    join(bundleDirectory, MANIFEST_FILENAME),
    JSON.stringify(manifest)
  );

  return {
    bundleDirectory,
    manifest,
    missing,
    copiedBytes,
    downloadedBytes,
    literalCount: wanted.size,
  };
}

/**
 * Paths the bundle MUST contain for the demo surface to be offline: every
 * scene the environment picker offers, both decoder runtimes, every shipped
 * character, and the ocean reef.
 */
export async function requiredDesktopAssetPaths(
  sourceRoot = join(repoRoot, "src"),
  staticRoot = join(repoRoot, "static")
) {
  const manifestSource = readFileSync(
    join(sourceRoot, "lib/shared/3d/scene-boot/scene-asset-manifest.ts"),
    "utf8"
  );
  const required = new Set();
  // Textures in the manifest are opportunistic (some are untracked in git and
  // already 404 in production); models and decoders are load-bearing.
  for (const match of manifestSource.matchAll(
    /["'](\/(?:models|draco|basis)\/[A-Za-z0-9_./-]+)["']/g
  )) {
    required.add(match[1].replace(/^\//, ""));
  }
  for (const path of await registryAssetPaths()) {
    if (path.endsWith("/")) {
      for (const file of expandStaticDirectory(staticRoot, path)) required.add(file);
    } else {
      required.add(path);
    }
  }
  return [...required].sort();
}

export async function verifyDesktopAssets({
  bundleDirectory = defaultBundleDirectory,
  sourceRoot = join(repoRoot, "src"),
  required,
} = {}) {
  const manifestPath = join(bundleDirectory, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    throw new Error(`Desktop asset manifest is missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Desktop asset manifest lists no files.");
  }
  const listed = new Set();
  for (const entry of manifest.files) {
    if (
      typeof entry.path !== "string" ||
      entry.path.includes("..") ||
      entry.path.startsWith("/")
    ) {
      throw new Error(`Manifest has an unsafe path: ${String(entry.path)}`);
    }
    const file = join(bundleDirectory, entry.path);
    if (!existsSync(file)) {
      throw new Error(`Manifest lists a missing file: ${entry.path}`);
    }
    const size = statSync(file).size;
    if (size !== entry.bytes) {
      throw new Error(
        `${entry.path} is ${size} bytes on disk; manifest declares ${entry.bytes}.`
      );
    }
    if (size === 0) throw new Error(`${entry.path} is empty.`);
    listed.add(entry.path);
  }
  const mustHave = required ?? (await requiredDesktopAssetPaths(sourceRoot));
  const absent = mustHave.filter((path) => !listed.has(path));
  if (absent.length > 0) {
    throw new Error(
      `Bundle is missing required offline assets:\n  ${absent.join("\n  ")}`
    );
  }
  return {
    bundleDirectory,
    fileCount: manifest.files.length,
    totalBytes: manifest.totalBytes,
    requiredCount: mustHave.length,
  };
}
