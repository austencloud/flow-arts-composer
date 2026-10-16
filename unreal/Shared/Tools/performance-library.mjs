import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify, validateCaptureProvenance } from './capture-provenance.mjs';
import { fileHash, resolvedInside, verify } from './performance-bundle.mjs';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const insist = (condition, message) => { if (!condition) throw new Error(message); };
export const libraryPath = project => join(resolve(project), 'Content/Data/performance-library.json');

export async function createPerformanceLibrary(project) {
  project = resolve(project);
  // Legacy clips have no exact score identity. Keep them in their existing game
  // controls, but never offer one as a match for an editable Composer sequence.
  verify(project);
  const bundleFile = join(project, 'Content/Data/performance-bundles.json');
  const bundles = existsSync(bundleFile) ? read(bundleFile) : { entries: {} };
  const entries = [];
  for (const [id, bundle] of Object.entries(bundles.entries).sort(([a], [b]) => a.localeCompare(b))) {
    const captureFile = resolvedInside(project, bundle.paths.capture);
    insist(fileHash(captureFile) === bundle.captureSHA256, `${id} capture changed during library export`);
    const capture = read(captureFile);
    const provenance = await validateCaptureProvenance(capture);
    insist(stableStringify(provenance) === stableStringify(bundle.provenance), `${id} capture and bundle provenance differ`);
    insist(provenance.rig.characterId === bundle.character, `${id} character differs from capture`);
    const sequence = capture.sequence;
    insist(typeof sequence.id === 'string' && sequence.id.length > 0 && Array.isArray(sequence.steps) && sequence.steps.length > 0,
      `${id} capture has no editable sequence`);
    entries.push({
      id,
      characterId: bundle.character,
      profile: bundle.profile,
      propFamily: provenance.props.family,
      title: sequence.name || sequence.word || sequence.id,
      sequenceSHA256: provenance.sequenceSHA256,
      sequenceJson: stableStringify(sequence),
      durationSeconds: provenance.clock.frameCount / provenance.clock.fps,
      scoreUnitsPerSecond: provenance.clock.scoreUnitsPerSecond,
    });
  }
  return { schema: 'tka-performance-library-v1', entries };
}

export async function writePerformanceLibrary(project) {
  const library = await createPerformanceLibrary(project);
  const file = libraryPath(project);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(library, null, 2) + '\n');
  return library;
}

export async function verifyPerformanceLibrary(project, packagedData) {
  const expected = await createPerformanceLibrary(project);
  const file = libraryPath(project);
  insist(existsSync(file), `Missing performance library: ${file}`);
  insist(stableStringify(read(file)) === stableStringify(expected), 'Performance library is stale; regenerate it from the verified bundles');
  if (packagedData) {
    const packaged = join(resolve(packagedData), 'performance-library.json');
    insist(existsSync(packaged) && fileHash(packaged) === fileHash(file), 'Packaged performance library is missing or stale');
  }
  return { entries: expected.entries.length, exactSequences: new Set(expected.entries.map(entry => entry.sequenceSHA256)).size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const option = name => {
    const index = args.indexOf(`--${name}`);
    if (index < 0) return undefined;
    const value = args[index + 1];
    insist(value && !value.startsWith('--'), `--${name} requires a path`);
    return resolve(value);
  };
  try {
    const project = option('project');
    insist(project, '--project is required');
    if (command === 'build') {
      const library = await writePerformanceLibrary(project);
      console.log(JSON.stringify({ library: libraryPath(project), entries: library.entries.length }));
    } else if (command === 'verify') {
      console.log(JSON.stringify(await verifyPerformanceLibrary(project, option('packaged-data'))));
    } else {
      throw new Error('Use performance-library.mjs build|verify --project <path> [--packaged-data <path>]');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
