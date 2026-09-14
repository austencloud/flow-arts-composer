import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage } from "canvas";
import { getLetterType, isValidLetter } from "@tka/domain";
import {
  sanitizeSvgForBitmap,
  tokenizeGlyphWord,
  type GlyphImageData,
} from "@tka/render-composition";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const isCompiled = currentDirectory.split(/[\\/]/).includes("dist");
const projectRoot = isCompiled
  ? path.resolve(currentDirectory, "../../../..")
  : path.resolve(currentDirectory, "../../..");

const glyphCache = new Map<string, Promise<GlyphImageData>>();

interface GlyphAsset {
  path: string;
  isDash: boolean;
}

function resolveGlyphAsset(token: string): GlyphAsset {
  const typeNumber = getLetterType(token);
  if (!typeNumber) {
    throw new Error(`"${token}" is not a canonical TKA letter`);
  }

  const isDash = token.endsWith("-");
  // Tau-Dash is a Type 4 extension, but the card header composes it from the
  // Type 6 tau artwork plus the shared dash overlay, exactly like the app.
  if (token === "τ-") {
    return {
      path: path.resolve(
        projectRoot,
        "static",
        "images",
        "letters_trimmed",
        "Type6",
        "τ.svg"
      ),
      isDash: true,
    };
  }
  const assetType = typeNumber === 3 ? 2 : typeNumber === 5 ? 4 : typeNumber;
  const fileName = isDash ? token.slice(0, -1) : token;

  return {
    path: path.resolve(
      projectRoot,
      "static",
      "images",
      "letters_trimmed",
      `Type${assetType}`,
      `${fileName}.svg`
    ),
    isDash,
  };
}

/**
 * Node-canvas does not implement the browser canvas `filter` used to invert
 * black glyph assets in dark mode. Color the monochrome SVG before decoding
 * and tell the shared header renderer not to apply that browser-only filter.
 */
function colorGlyphSvg(svg: string, darkMode: boolean): string {
  const color = darkMode ? "#e6e6e6" : "#231f20";
  let prepared = sanitizeSvgForBitmap(svg).replace(
    /#000000|#231f20|\bblack\b/gi,
    color
  );

  prepared = prepared.replace(
    /<svg\b([^>]*)>/i,
    (match, attributes: string) => {
      if (/\bfill\s*=/.test(attributes)) {
        return match.replace(/\bfill\s*=\s*["'][^"']*["']/i, `fill="${color}"`);
      }
      return `<svg${attributes} fill="${color}">`;
    }
  );

  return prepared;
}

async function loadGlyph(
  token: string,
  darkMode: boolean
): Promise<GlyphImageData> {
  const cacheKey = `${darkMode ? "dark" : "light"}:${token}`;
  const cached = glyphCache.get(cacheKey);
  if (cached) return cached;

  const loading = (async () => {
    const asset = resolveGlyphAsset(token);
    const svg = await readFile(asset.path, "utf8");
    const image = await loadImage(Buffer.from(colorGlyphSvg(svg, darkMode)));

    if (image.width <= 0 || image.height <= 0) {
      throw new Error(
        `TKA glyph "${token}" decoded without intrinsic dimensions`
      );
    }

    return {
      image: image as unknown as CanvasImageSource,
      naturalWidth: image.width,
      naturalHeight: image.height,
      isDash: asset.isDash,
    };
  })();

  glyphCache.set(cacheKey, loading);
  try {
    return await loading;
  } catch (error) {
    glyphCache.delete(cacheKey);
    throw error;
  }
}

/**
 * Build an all-or-nothing glyph map for a word.
 *
 * Arbitrary display labels may still use text. A canonical TKA word must load
 * every glyph; a missing asset is a render error rather than a silent fallback
 * to Unicode text.
 */
export async function loadTkaGlyphImages(
  word: string,
  darkMode: boolean
): Promise<Map<string, GlyphImageData> | undefined> {
  const tokens = tokenizeGlyphWord(word);
  if (tokens.length === 0 || tokens.some((token) => !isValidLetter(token))) {
    return undefined;
  }

  const uniqueTokens = [...new Set(tokens)];
  const entries = await Promise.all(
    uniqueTokens.map(
      async (token) => [token, await loadGlyph(token, darkMode)] as const
    )
  );

  return new Map(entries);
}
