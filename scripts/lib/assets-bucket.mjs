/**
 * The public assets bucket: R2 `tka-assets`, served at
 * https://assets.tkaflowarts.com, written through wrangler. Shared by the
 * loop-clip upload and the release-email hero.
 */

import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ASSETS_BUCKET = "tka-assets";
export const ASSETS_CDN = "https://assets.tkaflowarts.com";
export const REPO_ROOT = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  ".."
);
const WRANGLER = join(
  REPO_ROOT,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js"
);

/** CLOUDFLARE_API_TOKEN from the environment, else from the repo's .env. */
export function loadCloudflareToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^CLOUDFLARE_API_TOKEN=(.*)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Where /test/loop-clips writes the current renderer version's bake. */
export function loopClipBakeDir() {
  // The renderer version lives in the TypeScript spec; read it rather than
  // duplicating the number here.
  const spec = readFileSync(
    join(REPO_ROOT, "src/lib/shared/sequence-clips/loop-clip-spec.ts"),
    "utf8"
  );
  const match = spec.match(/LOOP_CLIP_RENDERER_VERSION = (\d+)/);
  if (!match) throw new Error("Could not read LOOP_CLIP_RENDERER_VERSION");
  return join(tmpdir(), "tka-loop-clips", `r${match[1]}`);
}

/** Upload one file to the bucket under `key`. */
export function putAsset(token, key, file, contentType, cacheControl, dryRun) {
  const args = [
    WRANGLER,
    "r2",
    "object",
    "put",
    `${ASSETS_BUCKET}/${key}`,
    "--file",
    file,
    "--content-type",
    contentType,
    "--cache-control",
    cacheControl,
    "--remote",
  ];
  if (dryRun) {
    console.log(`[dry-run] ${key} <- ${file}`);
    return;
  }
  // Run wrangler's own entry with this node, no shell: a shell on Windows
  // splits the cache-control value at its spaces.
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `wrangler put failed for ${key}:\n${result.stdout}\n${result.stderr}`
    );
  }
}
