// Which files of the web build go into the phone app's over-the-air (Capgo)
// bundle. The web deploy trim (deploy-asset-trim-policy.js) has already run
// inside `pnpm run build`; these rules apply on top of it, only to the copy
// that scripts/stage-capgo-ota-bundle.mjs hands to Capgo.
//
// 1. Capgo zips the whole folder before every upload and refuses anything
//    over 1 GiB, delta uploads included. static/models also holds review,
//    proof and candidate models that no shipped code loads, so a model file
//    stays out unless the built app names it.
// 2. Capgo's delta upload rejects any path that contains whitespace.

/** Only files under this prefix can be left out for being unreferenced. */
export const OTA_PRUNABLE_PREFIX = "models/";

/**
 * Small text files beside the models (manifests, credits, licenses) always
 * ride along. They count as references only when the app reaches them.
 */
export const OTA_ALWAYS_KEPT_MODEL_EXTENSIONS = Object.freeze([
  ".json",
  ".md",
  ".txt",
]);

/** Text files whose contents can name a static asset. */
export const OTA_REFERENCE_TEXT_EXTENSIONS = Object.freeze([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".webmanifest",
  ".txt",
  ".xml",
  ".svg",
  ".gltf",
]);

/**
 * Cloudflare routing and Worker files. `_routes.json` lists `/models/*`
 * itself, which would make every model look referenced, and the phone never
 * reads any of them.
 */
export const OTA_REFERENCE_IGNORED_FILES = Object.freeze([
  "_worker.js",
  "_routes.json",
  "_headers",
  "_redirects",
]);

/** Must be present: the phone shell cannot start without them. */
export const OTA_REQUIRED_FILES = Object.freeze(["index.html", "_app/env.js"]);

// A literal path under models/ up to the first character that cannot be part
// of one. Template and concatenated paths stop at the interpolation, so their
// fixed start (`models/museum/kit`) keeps everything beneath it.
const MODEL_PATH_FRAGMENT = /models\/[\w\-.%~+/]*/g;
const FILE_NAME_TOKEN = /[\w\-.%~+]+\.[A-Za-z0-9]{1,8}/g;

const extensionOf = (relativePath) => {
  const name = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
};

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** @param {string} relativePath path in the build output, `/`-separated */
export const hasWhitespace = (relativePath) => /\s/.test(relativePath);

/** @param {string} relativePath */
export const isReferenceText = (relativePath) =>
  OTA_REFERENCE_TEXT_EXTENSIONS.includes(extensionOf(relativePath));

/**
 * @typedef {{ prefixes: Set<string>, fileNames: Set<string> }} AssetReferences
 */

/** @returns {AssetReferences} */
export const createAssetReferences = () => ({
  prefixes: new Set(),
  fileNames: new Set(),
});

/**
 * Record every models/ path fragment and file name a text file mentions.
 * @param {string} text
 * @param {AssetReferences} references
 */
export function collectAssetReferences(text, references) {
  for (const [fragment] of text.matchAll(MODEL_PATH_FRAGMENT)) {
    references.prefixes.add(decode(fragment));
  }
  for (const [token] of text.matchAll(FILE_NAME_TOKEN)) {
    references.fileNames.add(decode(token));
  }
  return references;
}

/**
 * @param {string} relativePath
 * @param {AssetReferences} references
 */
export function isAssetReferenced(relativePath, { prefixes, fileNames }) {
  const fileName = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  if (fileNames.has(fileName)) return true;
  for (const prefix of prefixes) {
    if (relativePath.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Split the build output into what the phone bundle keeps and what it leaves
 * out, with the reason.
 *
 * @param {string[]} relativePaths every file in the build output
 * @param {(relativePath: string) => string} readText
 */
export function selectOtaBundleFiles(relativePaths, readText) {
  const whitespace = relativePaths.filter(hasWhitespace);
  const candidates = relativePaths.filter((path) => !hasWhitespace(path));
  const isModelFile = (path) => path.startsWith(OTA_PRUNABLE_PREFIX);

  const references = createAssetReferences();
  for (const path of candidates) {
    if (isModelFile(path) || OTA_REFERENCE_IGNORED_FILES.includes(path)) {
      continue;
    }
    if (isReferenceText(path))
      collectAssetReferences(readText(path), references);
  }

  // A reached glTF or manifest can name more files (a .gltf names its .bin
  // and textures), so repeat until a pass reaches nothing new.
  const modelFiles = candidates.filter(isModelFile);
  const reached = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const path of modelFiles) {
      if (reached.has(path) || !isAssetReferenced(path, references)) continue;
      reached.add(path);
      grew = true;
      if (isReferenceText(path))
        collectAssetReferences(readText(path), references);
    }
  }

  const isKept = (path) =>
    !isModelFile(path) ||
    reached.has(path) ||
    OTA_ALWAYS_KEPT_MODEL_EXTENSIONS.includes(extensionOf(path));

  return {
    keep: candidates.filter(isKept),
    unreferenced: candidates.filter((path) => !isKept(path)),
    whitespace,
  };
}
