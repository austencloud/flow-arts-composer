/**
 * Shared corpus reader for the SVG asset contract audit.
 *
 * Every check in this directory runs against the real files under `static/`,
 * not a fixture. The census is bounded by construction: it walks one directory
 * tree once per test file and holds only the parsed summary in memory.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const STATIC_ROOT = path.join(REPO_ROOT, "static");

/** Repo-relative POSIX path, so failures name a file you can open directly. */
export function repoRelative(absolutePath: string): string {
  return path.relative(REPO_ROOT, absolutePath).split(path.sep).join("/");
}

export function listSvgFiles(relativeDir = "static"): string[] {
  const root = path.join(REPO_ROOT, relativeDir);
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith(".svg")) out.push(full);
    }
  };

  walk(root);
  return out.sort();
}

/**
 * Strip XML comments before scanning for ids and fragment references.
 *
 * Several prop assets carry long authoring notes that quote `url(#...)` and
 * `href=` in prose. Scanning the raw text reports those quotes as broken
 * references, which is a false positive, not a defect.
 */
export function stripComments(svgText: string): string {
  return svgText.replace(/<!--[\s\S]*?-->/g, "");
}

export interface SvgRecord {
  /** Repo-relative path, e.g. `static/images/props/pictograph/staff.svg`. */
  file: string;
  text: string;
  /** The raw root `<svg ...>` start tag, or null when there is no root. */
  rootTag: string | null;
  viewBox: string | null;
  /** viewBox as four numbers, or null when absent/unparseable. */
  box: [number, number, number, number] | null;
  rootWidth: string | null;
  rootHeight: string | null;
  ids: string[];
  /** Fragment targets referenced by `url(#x)`, `href="#x"`, `xlink:href="#x"`. */
  fragmentRefs: string[];
  /** Every `d` attribute value in document order. */
  pathData: string[];
}

const ROOT_TAG = /<svg\b[^>]*>/i;
const VIEW_BOX = /\bviewBox\s*=\s*["']([^"']*)["']/i;

export function readSvg(absolutePath: string): SvgRecord {
  const text = fs.readFileSync(absolutePath, "utf8");
  const body = stripComments(text);
  const rootTag = body.match(ROOT_TAG)?.[0] ?? null;
  const viewBox = rootTag?.match(VIEW_BOX)?.[1]?.trim() ?? null;

  let box: SvgRecord["box"] = null;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      box = parts as [number, number, number, number];
    }
  }

  return {
    file: repoRelative(absolutePath),
    text,
    rootTag,
    viewBox,
    box,
    rootWidth: rootTag?.match(/\swidth\s*=\s*["']([^"']*)["']/i)?.[1] ?? null,
    rootHeight: rootTag?.match(/\sheight\s*=\s*["']([^"']*)["']/i)?.[1] ?? null,
    ids: [...body.matchAll(/\bid\s*=\s*["']([^"']*)["']/g)].map((m) => m[1]!),
    fragmentRefs: [
      ...[...body.matchAll(/url\(\s*["']?#([^)"']+)["']?\s*\)/g)].map(
        (m) => m[1]!
      ),
      ...[
        ...body.matchAll(/\b(?:xlink:href|href)\s*=\s*["']#([^"']+)["']/g),
      ].map((m) => m[1]!),
    ],
    pathData: [...body.matchAll(/\bd\s*=\s*["']([^"']*)["']/g)].map(
      (m) => m[1]!
    ),
  };
}

/**
 * Assets that deliberately render nothing.
 *
 * `extractSvgContent()` in arrow-svg-parser.ts returns "" for any markup
 * containing `width="0"`, which is how a zero-turn static arrow draws no
 * glyph. These four files are that contract, not broken geometry.
 */
export const INTENTIONAL_ZERO_DIMENSION_ASSETS = [
  "static/images/arrows/static/from_nonradial/static_0.0.svg",
  "static/images/arrows/static/from_radial/static_0.0.svg",
  "static/images/arrows/still.svg",
  "static/images/blank.svg",
] as const;
