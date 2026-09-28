// What in static/ must never reach the Cloudflare Pages artifact. Two places
// apply it: the client build skips these entries while it copies static/
// (src/config/vite-plugin-deploy-static-copy.ts), and
// scripts/trim-deploy-assets.js deletes whatever still matches from
// .svelte-kit/cloudflare as the final sweep. Paths are relative to static/,
// which mirrors the deploy root.

/** Cloudflare Pages rejects any single file larger than 25 MiB. */
export const DEPLOY_MAX_FILE_BYTES = 25 * 1024 * 1024;

// guides/ stays: 3 downloadable PDFs (~28 MB total), each under the 25 MiB
// per-file cap. They were swept in with the May-13 deploy-size trim but are
// user-facing downloads linked from the landing page (/guides/level-N.pdf).
/** Top-level directories that are dev-only or served from R2/CDN. */
export const DEPLOY_EXCLUDED_DIRECTORIES = Object.freeze([
  "screenshots",
  "thumbnails",
  // Design sketches are throwaway HTML mockups reviewed at
  // localhost:5173/sketches/<file>.html during design work. Vite serves them
  // from static/ in dev, so that workflow is untouched — but static/ copies
  // verbatim into the deploy output, which published 32 internal mockups on
  // tkaflowarts.com/sketches/. They are not route-gated, so no feature flag or
  // load guard can reach them; dropping them here is the only seam.
  "sketches",
  // Silero VAD + ONNX Runtime WASM (~16 MB) for the pronunciation corpus
  // recorder in the Lab. That tool records Austen at a desk with a microphone
  // and writes the corpus to a local folder through the File System Access
  // API — it has no reason to run on tkaflowarts.com, and the ort wasm alone
  // is 13 MB. Vendored into static/ (rather than loaded from a CDN) so a
  // forty-minute recording session cannot be interrupted by a third-party
  // host, which is a localhost concern only.
  "vad",
]);

/** Build-output directories whose runtime contents are deliberately tiny. */
export const DEPLOY_DIRECTORY_FILE_ALLOWLISTS = Object.freeze({
  "textures/autumn-floor": Object.freeze(["ground-detail-modulation.ktx2"]),
});

/** Local-only assets that must never survive into a deploy artifact. */
export const DEPLOY_RESTRICTED_FILES = Object.freeze([
  // The free MetaPerson export is licensed for evaluation. Local development
  // may serve it from static/, but a build launched on that machine cannot
  // publish the GLB.
  "models/avatars/bakeoff/personal-metaperson.glb",
]);

// Individual dev-only files that live in static/ and would otherwise ship.
// Same reasoning as the sketches directory above.
//
// The Autumn model entries are Blender/forest BUILD INPUTS, not runtime assets.
// They are trimmed from the deploy output rather than deleted from the repo
// because three of them are still needed on disk: forest-tree-layout.json
// consumes autumn-snag.glb, golden-larch.glb and autumn-willow.glb as
// sourcePath inputs to the forest builder.
export const DEPLOY_EXCLUDED_FILES = Object.freeze([
  "element-icons-preview.html",
  ...DEPLOY_RESTRICTED_FILES,
  // Optimized per-asset GLBs. The Autumn builder imports the *_raw* variants;
  // these optimized copies are only consumed by other builders, offline.
  "models/autumn/hero-tree-a.glb",
  "models/autumn/hero-tree-b.glb",
  "models/autumn/fallen-log.glb",
  "models/autumn/fern-clump.glb",
  "models/autumn/mushroom-grove.glb",
  "models/autumn/perched-owl.glb",
  "models/autumn/autumn-snag.glb",
  "models/autumn/autumn-willow.glb",
  "models/autumn/golden-larch.glb",
]);

// Raw Meshy/Blender source GLBs. These are gitignored, but .gitignore does not
// stop SvelteKit copying static/ verbatim into the build output, so every one
// of them was being published. Only the largest tripped the 25 MiB per-file
// sweep; the rest (9-20 MiB each) shipped silently. Nothing fetches a
// *_raw.glb at runtime — they exist purely as Blender import sources.
/** @param {string} fileName */
export const isRawSourceModel = (fileName) => fileName.endsWith("_raw.glb");

/**
 * Return every directory entry that is not part of its runtime contract.
 *
 * Vite copies `static/` verbatim. Keeping an allowlist here means a newly
 * generated bake input cannot quietly become a production asset merely
 * because it was written beside the one texture the browser actually loads.
 */
export function getDisallowedDeployEntries(entryNames, allowedNames) {
  const allowed = new Set(allowedNames);
  return entryNames.filter((entryName) => !allowed.has(entryName));
}

/**
 * Whether the final trim would delete this static/ entry, so the build can
 * skip copying it. Skipping a directory skips everything under it.
 *
 * @param {string} relativePath path under static/, separated by `/`
 * @param {{ isDirectory: boolean, size: number }} entry
 */
export function isExcludedFromDeploy(relativePath, { isDirectory, size }) {
  const [topLevel] = relativePath.split("/");
  if (DEPLOY_EXCLUDED_DIRECTORIES.includes(topLevel)) return true;
  if (DEPLOY_EXCLUDED_FILES.includes(relativePath)) return true;

  for (const [directory, allowedNames] of Object.entries(
    DEPLOY_DIRECTORY_FILE_ALLOWLISTS
  )) {
    if (!relativePath.startsWith(`${directory}/`)) continue;
    const [entryName] = relativePath.slice(directory.length + 1).split("/");
    if (getDisallowedDeployEntries([entryName], allowedNames).length > 0) {
      return true;
    }
  }

  if (isDirectory) return false;
  const fileName = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return isRawSourceModel(fileName) || size > DEPLOY_MAX_FILE_BYTES;
}
