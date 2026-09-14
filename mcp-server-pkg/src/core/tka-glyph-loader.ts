import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getLetterType, isValidLetter } from "@tka/domain";
import {
  sanitizeSvgForBitmap,
  tokenizeGlyphWord,
  type GlyphImageData,
} from "@tka/render-composition";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isCompiled = __dirname.split(/[\\/]/).includes("dist");
const ASSET_ROOT = join(
  __dirname,
  isCompiled ? "../assets/images/letters_trimmed" : "../../assets/images/letters_trimmed"
);

export interface GlyphImageLoader {
  (source: Buffer): Promise<CanvasImageSource>;
}

function svgDimensions(svg: string): { naturalWidth: number; naturalHeight: number } {
  const viewBox = svg.match(/viewBox\s*=\s*"([^"]+)"/i)?.[1];
  const [, , width = "100", height = "100"] = viewBox?.trim().split(/\s+/) ?? [];
  return {
    naturalWidth: Number.parseFloat(width) || 100,
    naturalHeight: Number.parseFloat(height) || 100,
  };
}

function glyphPath(token: string): string | undefined {
  // τ- is a static τ glyph plus the shared dash overlay, not the legacy
  // combined Type4 SVG. This preserves the same title composition as the app.
  if (token === "τ-") return join(ASSET_ROOT, "Type6", "τ.svg");
  const typeNumber = getLetterType(token);
  if (!typeNumber) return undefined;
  const isDash = token.endsWith("-");
  const assetType = typeNumber === 3 ? 2 : typeNumber === 5 ? 4 : typeNumber;
  const fileName = isDash ? token.slice(0, -1) : token;
  return join(ASSET_ROOT, `Type${assetType}`, `${fileName}.svg`);
}

/** Loads the packaged canonical TKA glyph SVGs for the shared header renderer. */
export async function loadTkaWordGlyphs(
  word: string,
  loadImage: GlyphImageLoader,
  darkMode: boolean
): Promise<Map<string, GlyphImageData> | undefined> {
  const tokens = tokenizeGlyphWord(word);
  if (
    tokens.length === 0 ||
    tokens.some((token) => !isValidLetter(token) && token !== "τ-")
  ) {
    return undefined;
  }

  const glyphs = new Map<string, GlyphImageData>();

  for (const token of tokens) {
    if (glyphs.has(token)) continue;
    const filePath = glyphPath(token);
    if (!filePath || !existsSync(filePath)) {
      throw new Error(`Missing canonical TKA glyph asset for ${token}`);
    }

    const svg = readFileSync(filePath, "utf8");
    const dimensions = svgDimensions(svg);
    const fill = darkMode ? "#e6e6e6" : "#231f20";
    const themedSvg = sanitizeSvgForBitmap(svg)
      .replace(/fill=("[^"]*"|'[^']*')/gi, `fill="${fill}"`)
      .replace(/<path\b(?![^>]*\bfill=)/gi, `<path fill="${fill}"`);
    glyphs.set(token, {
      image: await loadImage(Buffer.from(themedSvg)),
      ...dimensions,
      isDash: token.endsWith("-"),
    });
  }

  return glyphs;
}

export function getTkaGlyphPath(token: string): string | undefined {
  return glyphPath(token);
}
