#!/usr/bin/env node
/**
 * generate-svg-precache-manifest.cjs
 *
 * Emits static/svg-precache-manifest.json — the finite set of pictograph
 * assets the service worker precaches on install so pictographs render
 * cold-offline (audit 2026-06-30, fix #1). Mostly SVGs (~260KB / ~190 files)
 * plus the six elemental glyph PNGs (~4.4MB — intentional, offline
 * completeness wins). Generating it at build time keeps it from rotting as
 * props/letters are added.
 *
 * Wired into `build` / `build:fast` BEFORE `vite build` so the manifest lands
 * in static/ and is copied into build/ (served at /svg-precache-manifest.json).
 * The output file is gitignored (deterministic build artifact).
 */

const fs = require("fs");
const path = require("path");

const STATIC_DIR = path.join(__dirname, "..", "static");
const IMAGES_DIR = path.join(STATIC_DIR, "images");
const OUTPUT = path.join(STATIC_DIR, "svg-precache-manifest.json");

// The render-critical asset dirs under static/images. Every live pictograph
// fetches from these at runtime (prop-svg-loader, arrow-svg-loader, glyph-cache,
// svg-preloader, GridSvg). Animated props (props/animated) are excluded — they
// belong to the animation engine, not the static pictograph renderer.
const ESSENTIAL_DIRS = [
  "props/pictograph",
  "grid",
  "arrows",
  "letters_trimmed",
  "numbers",
  "vtg_glyphs",
];

// Root-level glyph SVGs fetched directly from static/images (glyph-cache,
// PlacementGlyph, canvas-2d-glyph-renderer). The *arrows-sprite.svg files that
// live alongside them are build-time source metadata — never fetched at
// runtime — so they are deliberately NOT listed here.
const ESSENTIAL_ROOT_FILES = [
  "arrow.svg",
  "blank.svg",
  "dash.svg",
  "same_opp_dot.svg",
];

// Elemental glyph WebPs fetched via getElementImagePath(). This list mirrors
// ELEMENT_IMAGE_FILE in src/lib/shared/pictograph/shared/domain/enums/
// pictograph-enums.ts — a rename there must update here too. The live render
// path uses these WebPs (~216 KB total); the sibling PNGs stay on disk for the
// print/card pipeline (choreo-card/domain/tnd-element.ts) and are NOT
// precached.
const ELEMENT_FILES = [
  "air-v2.webp",
  "earth-v2.webp",
  "fire-v2.webp",
  "moon-v2.webp",
  "sun-v4.webp",
  "water-v2.webp",
];

const ASSET_EXTENSIONS = new Set([".svg", ".json"]);

/** Recursively collect asset files under a dir, returning absolute paths. */
function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // dir missing — skip, runtime cache-first still covers it
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collect the precache asset URL list (root-relative, forward-slashed, sorted,
 * deduped). Exported for testing.
 * @param {string} [imagesDir] override the static/images dir (tests)
 * @returns {string[]} e.g. ["/images/grid/diamond_grid.svg", ...]
 * @throws if any explicitly-listed load-bearing file is missing on disk
 */
function collectAssets(imagesDir = IMAGES_DIR) {
  const urls = new Set();
  const toUrl = (file) => {
    const fromStatic = path.relative(path.dirname(imagesDir), file);
    return "/" + fromStatic.split(path.sep).join("/");
  };
  for (const rel of ESSENTIAL_DIRS) {
    const abs = path.join(imagesDir, rel);
    for (const file of walk(abs)) {
      urls.add(toUrl(file));
    }
  }
  // Explicit files get the opposite failure mode from the dirs above: a missing
  // dir is skipped (runtime cache-first still covers it), but silently dropping
  // one of these recreates the exact coverage hole this list exists to close —
  // so a missing file fails the build loudly instead.
  const explicitFiles = [
    ...ESSENTIAL_ROOT_FILES,
    path.join("arrows", "arrow-split-manifest.json"),
    ...ELEMENT_FILES.map((name) => path.join("elements", name)),
  ];
  const missing = [];
  for (const rel of explicitFiles) {
    const abs = path.join(imagesDir, rel);
    if (!fs.existsSync(abs)) {
      missing.push(abs);
      continue;
    }
    urls.add(toUrl(abs));
  }
  if (missing.length > 0) {
    throw new Error(
      `[svg-precache] load-bearing precache file(s) missing:\n  ${missing.join("\n  ")}`
    );
  }
  return Array.from(urls).sort();
}

function main() {
  let assets;
  try {
    assets = collectAssets();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  const payload = {
    // Note: no timestamp — keeps the file byte-stable across rebuilds when the
    // asset set is unchanged (avoids needless diffs / cache churn).
    count: assets.length,
    assets,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `[svg-precache] wrote ${assets.length} assets -> static/svg-precache-manifest.json`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  collectAssets,
  ESSENTIAL_DIRS,
  ESSENTIAL_ROOT_FILES,
  ELEMENT_FILES,
  OUTPUT,
};
