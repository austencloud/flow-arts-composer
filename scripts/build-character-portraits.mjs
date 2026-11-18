/**
 * Build the portrait each tile of the character picker shows.
 *
 *   node scripts/build-character-portraits.mjs               # every body
 *   node scripts/build-character-portraits.mjs --only x-bot,ch07
 *   node scripts/build-character-portraits.mjs --models E:/tka-platform/static/models/avatars
 *
 * --models names the folder that holds the local model copies (`_optimized/`
 * and `bakeoff/`). It defaults to this checkout's static/models/avatars; a
 * worktree has none, so point it at the primary checkout's.
 *
 * 1. Read the character list (the scene package's catalog plus the default
 *    cast's local bodies) and find each body's GLB: the local optimized copy,
 *    or a download from the public CDN bucket.
 * 2. Blender renders one upright bust per body
 *    (scripts/render-character-portraits.py).
 * 3. sharp turns each render into a 420 x 560 WebP.
 *
 * Portraits of shipped bodies are written to static/images/character-portraits
 * and travel with the app. A local-evaluation body's portrait goes beside its
 * model in the gitignored bake-off folder, so it never leaves this machine.
 * Nothing is uploaded.
 *
 * Requires Blender (set BLENDER_BIN if it is not in the default place).
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import sharp from "sharp";

const R2_PUBLIC = "https://pub-f5505ed75927471cb198c54336317370.r2.dev";
const PORTRAIT_WIDTH = 420;
const PORTRAIT_HEIGHT = 560;

const BLENDER_BIN =
  process.env.BLENDER_BIN ||
  "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe";

const args = process.argv.slice(2);
const option = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const only = option("--only")?.split(",") ?? null;

const ROOT = process.cwd();
const STATIC_AVATARS =
  option("--models") ?? join(ROOT, "static", "models", "avatars");
const BAKEOFF = join(STATIC_AVATARS, "bakeoff");
const SHIPPED_OUT = join(ROOT, "static", "images", "character-portraits");
const LOCAL_OUT = join(BAKEOFF, "portraits");
const DEFINITION_FILES = [
  join(
    ROOT,
    "node_modules",
    "@austencloud",
    "scene-3d",
    "src",
    "lib",
    "config",
    "avatar-definitions.ts"
  ),
  join(ROOT, "src", "lib", "shared", "3d", "domain", "default-cast-characters.ts"),
];
const RENDER_SCRIPT = join(ROOT, "scripts", "render-character-portraits.py");

const WORK = join(tmpdir(), "tka-character-portraits");
const IN_DIR = join(WORK, "in");
const PNG_DIR = join(WORK, "png");

/** Every body in the catalog: its id, and its bake-off file when it is local. */
function readBodies() {
  const bodies = new Map();
  for (const file of DEFINITION_FILES) {
    const source = readFileSync(file, "utf8");
    const entry = /id:\s*["']([a-z0-9-]+)["'][\s\S]*?modelPath:\s*([^\n]+)/gi;
    for (const [, id, modelPath] of source.matchAll(entry)) {
      const local = /bakeoff\}?\/([\w.-]+\.glb)/i.exec(modelPath);
      if (!bodies.has(id)) bodies.set(id, { id, localFile: local?.[1] ?? null });
    }
  }
  if (bodies.size === 0) throw new Error("No character ids found");
  return [...bodies.values()];
}

async function gather(bodies) {
  const ready = [];
  for (const body of bodies) {
    const dest = join(IN_DIR, `${body.id}.glb`);
    if (body.localFile) {
      const source = join(BAKEOFF, body.localFile);
      if (!existsSync(source)) {
        console.log(`  ${body.id}: no local file, skipped`);
        continue;
      }
      copyFileSync(source, dest);
    } else {
      const optimized = join(STATIC_AVATARS, "_optimized", `${body.id}.glb`);
      if (existsSync(optimized)) {
        copyFileSync(optimized, dest);
      } else {
        const url = `${R2_PUBLIC}/models/avatars/${body.id}.glb`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
        writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
      }
    }
    ready.push(body);
  }
  return ready;
}

function render() {
  if (!existsSync(BLENDER_BIN)) {
    throw new Error(`Blender not found at ${BLENDER_BIN} (set BLENDER_BIN)`);
  }
  execFileSync(
    BLENDER_BIN,
    [
      "--factory-startup",
      "--background",
      "--python",
      RENDER_SCRIPT,
      "--",
      "--input",
      IN_DIR,
      "--output",
      PNG_DIR,
    ],
    { stdio: ["ignore", "ignore", "inherit"], windowsHide: true }
  );
}

async function write(bodies) {
  let written = 0;
  for (const body of bodies) {
    const png = join(PNG_DIR, `${body.id}.png`);
    if (!existsSync(png)) {
      console.warn(`  ${body.id}: no render`);
      continue;
    }
    const outDir = body.localFile ? LOCAL_OUT : SHIPPED_OUT;
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, `${body.id}.webp`);
    await sharp(png)
      .resize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, { fit: "cover", position: "top" })
      .webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toFile(out);
    console.log(`  ${body.id} -> ${basename(outDir)}/${body.id}.webp`);
    written += 1;
  }
  return written;
}

async function main() {
  for (const dir of [IN_DIR, PNG_DIR]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  let bodies = readBodies();
  if (only) bodies = bodies.filter((body) => only.includes(body.id));
  const ready = await gather(bodies);
  console.log(`Rendering ${ready.length} portraits in Blender...`);
  render();
  const written = await write(ready);
  console.log(`Done: ${written} of ${bodies.length} portraits written.`);
  if (written < ready.length) process.exit(1);
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
