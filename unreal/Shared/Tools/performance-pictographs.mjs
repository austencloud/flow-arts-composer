import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPerformanceLibrary, libraryPath } from './performance-library.mjs';

const SCHEMA = 'tka-performance-pictographs-v1';
const STYLE = 'light-v1';
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));

export const pictographManifestPath = project => join(resolve(project), 'Content/Data/performance-pictographs.json');

function insideData(dataDirectory, relativePath) {
  insist(typeof relativePath === 'string' && /^Pictographs\/[a-z0-9-]+\/step-\d{4}\.png$/.test(relativePath) &&
    !isAbsolute(relativePath) && !relativePath.includes('..') && !relativePath.includes('\\'),
  `Unsafe pictograph path: ${relativePath}`);
  const base = resolve(dataDirectory);
  const full = resolve(base, ...relativePath.split('/'));
  insist(full.startsWith(base + sep), `Pictograph path leaves Data: ${relativePath}`);
  return full;
}

function scoreSteps(entry) {
  insist(typeof entry.id === 'string' && entry.id.length > 0 && /^[a-f0-9]{64}$/.test(entry.sequenceSHA256), 'Invalid performance identity');
  insist(typeof entry.propFamily === 'string' && /^[a-z0-9-]+$/.test(entry.propFamily), `${entry.id}: invalid prop family`);
  insist(Number.isFinite(entry.scoreUnitsPerSecond) && entry.scoreUnitsPerSecond > 0 && Number.isFinite(entry.durationSeconds) && entry.durationSeconds > 0,
    `${entry.id}: invalid timing`);
  const sequence = JSON.parse(entry.sequenceJson);
  insist(Array.isArray(sequence.steps) && sequence.steps.length > 0, `${entry.id}: no score steps`);
  let elapsed = 0;
  const steps = sequence.steps.map((step, index) => {
    const duration = step.duration ?? 1;
    insist(Number.isFinite(duration) && duration > 0 && step.motions?.left && step.motions?.right,
      `${entry.id}: invalid step ${index}`);
    const startSeconds = elapsed / entry.scoreUnitsPerSecond;
    elapsed += duration;
    const endSeconds = elapsed / entry.scoreUnitsPerSecond;
    insist(Number.isFinite(endSeconds) && endSeconds > startSeconds, `${entry.id}: invalid step time ${index}`);
    const letter = step.letter ?? '';
    insist(typeof letter === 'string', `${entry.id}: invalid letter ${index}`);
    const image = `Pictographs/${entry.sequenceSHA256}-${entry.propFamily}-${STYLE}/step-${String(index).padStart(4, '0')}.png`;
    return { index, letter, startSeconds, endSeconds, image, source: step, sequence };
  });
  // The library duration derives from the captured frame count. Allow one
  // 30 fps frame of rounding plus a small numeric tolerance.
  insist(Math.abs(steps.at(-1).endSeconds - entry.durationSeconds) <= 0.05,
    `${entry.id}: score and captured clip durations differ`);
  return steps;
}

function pictographInput(step) {
  const source = step.source;
  return {
    letter: step.letter,
    startPlacement: source.startPlacement ?? undefined,
    endPlacement: source.endPlacement ?? undefined,
    leftMotion: { ...source.motions.left, hand: 'left' },
    rightMotion: { ...source.motions.right, hand: 'right' },
    leftReversal: !!source.leftReversal,
    rightReversal: !!source.rightReversal,
    gridMode: source.gridMode ?? step.sequence.gridMode,
    conjoined: step.sequence.conjoined ?? null,
  };
}

