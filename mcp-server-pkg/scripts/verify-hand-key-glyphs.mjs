#!/usr/bin/env node

/**
 * Verifies the checked-in hand-key outlines against the bundled Gelasio font.
 * Run `npm run build:packages` first, then:
 *   node mcp-server-pkg/scripts/verify-hand-key-glyphs.mjs
 *
 * The application does not parse fonts at runtime. This guard is the only
 * place that asks NAPI canvas to turn text into paths, so a font or size update
 * cannot silently leave stale, platform-dependent label geometry behind.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parsePathString } from "svg-path-commander";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fontPath = join(
  root,
  "static/fonts/gelasio/gelasio-latin-700-normal.woff2"
);
const expectedFontHash =
  "dff91a5084db8f15e401e902acdac8768f5ae1746205c5319ad2cf3655517170";
const napiRequire = createRequire(join(root, "mcp-server-pkg/package.json"));
const { GlobalFonts, SvgExportFlag, createCanvas } =
  napiRequire("@napi-rs/canvas");
const { HAND_COLOR_KEY, getHandKeyGlyphPath, HAND_KEY_GLYPH_FONT_SIZE } =
  await import(
    pathToFileURL(
      join(root, "packages/render-core/dist/calculations/hand-color-key.js")
    ).href
  );

const actualFontHash = createHash("sha256")
  .update(readFileSync(fontPath))
  .digest("hex");
if (actualFontHash !== expectedFontHash) {
  throw new Error(
    `Gelasio source hash changed: expected ${expectedFontHash}, got ${actualFontHash}`
  );
}
if (HAND_COLOR_KEY.FONT_SIZE !== HAND_KEY_GLYPH_FONT_SIZE) {
  throw new Error(
    `Outline size ${HAND_KEY_GLYPH_FONT_SIZE} no longer matches HAND_COLOR_KEY.FONT_SIZE ${HAND_COLOR_KEY.FONT_SIZE}`
  );
}

GlobalFonts.registerFromPath(fontPath, "Gelasio");
const svg = createCanvas(200, 120, SvgExportFlag.ConvertTextToPaths);
const context = svg.getContext("2d");
context.font = `bold ${HAND_KEY_GLYPH_FONT_SIZE}px Gelasio`;
context.fillText("L", 0, 80);
context.fillText("R", 80, 80);
const sourcePaths = [
  ...svg
    .getContent()
    .toString()
    .matchAll(/<path d="([^"]+)"/g),
].map((match) => match[1]);

function canonicalizePath(path, xOffset) {
  return parsePathString(path)
    .map((command) => {
      const [operation, ...values] = command;
      if (operation === "Z") return "Z";
      const normalized = values.map((value, index) =>
        Number((index % 2 === 0 ? value - xOffset : value - 80).toFixed(8))
      );
      return `${operation}${normalized.join(" ")}`;
    })
    .join("");
}

const generated = {
  L: canonicalizePath(sourcePaths[0], 0),
  R: canonicalizePath(sourcePaths[1], 80),
};
for (const label of ["L", "R"]) {
  if (generated[label] !== getHandKeyGlyphPath(label)) {
    const expected = getHandKeyGlyphPath(label);
    const firstDifference = [...generated[label]].findIndex(
      (character, index) => character !== expected[index]
    );
    throw new Error(
      `${label} outline differs from Gelasio source at ${firstDifference}: ${generated[label].slice(firstDifference, firstDifference + 24)} != ${expected.slice(firstDifference, firstDifference + 24)}`
    );
  }
}

console.log("Hand-key Gelasio outlines and provenance verified.");
