/**
 * Dev-only canon persistence for the half-movement WASD harness.
 *
 * POST body: { adjustments: { "<motionType>_t<turns>": { x, y }, ... } }
 * (glyph-local totals). Writes them into the static default placement JSONs
 * (static/data/arrow_placement/default/default_<mt>_half_placements.json,
 * shape { "<mt>": { "<turns>": [x, y] } }) — the exact files the arrow
 * pipeline's segment branch reads — so a harness nudge IS canon on the next
 * app load. Zero totals delete their key. 404s outside `vite dev`.
 */
import { dev } from "$app/env";
import { error } from "@sveltejs/kit";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RequestHandler } from "./$types";

const MOTION_TYPES = new Set(["pro", "anti", "dash", "static"]);

const fileFor = (mt: string) =>
  resolve(
    process.cwd(),
    `static/data/arrow_placement/default/default_${mt}_half_placements.json`
  );

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) throw error(404, "dev only");

  const { adjustments } = (await request.json()) as {
    adjustments: Record<string, { x: number; y: number }>;
  };
  if (!adjustments || typeof adjustments !== "object") {
    throw error(400, "missing adjustments");
  }

  // Group by motion type. Key format: "<mt>_t<turns>", turns may be "0.5"/"fl".
  const byMt = new Map<string, Record<string, { x: number; y: number }>>();
  for (const [key, v] of Object.entries(adjustments)) {
    const sep = key.lastIndexOf("_t");
    const mt = key.slice(0, sep);
    const turns = key.slice(sep + 2);
    if (sep < 1 || !MOTION_TYPES.has(mt) || !turns)
      throw error(400, `bad key: ${key}`);
    if (typeof v?.x !== "number" || typeof v?.y !== "number")
      throw error(400, `bad value: ${key}`);
    if (!byMt.has(mt)) byMt.set(mt, {});
    byMt.get(mt)![turns] = v;
  }

  const written: string[] = [];
  for (const [mt, turnsMap] of byMt) {
    const path = fileFor(mt);
    let file: Record<string, Record<string, [number, number]>>;
    try {
      file = JSON.parse(await readFile(path, "utf8"));
    } catch {
      file = {};
    }
    file[mt] ??= {};
    for (const [turns, v] of Object.entries(turnsMap)) {
      if (v.x === 0 && v.y === 0) {
        delete file[mt]![turns];
      } else {
        file[mt]![turns] = [
          Math.round(v.x * 10) / 10,
          Math.round(v.y * 10) / 10,
        ];
      }
    }
    await writeFile(path, JSON.stringify(file, null, 2) + "\n", "utf8");
    written.push(`${mt}: ${Object.keys(turnsMap).join(", ")}`);
  }

  return Response.json({ ok: true, written });
};