export async function buildPictographs(library, dataDirectory, render) {
  insist(library?.schema === 'tka-performance-library-v1' && Array.isArray(library.entries), 'Invalid performance library');
  const rendered = new Map();
  const entries = [];
  for (const entry of library.entries) {
    const steps = [];
    for (const step of scoreSteps(entry)) {
      const file = insideData(dataDirectory, step.image);
      let bytes = rendered.get(step.image);
      if (!bytes) {
        bytes = await render(pictographInput(step), entry.propFamily);
        insist(Buffer.isBuffer(bytes) && bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${entry.id}: renderer did not produce PNG`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, bytes);
        rendered.set(step.image, bytes);
      }
      const { index, letter, startSeconds, endSeconds, image } = step;
      steps.push({ index, letter, startSeconds, endSeconds, image, imageSHA256: sha256(bytes) });
    }
    entries.push({ id: entry.id, sequenceSHA256: entry.sequenceSHA256, steps });
  }
  const manifest = { schema: SCHEMA, entries };
  const file = join(dataDirectory, 'performance-pictographs.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return { entries: entries.length, images: rendered.size, file };
}

export async function renderPictographsFromLibrary(library, dataDirectory) {
  const { getStandaloneRenderer } = await import('../../../mcp-server/src/core/standalone-renderer.ts');
  const renderer = getStandaloneRenderer();
  return buildPictographs(library, dataDirectory, (input, propFamily) => renderer.renderToPng(input, {
    size: 400, darkMode: false, showTKA: true, showGrid: true,
    showLeftMotion: true, showRightMotion: true, showPlacements: false,
    leftPropType: propFamily, rightPropType: propFamily,
  }));
}

export function verifyPictographs(library, dataDirectory, packagedData) {
  insist(library?.schema === 'tka-performance-library-v1' && Array.isArray(library.entries), 'Invalid performance library');
  const file = join(dataDirectory, 'performance-pictographs.json');
  insist(existsSync(file), `Missing performance pictographs: ${file}`);
  const manifest = read(file);
  insist(manifest?.schema === SCHEMA && Array.isArray(manifest.entries) && manifest.entries.length === library.entries.length,
    'Invalid performance pictograph manifest');
  const checked = new Set();
  for (const [entryIndex, sourceEntry] of library.entries.entries()) {
    const record = manifest.entries[entryIndex];
    const expected = scoreSteps(sourceEntry);
    insist(record?.id === sourceEntry.id && record.sequenceSHA256 === sourceEntry.sequenceSHA256 &&
      Array.isArray(record.steps) && record.steps.length === expected.length,
    `${sourceEntry.id}: pictograph manifest differs from library`);
    for (const [index, step] of expected.entries()) {
      const actual = record.steps[index];
      insist(actual?.index === step.index && actual.letter === step.letter &&
        actual.startSeconds === step.startSeconds && actual.endSeconds === step.endSeconds &&
        actual.image === step.image && /^[a-f0-9]{64}$/.test(actual.imageSHA256),
      `${sourceEntry.id}: pictograph step ${index} differs from score`);
      const image = insideData(dataDirectory, actual.image);
      insist(existsSync(image), `Missing pictograph: ${image}`);
      if (!checked.has(actual.image)) {
        const bytes = readFileSync(image);
        insist(bytes.subarray(0, 8).equals(PNG_SIGNATURE) && sha256(bytes) === actual.imageSHA256,
          `Pictograph hash mismatch: ${actual.image}`);
        if (packagedData) {
          const staged = insideData(packagedData, actual.image);
          insist(existsSync(staged) && sha256(readFileSync(staged)) === actual.imageSHA256,
            `Packaged pictograph missing or stale: ${actual.image}`);
        }
        checked.add(actual.image);
      }
    }
  }
  if (packagedData) {
    const staged = join(resolve(packagedData), 'performance-pictographs.json');
    insist(existsSync(staged) && sha256(readFileSync(staged)) === sha256(readFileSync(file)),
      'Packaged performance pictograph manifest missing or stale');
  }
  return { entries: manifest.entries.length, images: checked.size };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = name => {
    const index = args.indexOf(`--${name}`);
    if (index < 0) return undefined;
    const value = args[index + 1];
    insist(value && !value.startsWith('--'), `--${name} requires a path`);
    return resolve(value);
  };
  const project = option('project');
  insist(project, '--project is required');
  await verifyPerformanceLibrary(project);
  const library = read(libraryPath(project));
  const data = join(project, 'Content/Data');
  if (command === 'build') {
    const result = await renderPictographsFromLibrary(library, data);
    console.log(JSON.stringify(result));
  } else if (command === 'verify') {
    console.log(JSON.stringify(verifyPictographs(library, data, option('packaged-data'))));
  } else {
    throw new Error('Use performance-pictographs.mjs build|verify --project <path> [--packaged-data <Content/Data>]');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
