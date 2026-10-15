/** Preserve one completed family-capture rig without rewriting capture bytes.
 * Usage: node Tools/archive-family-rig.mjs <capture-dir> <character-id> <archive-dir>
 * Run only after the capture runner has declared the rig complete.
 */
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [captureArg, character, archiveArg] = process.argv.slice(2);
if (!captureArg || !/^[a-z0-9-]+$/.test(character ?? '') || !archiveArg)
  throw new Error('Usage: archive-family-rig.mjs <capture-dir> <character-id> <archive-dir>');
const captures = resolve(captureArg);
const destination = resolve(archiveArg);
const manifest = JSON.parse(await readFile(join(captures, 'family-manifest.json'), 'utf8'));
if (manifest.schema !== 'flow-fest-native-export-manifest-v1' ||
    manifest.captureRevision !== 'clock-isolated-body-v3' ||
    !Array.isArray(manifest.artifacts))
  throw new Error('Invalid family capture manifest');
const artifacts = manifest.artifacts.filter(entry => entry.character === character);
if (artifacts.length !== 82 || new Set(artifacts.map(entry => entry.role)).size !== 82)
  throw new Error(`${character}: expected 82 unique family clips, found ${artifacts.length}`);
const variants = new Map();
const files = [];
for (const entry of artifacts) {
  const role = /^family-([a-z0-9_]+)-([AB])$/.exec(entry.role);
  if (!role ||
      entry.filename !== `${character}_${entry.role}.json` || entry.frames !== 480)
    throw new Error(`Invalid family manifest entry: ${entry.filename}`);
  variants.set(role[1], (variants.get(role[1]) ?? '') + role[2]);
  files.push(entry.filename, `${entry.role}.sequence.json`);
}
if (variants.size !== 41 || [...variants.values()].some(value => [...value].sort().join('') !== 'AB'))
  throw new Error(`${character}: expected A and B captures for all 41 physical families`);
if (new Set(files).size !== 164 || files.some(file => !existsSync(join(captures, file))))
  throw new Error(`${character}: one or more captures or sequence snapshots are missing`);

async function sha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

await mkdir(destination, { recursive: true });
const target = join(destination, `${character}-v3.tar.gz`);
if (existsSync(target) || existsSync(`${target}.partial`))
  throw new Error(`${character}: archive already exists or a partial archive needs inspection`);
const metadata = join(destination, `${character}-v3-metadata`);
if (existsSync(metadata))
  throw new Error(`${character}: archive metadata directory already exists and needs inspection`);
await mkdir(metadata, { recursive: true });
const rigManifest = { ...manifest, artifacts };
await writeFile(join(metadata, 'family-manifest.json'), JSON.stringify(rigManifest, null, 2));
const hashes = [];
for (const file of files) hashes.push(`${await sha256(join(captures, file))}  ${file}`);
hashes.push(`${await sha256(join(metadata, 'family-manifest.json'))}  family-manifest.json`);
await writeFile(join(metadata, 'SHA256SUMS'), `${hashes.join('\n')}\n`);

const temporary = `${target}.partial`;
const tar = spawnSync('tar.exe', ['-czf', temporary, '-C', captures, ...files,
  '-C', metadata, 'family-manifest.json', 'SHA256SUMS'], { stdio: 'inherit' });
if (tar.error || tar.status !== 0) throw new Error(`tar failed: ${tar.error?.message ?? tar.status}`);
await rename(temporary, target);
const archiveHash = await sha256(target);
await writeFile(`${target}.sha256`, `${archiveHash}  ${character}-v3.tar.gz\n`);
await rm(metadata, { recursive: true });
console.log(JSON.stringify({ character, captures: artifacts.length, files: files.length + 2,
  archive: target, sha256: archiveHash }));
