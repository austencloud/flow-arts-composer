import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RequestHandler } from "./$types";
import {
  EYEBROWS,
  EYELASHES,
  HAIR_STYLES,
  HATS,
  OUTFITS,
  SHOES,
} from "../../../generation-options";

const assets =
  process.env.MPFB_ASSETS ?? "E:/3D-Models/mpfb-proof-20260908/assets";
const allowed = {
  hair: new Set(HAIR_STYLES.filter((name) => name !== "bald")),
  clothes: new Set([
    ...OUTFITS.feminine,
    ...OUTFITS.masculine,
    ...SHOES,
    ...HATS.filter((name) => name !== "none"),
  ]),
  eyebrows: new Set(EYEBROWS),
  eyelashes: new Set(EYELASHES.filter((name) => name !== "none")),
} as const;

/** Local-only previews select an allowlisted asset thumb, never a filesystem path. */
export const GET: RequestHandler = async ({
  params,
  url,
  getClientAddress,
}) => {
  if (
    !dev ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(getClientAddress())
  )
    error(404, "Not found");
  if (!Object.hasOwn(allowed, params.kind)) error(404, "Not found");
  const kind = params.kind as keyof typeof allowed;
  const names = allowed[kind];
  if (!names || !params.name || !names.has(params.name))
    error(404, "Not found");
  try {
    const thumb = await readFile(
      resolve(assets, kind, params.name, `${params.name}.thumb`)
    );
    return new Response(thumb, {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  } catch {
    error(404, "Preview unavailable");
  }
};
