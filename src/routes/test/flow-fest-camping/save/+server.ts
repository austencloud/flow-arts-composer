import { dev } from "$app/env";
import type { RequestHandler } from "@sveltejs/kit";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const OUTPUT_PATH = join(
  process.cwd(),
  "docs/superpowers/specs/flow-fest-sim/austen-camping-areas.json"
);
const KINDS = new Set(["tents", "car-camping", "camper-cars", "parking", "no-camping"]);
const LIMIT = 512;

type Vertex = { x: number; z: number };
type CampingArea = { id: string; kind: string; label: string; vertices: Vertex[] };

type Validated =
  | { valid: true; areas: CampingArea[]; removedTents: Vertex[]; tentSpots: Vertex[] }
  | { valid: false; error: string };

const onSite = (v: Partial<Vertex> | null | undefined): v is Vertex =>
  Number.isFinite(v?.x) && Number.isFinite(v?.z) && Math.abs(v!.x!) <= LIMIT && Math.abs(v!.z!) <= LIMIT;

function validate(value: unknown): Validated {
  const areas = (value as { areas?: unknown })?.areas;
  const removedTents = (value as { removedTents?: unknown })?.removedTents ?? [];
  if (!Array.isArray(removedTents) || removedTents.length > 500 || !removedTents.every(onSite)) {
    return { valid: false, error: "The removed tents are not a list of points on the site." };
  }
  const tentSpots = (value as { tentSpots?: unknown })?.tentSpots ?? [];
  if (!Array.isArray(tentSpots) || tentSpots.length > 1000 || !tentSpots.every(onSite)) {
    return { valid: false, error: "The tent spots are not a list of points on the site." };
  }
  if (!Array.isArray(areas) || areas.length > 300) return { valid: false, error: "Expected a list of up to 300 areas." };
  for (const area of areas as Partial<CampingArea>[]) {
    if (typeof area.id !== "string" || typeof area.label !== "string" || !KINDS.has(area.kind ?? "")) {
      return { valid: false, error: "An area has an unknown kind or no id." };
    }
    const vertices = area.vertices;
    if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > 500) {
      return { valid: false, error: "Every area needs 3 to 500 corners." };
    }
    if (!vertices.every(onSite)) {
      return { valid: false, error: "A corner lies outside the site." };
    }
  }
  return {
    valid: true,
    areas: areas as CampingArea[],
    removedTents: removedTents.map(({ x, z }) => ({ x, z })),
    tentSpots: tentSpots.map(({ x, z }) => ({ x, z })),
  };
}

export const GET: RequestHandler = () => {
  if (!existsSync(OUTPUT_PATH)) return Response.json({ areas: [] });
  return new Response(readFileSync(OUTPUT_PATH, "utf8"), {
    headers: { "content-type": "application/json" },
  });
};

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) {
    return Response.json(
      { ok: false, error: "This authoring endpoint is available only in development." },
      { status: 403 }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "The camping areas are not valid JSON." }, { status: 400 });
  }
  const validation = validate(body);
  if (!validation.valid) return Response.json({ ok: false, error: validation.error }, { status: 400 });
  try {
    const record = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      coordinateFrame: "world metres; x east, z south",
      annotationAuthority: "austen-annotated",
      kinds: {
        tents: "Tent camping",
        "car-camping": "Car camping: the car parks at the camp",
        "camper-cars": "Upper lot: cars of people who unloaded at their camp and drove up",
        parking: "Parking lot: no camping",
        "no-camping": "No camping",
      },
      areas: validation.areas,
      removedTentsNote: "Tents the game places today that Austen took off the map: no tent belongs at these spots.",
      removedTents: validation.removedTents,
      tentSpotsNote:
        "Austen's rough dots for where tents really stand, one per tent. unreal/FlowFest/Tools/austen-camps.mjs turns each into a tent on open ground.",
      tentSpots: validation.tentSpots,
    };
    const temporaryPath = `${OUTPUT_PATH}.tmp`;
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, OUTPUT_PATH);
    return Response.json({
      ok: true,
      path: relative(process.cwd(), OUTPUT_PATH).replaceAll("\\", "/"),
      areaCount: validation.areas.length,
      removedCount: validation.removedTents.length,
      spotCount: validation.tentSpots.length,
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Unknown write failure";
    return Response.json({ ok: false, error }, { status: 500 });
  }
};
