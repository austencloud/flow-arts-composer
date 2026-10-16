/** Verify Museum's authored performer map, captured motion, imported assets, and staged Data. */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { museumPerformanceEntries, assertMuseumRawCapture,
  assertMuseumCompactShape, assertMuseumCompactClip } from '../../Shared/Tools/museum-performance-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const requiredFile = async path => {
  const info = await stat(path);
  if (!info.isFile() || !info.size) throw new Error(`Missing or empty file: ${path}`);
  return info;
};

function assertMap(scene, entries) {
  const stations = scene.performers;
  if (!Array.isArray(stations) || stations.length !== 33)
    throw new Error(`Expected 33 Museum stations, found ${stations?.length}`);
  if (entries.length !== 25) throw new Error(`Expected 25 exact sequence profiles, found ${entries.length}`);
  const byId = new Map(entries.map(entry => [entry.sequenceId, entry]));
  const ids = new Set();
  let animated = 0, hidden = 0, staticCount = 0;
  const used = new Set();
  for (const station of stations) {
    if (typeof station.id !== 'string' || ids.has(station.id))
      throw new Error(`Duplicate or invalid Museum station: ${station.id}`);
    ids.add(station.id);
    if (!station.nativePlayback) {
      if (station.sequenceId) throw new Error(`Station lacks native playback: ${station.id}`);
      staticCount++;
      continue;
    }
    animated++;
    const entry = byId.get(station.sequenceId);
    const playback = station.nativePlayback;
    if (!entry || playback.profile !== entry.profile || playback.characterId !== 'x-bot' ||
        playback.propId !== 'staff' || !Number.isFinite(playback.rate) || playback.rate <= 0 ||
        typeof playback.bodyVisible !== 'boolean')
      throw new Error(`Station playback disagrees with manifest: ${station.id}`);
    used.add(entry.sequenceId);
    if (!playback.bodyVisible) hidden++;
  }
  if (animated !== 31 || hidden !== 1 || staticCount !== 2 || used.size !== 25)
    throw new Error(`Museum station census mismatch: ${animated} animated, ${hidden} hidden, ${staticCount} static, ${used.size} profiles`);
}

async function assertReceipt(project) {
  const receipt = await json(join(project, 'Content/Data/shared-assets.json'));
  if (receipt.schema !== 'museum-shared-assets-v1' || receipt.characterId !== 'x-bot' ||
      receipt.mount !== '/Game/FlowFest' || !Array.isArray(receipt.assets) || !receipt.assets.length)
    throw new Error('Invalid Museum shared asset receipt');
  const seen = new Set();
  for (const asset of receipt.assets) {
    const path = asset.path;
    if (typeof path !== 'string' || !path.startsWith('Content/') || isAbsolute(path) ||
        relative(project, resolve(project, path)).startsWith('..') || seen.has(path) ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !/^[a-f0-9]{64}$/.test(asset.sha256))
      throw new Error(`Invalid shared asset receipt entry: ${path}`);
    seen.add(path);
    const bytes = await readFile(join(project, path));
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
      throw new Error(`Copied shared asset hash mismatch: ${path}`);
  }
  for (const essential of ['Content/FlowFest/Characters/x_bot/SK_x_bot.uasset',
    'Content/FlowFest/Characters/x_bot/SK_x_bot_Skeleton.uasset',
    'Content/Data/characters.json', 'Content/Data/props.json']) {
    if (!seen.has(essential)) throw new Error(`Missing shared asset receipt entry: ${essential}`);
  }
  return receipt.assets.length;
}

async function assertImported(project, entries) {
  const folder = join(project, 'Content/FlowFest/Characters/x_bot');
  const expected = new Set(entries.map(entry => `A_Flow_${entry.profile}.uasset`));
  const actual = (await readdir(folder)).filter(name => /^A_Flow_M_.*\.uasset$/.test(name));
  if (actual.length !== 25 || actual.some(name => !expected.has(name)))
    throw new Error(`Expected 25 imported Museum animation assets, found ${actual.length}`);
  for (const name of expected) await requiredFile(join(folder, name));
}

