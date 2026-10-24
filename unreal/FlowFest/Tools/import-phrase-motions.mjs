/**
 * Add phrase capture bundles to the shared content store for the -PhraseStage mode.
 * Usage: node import-phrase-motions.mjs <phrase-capture-directory> [--suffix -g52]
 *
 * Writes only under Content/FlowFest/PhraseStage, and only adds: a file that already exists with
 * the same bytes is skipped, one with different bytes stops the import. The index is written as
 * phrase-motions-<hash>.json, named by its content, so a later capture adds a new index file
 * instead of rewriting an old one; the stage merges every index in the folder.
 *
 * --suffix (2026-10-23) adds a tag to every motion file base (`x.motion.json` -> `x-g52.motion.json`)
 * so a recapture of the same routines sits beside the old files instead of colliding with them;
 * the stage prefers the `-g52` file when the index names both.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeployedCharacters } from "../../Shared/Tools/character-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const store = resolve(root, "unreal/FlowFest/Content/FlowFest/PhraseStage");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const args = process.argv.slice(2);
const suffixAt = args.indexOf("--suffix");
const suffix = suffixAt >= 0 ? args.splice(suffixAt, 2)[1] : "";
if (suffix === undefined || !/^(-[a-z0-9]+)?$/.test(suffix)) throw new Error("--suffix takes a tag such as -g52");
const [inputArg] = args;
if (!inputArg) throw new Error("Usage: import-phrase-motions.mjs <phrase-capture-directory> [--suffix -g52]");
const stored = (file) => (suffix ? file.replace(/.motion.json$/, `${suffix}.motion.json`) : file);
const input = resolve(inputArg);
const manifest = JSON.parse(await readFile(join(input, "phrase-manifest.json"), "utf8"));
if (manifest.schema !== "flow-fest-phrase-motions-v1" || !manifest.entries?.length)
  throw new Error(`${input}: no phrase capture manifest`);

async function existing(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** Add one file; identical bytes are already there, different bytes are never replaced. */
async function addFile(path, bytes, source) {
  const current = await existing(path);
  if (current) {
    if (sha256(current) !== sha256(bytes)) throw new Error(`${path} already exists with different bytes; not replacing it`);
    return false;
  }
  await mkdir(dirname(path), { recursive: true });
  if (source) await copyFile(source, path);
  else await writeFile(path, bytes);
  return true;
}

// The character models are gitignored, so a linked worktree may not have them; the primary
// checkout does. Hash the real model, never the hash a bundle carries.
const primary = resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim(), "..");
const rigs = {};
const characters = await loadDeployedCharacters(root);
for (const id of new Set(manifest.entries.map((entry) => entry.characterId))) {
  const character = characters.find((entry) => entry.id === id);
  if (!character) throw new Error(`Unknown deployed character ${id}`);
  const bytes = (await existing(resolve(root, character.sourceRelativePath))) ?? (await existing(resolve(primary, character.sourceRelativePath)));
  if (!bytes) throw new Error(`${character.sourceRelativePath} is in neither this checkout nor ${primary}`);
  rigs[id] = sha256(bytes);
}

let added = 0;
for (const entry of manifest.entries) {
  const source = join(input, entry.file);
  const bytes = await readFile(source);
  const rig = JSON.parse(bytes.toString("utf8")).skeleton?.rigSHA256;
  if (rig !== rigs[entry.characterId]) throw new Error(`${entry.file} was captured on a different ${entry.characterId} model`);
  if (await addFile(join(store, "Motions", stored(entry.file)), bytes, source)) added += 1;
}

await addFile(join(store, "runtime-rigs.json"),
  Buffer.from(`${JSON.stringify({ schema: "flow-arts-runtime-rigs-v1", rigs }, null, 2)}\n`));

const index = {
  schema: "flow-fest-phrase-motion-index-v1",
  tempoBpm: manifest.tempoBpm,
  secondsPerStep: manifest.secondsPerStep,
  scheduleSHA256: manifest.scheduleSHA256,
  maxBeats: manifest.maxBeats,
  motions: manifest.entries.map(({ characterId, propType, plane, sequenceId, sequenceName, file, sequenceSHA256, beats, frames }) =>
    ({ characterId, propType, plane, sequenceId, sequenceName, file: `Motions/${stored(file)}`, sequenceSHA256, beats, frames })),
};
const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
const indexName = `phrase-motions-${sha256(indexBytes).slice(0, 12)}.json`;
await addFile(join(store, indexName), indexBytes);
console.log(`Phrase motions: ${added} new of ${manifest.entries.length} in ${store}; index ${indexName}`);
