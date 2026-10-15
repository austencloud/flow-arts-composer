/** Merge immutable v3 rig archives into one editable capture directory.
 * Usage: node Tools/merge-family-archives.mjs <archive-dir> <capture-dir> <rig>...
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [archiveArg, captureArg, ...rigs] = process.argv.slice(2);
if (!archiveArg || !captureArg || !rigs.length || rigs.some(id => !/^[a-z0-9-]+$/.test(id)))
  throw new Error('Usage: merge-family-archives.mjs <archive-dir> <capture-dir> <rig>...');
const archiveDir = resolve(archiveArg);
const output = resolve(captureArg);
const expectedSchema = 'flow-fest-native-export-manifest-v1';
const expectedRevision = 'clock-isolated-body-v3';

async function sha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

await mkdir(output, { recursive: true });
const outputManifest = join(output, 'family-manifest.json');
let merged = existsSync(outputManifest)
  ? JSON.parse(await readFile(outputManifest, 'utf8')) : null;
if (merged && (merged.schema !== expectedSchema || merged.captureRevision !== expectedRevision ||
    !Array.isArray(merged.artifacts))) throw new Error('Existing family manifest has the wrong schema/revision');

for (const rig of rigs) {
  const archive = join(archiveDir, `${rig}-v3.tar.gz`);
  const check = (await readFile(`${archive}.sha256`, 'utf8')).trim();
  if (check !== `${await sha256(archive)}  ${basename(archive)}`)
    throw new Error(`${rig}: transferred archive SHA256 mismatch`);
  const scratch = await mkdtemp(join(tmpdir(), `flow-fest-${rig}-`));
  try {
    const listing = spawnSync('tar.exe', ['-tzf', archive], { encoding: 'utf8' });
    if (listing.status !== 0) throw new Error(`${rig}: archive listing failed: ${listing.stderr}`);
    const names = listing.stdout.trim().split(/\r?\n/);
    if (names.length !== 166 || names.some(name => name !== basename(name) || name.includes('..')) ||
        new Set(names).size !== names.length)
      throw new Error(`${rig}: invalid archive entries`);
    const extract = spawnSync('tar.exe', ['-xzf', archive, '-C', scratch], { encoding: 'utf8' });
    if (extract.status !== 0) throw new Error(`${rig}: archive extraction failed: ${extract.stderr}`);
    const lines = (await readFile(join(scratch, 'SHA256SUMS'), 'utf8')).trim().split(/\r?\n/);
    const expected = new Map(lines.map(line => {
      const match = /^([0-9a-f]{64})  ([^\\/]+)$/.exec(line);
      if (!match) throw new Error(`${rig}: malformed checksum line`);
      return [match[2], match[1]];
    }));
    if (expected.size !== 165 || names.some(name => name !== 'SHA256SUMS' && !expected.has(name)))
      throw new Error(`${rig}: missing or duplicate archive checksums`);
    for (const [name, hash] of expected)
      if (hash !== await sha256(join(scratch, name))) throw new Error(`${rig}: ${name} SHA256 mismatch`);
    const manifest = JSON.parse(await readFile(join(scratch, 'family-manifest.json'), 'utf8'));
    if (manifest.schema !== expectedSchema || manifest.captureRevision !== expectedRevision ||
        manifest.artifacts.length !== 82 || manifest.artifacts.some(entry => entry.character !== rig))
      throw new Error(`${rig}: invalid rig manifest`);
    if (!merged) merged = { ...manifest, artifacts: [] };
    const prior = new Map(merged.artifacts.map(entry => [`${entry.character}:${entry.role}`, entry]));
    for (const entry of manifest.artifacts) {
      const key = `${rig}:${entry.role}`;
      if (prior.has(key)) {
        if (JSON.stringify(prior.get(key)) !== JSON.stringify(entry))
          throw new Error(`${rig}: conflicting manifest entry ${key}`);
      } else {
        merged.artifacts.push(entry);
        prior.set(key, entry);
      }
    }
    for (const name of names.filter(name => name !== 'family-manifest.json' && name !== 'SHA256SUMS')) {
      const target = join(output, name);
      if (existsSync(target)) {
        if (await sha256(target) !== expected.get(name)) throw new Error(`${rig}: conflicting existing ${name}`);
      } else {
        await copyFile(join(scratch, name), target);
      }
    }
    const pending = `${outputManifest}.partial`;
    await writeFile(pending, `${JSON.stringify(merged, null, 2)}\n`);
    await rename(pending, outputManifest);
    console.log(`${rig}: merged 82 clips; ${merged.artifacts.length} total profiles`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
