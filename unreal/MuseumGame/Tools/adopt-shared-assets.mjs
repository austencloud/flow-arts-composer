/** Copy a verified producer bundle without changing its Unreal package names. */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2] && resolve(process.argv[2]);
if (!source || source === project) throw new Error("Pass the finalized FlowFest project directory");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assets = [];

async function copy(relativePath) {
  const input = resolve(source, relativePath);
  const output = resolve(project, relativePath);
  const bytes = await readFile(input);
  const sha256 = hash(bytes);
  if (hash(await readFile(input)) !== sha256) throw new Error(`Producer asset changed while copying: ${input}`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  if (hash(await readFile(output)) !== sha256) throw new Error(`Copied asset hash mismatch: ${output}`);
  assets.push({ path: relativePath, bytes: bytes.length, sha256 });
}

async function copyDirectory(relativePath) {
  for (const entry of await readdir(resolve(source, relativePath), { withFileTypes: true })) {
    const child = `${relativePath}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in native bundle: ${child}`);
    if (entry.isDirectory()) await copyDirectory(child);
    else if (entry.isFile()) await copy(child);
  }
}

const manifest = JSON.parse(await readFile(resolve(project, "Content/Data/museum-performances.json"), "utf8"));
if (manifest.schema !== "museum-native-performances-v1" || manifest.characterId !== "x-bot")
  throw new Error("Unsupported Museum performance catalog");
const catalog = JSON.parse(await readFile(resolve(source, "Content/Data/characters.json"), "utf8"));
const character = catalog.characters.find((item) => item.id === manifest.characterId);
if (character?.folder !== "/Game/FlowFest/Characters/x_bot") throw new Error("Shared x-bot rig is missing");
const props = JSON.parse(await readFile(resolve(source, "Content/Data/props.json"), "utf8"));
if (!props.props.some((item) => item.id === manifest.propId)) throw new Error("Shared Museum prop is missing");

for (const folder of ["Characters/x_bot", "Props", "Materials", "Audio"]) {
  await copyDirectory(`Content/FlowFest/${folder}`);
}
await copy("Content/Data/characters.json");
await copy("Content/Data/props.json");
const receipt = {
  schema: "museum-shared-assets-v1",
  characterId: manifest.characterId,
  mount: "/Game/FlowFest",
  sourceProject: source,
  assets: assets.sort((a, b) => a.path.localeCompare(b.path)),
};
await writeFile(resolve(project, "Content/Data/shared-assets.json"), JSON.stringify(receipt, null, 2));
console.log(`MUSEUM_SHARED_ASSETS_OK ${assets.length} files ${assets.reduce((sum, item) => sum + item.bytes, 0)} bytes`);
