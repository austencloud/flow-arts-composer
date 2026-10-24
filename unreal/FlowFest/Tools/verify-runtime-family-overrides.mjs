/** Read-only package gate for the four required full-fidelity staff overrides. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Usage: node verify-runtime-family-overrides.mjs <data-directory> [source-data-directory]');
const data = resolve(process.argv[2]);
const source = process.argv[3] ? resolve(process.argv[3]) : data;
const read = path => readFile(path);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const parse = async path => JSON.parse((await read(path)).toString('utf8'));
const fail = message => { throw new Error(message); };
const ids = ['x-bot/P_staff_A', 'x-bot/P_staff_B', 'ch34/P_staff_A', 'ch34/P_staff_B'];
const manifestPath = join(data, 'RuntimeFamilyMotion/manifest.json');
const manifestBytes = await read(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const library = await parse(join(source, 'performance-library.json'));
const rigs = (await parse(join(source, 'runtime-rigs.json'))).rigs;
if (manifest.schema !== 'flow-arts-runtime-family-overrides-v1' ||
    !Array.isArray(manifest.entries) || manifest.entries.length !== 4 ||
    new Set(manifest.entries.map(entry => entry.id)).size !== 4 ||
    manifest.entries.some(entry => !ids.includes(entry.id))) fail('Incomplete runtime family override manifest');
if (source !== data && digest(manifestBytes) !== digest(await read(join(source, 'RuntimeFamilyMotion/manifest.json'))))
  fail('Staged runtime family override manifest differs from source');

for (const id of ids) {
  const entry = manifest.entries.find(row => row.id === id);
  const [characterId, profile] = id.split('/');
  const filename = `${characterId}_${profile}.motion.json`;
  const bytes = await read(join(data, 'RuntimeFamilyMotion', filename));
  const prepared = library.entries.filter(row => row.characterId === characterId && row.profile === profile);
  if (!/^[0-9a-f]{64}$/.test(entry.bundleSHA256) || digest(bytes) !== entry.bundleSHA256 ||
      source !== data && digest(bytes) !== digest(await read(join(source, 'RuntimeFamilyMotion', filename))) ||
      prepared.length !== 1 || prepared[0].propFamily !== 'staff')
    fail(`Missing, altered, or unprepared override: ${id}`);
  const bundle = JSON.parse(bytes.toString('utf8'));
  if (bundle.schema !== 'flow-arts-runtime-motion-v1' ||
      bundle.captureRevision !== 'monotonic-dynamic-grip-v5' ||
      bundle.characterId !== characterId || bundle.propFamily !== 'staff' ||
      !['staff', 'staff:default'].includes(bundle.propId) || bundle.propId !== entry.propId ||
      bundle.capturePlane !== undefined && bundle.capturePlane !== 'wall' ||
      bundle.skeleton?.rigSHA256 !== rigs[characterId] ||
      bundle.sequenceSHA256 !== entry.sequenceSHA256 ||
      bundle.sequenceSHA256 !== prepared[0].sequenceSHA256 ||
      bundle.sequenceJson !== prepared[0].sequenceJson ||
      digest(Buffer.from(bundle.sequenceJson ?? '', 'utf8')) !== bundle.sequenceSHA256 ||
      bundle.loop !== true || bundle.fps !== 30 ||
      bundle.frameCount !== 480 || bundle.frames?.length !== 480 ||
      !Number.isFinite(bundle.effectivePropLengthCm) || bundle.effectivePropLengthCm <= 0 ||
      !Number.isFinite(bundle.gripValidation?.maxErrorCm) ||
      bundle.gripValidation.maxErrorCm < 0 || bundle.gripValidation.maxErrorCm > 0.2 ||
      bundle.gripValidation.sideSamples !== 960 ||
      !bundle.frames.every(frame => Array.isArray(frame.palmLocal) && frame.palmLocal.length === 6 &&
        frame.palmLocal.every(Number.isFinite) && Number.isFinite(frame.gripRelaxation) &&
        Array.isArray(frame.propVisibility) && frame.propVisibility.length === 2 &&
        frame.propVisibility.every(value => typeof value === 'boolean')))
    fail(`Invalid full-fidelity runtime family override: ${id}`);
}
console.log('Verified four exact runtime family staff overrides in', data);