async function assertPackagedData(project, packagedData, entries) {
  const names = ['museum.json', 'museum-performances.json', 'shared-assets.json',
    'characters.json', 'props.json', 'PropMotion/manifest.json',
    ...entries.map(entry => `PropMotion/${entry.filename}`)];
  for (const name of names) {
    const source = await readFile(join(project, 'Content/Data', name));
    const staged = await readFile(join(packagedData, name));
    if (source.length !== staged.length || sha256(source) !== sha256(staged))
      throw new Error(`Packaged Data differs from project: ${name}`);
  }
}

export async function verifyPlaybackData({ project, captures, stage = 'pre-import', packagedData }) {
  if (!['pre-import', 'imported', 'packaged'].includes(stage))
    throw new Error(`Unknown verification stage: ${stage}`);
  project = resolve(project);
  const data = join(project, 'Content/Data');
  const entries = museumPerformanceEntries(await json(join(data, 'museum-performances.json')));
  assertMap(await json(join(data, 'museum.json')), entries);
  const assetCount = await assertReceipt(project);
  const compactManifest = await json(join(data, 'PropMotion/manifest.json'));
  const listed = compactManifest.clips?.filter(clip => clip.profile?.startsWith('M_'));
  if (compactManifest.schema !== 'flow-fest-prop-motion-manifest-v1' ||
      compactManifest.clips?.length !== 25 || listed?.length !== 25 ||
      new Set(listed.map(clip => clip.profile)).size !== 25)
    throw new Error('Expected 25 Museum compact clips in prop manifest');
  const listedByProfile = new Map(listed.map(clip => [clip.profile, clip]));
  if (stage !== 'packaged' && !captures) throw new Error('--captures is required before packaging');
  for (const entry of entries) {
    const clipPath = join(data, 'PropMotion', entry.filename);
    const clip = await json(clipPath);
    const listedClip = listedByProfile.get(entry.profile);
    if (!listedClip || listedClip.character !== 'x-bot' ||
        listedClip.schema !== 'flow-fest-prop-motion-v3' ||
        listedClip.captureRevision !== 'clock-isolated-body-v3' ||
        listedClip.filename !== entry.filename ||
        listedClip.frames !== entry.frames || listedClip.sequenceId !== entry.sequenceId ||
        listedClip.sourceSHA256 !== clip.sourceSHA256)
      throw new Error(`Compact manifest mismatch: ${entry.profile}`);
    if (stage === 'packaged') assertMuseumCompactShape(clip, entry);
    else {
      const rawBytes = await readFile(join(resolve(captures), entry.filename));
      assertMuseumRawCapture(JSON.parse(rawBytes), entry);
      assertMuseumCompactClip(clip, entry, rawBytes);
    }
  }
  if (stage === 'imported') await assertImported(project, entries);
  if (stage === 'packaged') {
    if (!packagedData) throw new Error('--packaged-data is required for packaged verification');
    await assertPackagedData(project, resolve(packagedData), entries);
  }
  return { stage, stations: 33, animated: 31, hidden: 1, static: 2,
    profiles: entries.length, imported: stage === 'imported' ? 25 : null, receiptAssets: assetCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = name => {
    const i = process.argv.indexOf(name);
    return i < 0 ? null : process.argv[i + 1];
  };
  if (['--project', '--captures', '--stage', '--packaged-data'].some(name =>
    process.argv.includes(name) && !option(name)))
    throw new Error('Verification options require values');
  const result = await verifyPlaybackData({
    project: option('--project') || resolve(here, '..'),
    captures: option('--captures'),
    stage: option('--stage') || 'pre-import',
    packagedData: option('--packaged-data'),
  });
  console.log(`MUSEUM_PLAYBACK_VERIFIED ${JSON.stringify(result)}`);
}
