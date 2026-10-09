/**
 * Arrow adjustment pipeline
 *
 * Reads the app's arrow placement JSON from static/data/arrow_placement and
 * runs the shared render-core lookup, so arrows land where the app puts them.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  calculateArrowAdjustment as calculateSharedArrowAdjustment,
  resolveArrowRotation as resolveSharedArrowRotation,
  type ArrowAdjustmentMotion,
  type ArrowAdjustmentPictograph,
} from "@tka/render-core";

export type {
  ArrowAdjustmentMotion,
  ArrowAdjustmentPictograph,
} from "@tka/render-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root: handle both source and dist paths
// dist/src/core -> 4 levels up to project root
// src/core -> 3 levels up to project root
const inDist = __dirname.includes("dist");
const PROJECT_ROOT = inDist
  ? join(__dirname, "../../../..")
  : join(__dirname, "../../..");
const PLACEMENT_ROOT = join(PROJECT_ROOT, "static/data/arrow_placement");

const jsonCache = new Map<string, unknown>();

function loadPlacementJson(relativePath: string): unknown {
  if (jsonCache.has(relativePath)) return jsonCache.get(relativePath);
  const filePath = join(PLACEMENT_ROOT, relativePath);
  let data: unknown = null;
  if (existsSync(filePath)) {
    try {
      data = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      data = null;
    }
  }
  jsonCache.set(relativePath, data);
  return data;
}

/** The arrow's canonical-frame nudge, as the app computes it. */
export function calculateArrowAdjustment(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  arrowLocation: string,
  options: { solo?: boolean } = {}
): [number, number] {
  return calculateSharedArrowAdjustment(
    pictograph,
    motion,
    arrowLocation,
    loadPlacementJson,
    options
  );
}

/** The arrow's canonical-frame glyph angle, rotation overrides included. */
export function resolveArrowRotation(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  arrowLocation: string,
  options: { solo?: boolean } = {}
): number {
  return resolveSharedArrowRotation(
    pictograph,
    motion,
    arrowLocation,
    loadPlacementJson,
    options
  );
}
