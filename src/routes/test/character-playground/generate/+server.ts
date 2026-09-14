import { dev } from "$app/environment";
import { error, json } from "@sveltejs/kit";
import { randomInt } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RequestEvent } from "./$types";
import { parseGenerationOptions } from "../generation-options";

const installation =
  process.env.MPFB_HOME ?? "E:/3D-Models/mpfb-proof-20260908";
const source =
  process.env.MPFB_SOURCE ??
  resolve(
    installation,
    "source/mpfb2-437dd513888a92399d1d3200d2e80859fae55abc"
  );
const assets = process.env.MPFB_ASSETS ?? resolve(installation, "assets");
const blender =
  process.env.BLENDER_BIN ??
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe";
const output = process.env.MPFB_OUTPUT ?? resolve(installation, "playground");
const lockPath = resolve(output, "generation.lock");

function assertLocal(event: RequestEvent): void {
  if (!dev) error(404, "Local development only");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(event.url.hostname))
    error(403, "Local development only");
  const address = event.getClientAddress();
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address))
    error(403, "Local development only");
  if (
    event.request.method === "POST" &&
    event.request.headers.get("origin") !== event.url.origin
  ) {
    error(403, "Generate characters from this page");
  }
}

function installed(): boolean {
  return (
    existsSync(blender) &&
    existsSync(resolve(source, "src/mpfb/__init__.py")) &&
    existsSync(resolve(assets, "skins"))
  );
}

export function GET(event: RequestEvent) {
  assertLocal(event);
  return json({ available: installed(), busy: existsSync(lockPath) });
}

export async function POST(event: RequestEvent) {
  assertLocal(event);
  if (!installed()) error(503, "The local MPFB installation is unavailable.");
  let options: ReturnType<typeof parseGenerationOptions>;
  if (event.request.headers.get("content-type")?.includes("application/json")) {
    try {
      options = parseGenerationOptions(await event.request.json());
    } catch {
      options = null;
    }
    if (!options)
      error(400, "Choose supported character options and try again.");
  } else options = null;
  await mkdir(output, { recursive: true });
  // Shared across tabs, hot reloads and task servers. Never run two Blender jobs.
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST")
      error(
        409,
        "Another character is being generated. Try again when it finishes."
      );
    throw cause;
  }
  const seed = randomInt(0, 2147483647);
  const job = resolve(output, `${seed}-${Date.now()}`);
  try {
    await mkdir(job, { recursive: true });
    await lock.writeFile(
      JSON.stringify({ seed, job, startedAt: new Date().toISOString() })
    );
    const optionsFile = options ? resolve(job, "requested-options.json") : "";
    if (options) await writeFile(optionsFile, JSON.stringify(options, null, 2));
    await promisify(execFile)(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/characters/randomize-mpfb.mjs",
        String(seed),
        job,
        source,
        assets,
        blender,
        resolve("static/models/avatars/bakeoff"),
        optionsFile,
      ],
      { cwd: process.cwd(), windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    );
    return json(
      JSON.parse(await readFile(resolve(job, "result.json"), "utf8"))
    );
  } catch (cause) {
    console.error("[character-playground] Generation failed", { job, cause });
    error(
      500,
      "Character generation failed. Your current character is still available. Details are in the local generation log."
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
