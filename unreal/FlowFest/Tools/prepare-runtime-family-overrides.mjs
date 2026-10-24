/** Package four independently validated v5 staff bundles without changing the v3 family archive. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node prepare-runtime-family-overrides.mjs <validated-bundle-directory>');
const destination = join(project, 'Content/Data/RuntimeFamilyMotion');
const library = JSON.parse(await readFile(join(project, 'Content/Data/performance-library.json'), 'utf8'));
const rigs = JSON.parse(await readFile(join(project, 'Content/Data/runtime-rigs.json'), 'utf8')).rigs;
const entries = [];
const files = [];
for (const characterId of ['x-bot', 'ch34']) {
  for (const variant of ['A', 'B']) {
    const profile = `P_staff_${variant}`;
    const id = `${characterId}/${profile}`;
    const prepared = library.entries.filter(entry => entry.characterId === characterId && entry.profile === profile);
    if (prepared.length !== 1 || prepared[0].propFamily !== 'staff')
      throw new Error(`Missing unique prepared staff score: ${id}`);
    const input = join(source, `${characterId}_family-staff-${variant}.motion.json`);
    const bytes = await readFile(input);
    const bundle = JSON.parse(bytes.toString('utf8'));
    if (bundle.schema !== 'flow-arts-runtime-motion-v1' ||
        bundle.captureRevision !== 'monotonic-dynamic-grip-v5' ||
        bundle.characterId !== characterId || bundle.propFamily !== 'staff' ||
        !['staff', 'staff:default'].includes(bundle.propId) ||
        bundle.capturePlane !== undefined && bundle.capturePlane !== 'wall' ||
        bundle.skeleton?.rigSHA256 !== rigs[characterId] ||
        bundle.sequenceSHA256 !== prepared[0].sequenceSHA256 ||
        bundle.sequenceJson !== prepared[0].sequenceJson ||
        bundle.loop !== true || bundle.fps !== 30 ||
        bundle.frameCount !== 480 || bundle.frames?.length !== 480 ||
        !Number.isFinite(bundle.effectivePropLengthCm) || bundle.effectivePropLengthCm <= 0 ||
        !Number.isFinite(bundle.gripValidation?.maxErrorCm) ||
        bundle.gripValidation.maxErrorCm < 0 || bundle.gripValidation.maxErrorCm > 0.2 ||
        bundle.gripValidation?.sideSamples !== 960 ||
        !bundle.frames.every(frame => Array.isArray(frame.palmLocal) && frame.palmLocal.length === 6 &&
          frame.palmLocal.every(Number.isFinite) && Number.isFinite(frame.gripRelaxation) &&
          Array.isArray(frame.propVisibility) && frame.propVisibility.length === 2 &&
          frame.propVisibility.every(value => typeof value === 'boolean')))
      throw new Error(`Packaged runtime bundle does not match the validated staff capture: ${id}`);
    const filename = `${characterId}_${profile}.motion.json`;
    entries.push({ id, propId: bundle.propId, sequenceSHA256: bundle.sequenceSHA256,
      bundleSHA256: createHash('sha256').update(bytes).digest('hex') });
    files.push({ filename, bytes });
  }
}
await mkdir(destination, { recursive: true });
for (const { filename, bytes } of files) await writeFile(join(destination, filename), bytes);
await writeFile(join(destination, 'manifest.json'), JSON.stringify({
  schema: 'flow-arts-runtime-family-overrides-v1', entries,
}) + '\n');
console.log(JSON.stringify({ destination, entries }, null, 2));
