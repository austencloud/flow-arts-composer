/**
 * Dev-only write-back for the float-rotation tuner.
 *
 * POST { handpath: "cw" | "ccw", location: GridLocation value, angle: number }
 * patches the matching entry in one of the two exported maps in
 *   src/lib/shared/pictograph/arrow/positioning/calculation/config/float-rotation-maps.ts
 * with a single-line, comment-safe swap scoped to the correct map block, then
 * lets Vite HMR-reload the page so the pictographs re-render at the new angle.
 *
 * Guarded to dev — never reachable in a production build.
 */
import { error, type RequestHandler } from "@sveltejs/kit";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dev } from "$app/env";

const MAPS_PATH = resolve(
  process.cwd(),
  "src/lib/shared/pictograph/arrow/positioning/calculation/config/float-rotation-maps.ts",
);

/** GridLocation value → the enum member name used as the object key in the source. */
const VALUE_TO_ENUM: Record<string, string> = {
  n: "NORTH", e: "EAST", s: "SOUTH", w: "WEST",
  ne: "NORTHEAST", se: "SOUTHEAST", sw: "SOUTHWEST", nw: "NORTHWEST", c: "CENTER",
};

const MAP_NAME: Record<string, string> = {
  cw: "floatClockwiseHandpathMap",
  ccw: "floatCounterClockwiseHandpathMap",
};

/** Replace one `[GridLocation.<NAME>]: <num>` inside the named map block only. */
function patchFloatMap(
  src: string,
  mapName: string,
  enumName: string,
  angle: number,
): string {
  const anchor = `export const ${mapName}`;
  const startIdx = src.indexOf(anchor);
  if (startIdx === -1) throw new Error(`map ${mapName} not found`);
  const braceStart = src.indexOf("{", startIdx);
  const braceEnd = src.indexOf("};", braceStart);
  if (braceStart === -1 || braceEnd === -1) {
    throw new Error(`map ${mapName} block malformed`);
  }
  const block = src.slice(braceStart, braceEnd);
  const lineRe = new RegExp(`(\\[GridLocation\\.${enumName}\\]:\\s*)(-?\\d+(?:\\.\\d+)?)`);
  if (!lineRe.test(block)) {
    throw new Error(`entry ${enumName} not found in ${mapName}`);
  }
  const nextBlock = block.replace(lineRe, `$1${angle}`);
  return src.slice(0, braceStart) + nextBlock + src.slice(braceEnd);
}

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) throw error(403, "float-rotation write-back is dev-only");

  const body = (await request.json()) as {
    handpath?: string;
    location?: string;
    angle?: number;
  };
  const { handpath = "", location = "", angle } = body;

  const mapName = MAP_NAME[handpath];
  if (!mapName) throw error(400, `handpath must be "cw" or "ccw", got "${handpath}"`);

  const enumName = VALUE_TO_ENUM[location];
  if (!enumName) throw error(400, `unknown location "${location}"`);

  if (typeof angle !== "number" || !Number.isFinite(angle)) {
    throw error(400, "angle must be a finite number");
  }
  // Normalize to a 45° step in [0, 360).
  const normalized = (((Math.round(angle / 45) * 45) % 360) + 360) % 360;

  const src = readFileSync(MAPS_PATH, "utf8");
  let next: string;
  try {
    next = patchFloatMap(src, mapName, enumName, normalized);
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e));
  }
  const changed = next !== src;
  if (changed) writeFileSync(MAPS_PATH, next, "utf8");

  return Response.json({ ok: true, handpath, location, angle: normalized, changed });
};
