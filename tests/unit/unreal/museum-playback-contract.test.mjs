import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { museumPerformanceEntries, assertMuseumRawCapture, assertMuseumCompactClip,
  MUSEUM_PROP_COORDINATE_BASIS } from
  '../../../unreal/Shared/Tools/museum-performance-contract.mjs';
import { verifyPlaybackData } from '../../../unreal/MuseumGame/Tools/verify-playback-data.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const put = async (path, bytes) => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); };
const transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
const frame = index => ({ frame: index, performerWorld: structuredClone(transform), skinnedMeshLocal: structuredClone(transform),
  bones: [{ name: 'Hips', local: structuredClone(transform) }], leftHandWorld: [0, 0, 0], rightHandWorld: [0, 0, 0],
  leftProp: { propRootWorld: structuredClone(transform), rotatedBodyWorld: structuredClone(transform) },
  rightProp: { propRootWorld: structuredClone(transform), rotatedBodyWorld: structuredClone(transform) } });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'museum-playback-test-'));
  const project = join(root, 'project'), captures = join(root, 'raw'), packagedData = join(root, 'packaged');
  const data = join(project, 'Content/Data');
  const performances = Array.from({ length: 25 }, (_, i) => ({
    sequenceId: `s-${i}`, profile: `M_s_${i}`,
    sequence: { id: `museum-native-s-${i}`, steps: [i === 0 ? { duration: 2 } : { duration: 1 }] },
  }));
  const manifest = { schema: 'museum-native-performances-v1', characterId: 'x-bot',
    propId: 'staff', performances };
  const stations = Array.from({ length: 31 }, (_, i) => {
    const entry = performances[i % 25];
    return { id: `station-${i}`, sequenceId: entry.sequenceId,
      nativePlayback: { characterId: 'x-bot', propId: 'staff', profile: entry.profile,
        bodyVisible: i !== 30, rate: 1 } };
  });
  stations.push({ id: 'static-1' }, { id: 'static-2' });
  await put(join(data, 'museum.json'), JSON.stringify({ performers: stations }));
  await put(join(data, 'museum-performances.json'), JSON.stringify(manifest));
  const clips = [];
  for (const entry of museumPerformanceEntries(manifest)) {
    const raw = { schema: 'flow-fest-native-performance-v1', character: 'x-bot',
      role: entry.profile, propType: 'staff', fps: 30,
      captureRevision: 'clock-isolated-body-v3', sequence: entry.sequence,
      frames: Array.from({ length: entry.frames }, (_, i) => frame(i)) };
    const rawBytes = Buffer.from(JSON.stringify(raw));
    await put(join(captures, entry.filename), rawBytes);
    const clip = { schema: 'flow-fest-prop-motion-v3', character: 'x-bot', profile: entry.profile,
      propId: 'staff', fps: 30, sourceFrameCount: entry.frames,
      captureRevision: 'clock-isolated-body-v3', sourceSHA256: hash(rawBytes),
      coordinateBasis: MUSEUM_PROP_COORDINATE_BASIS,
      frames: Array.from({ length: entry.frames }, () => Array(28).fill(0)) };
    await put(join(data, 'PropMotion', entry.filename), JSON.stringify(clip));
    clips.push({ character: 'x-bot', profile: entry.profile, sequenceId: entry.sequenceId,
      filename: entry.filename, frames: entry.frames, sourceSHA256: clip.sourceSHA256,
      schema: clip.schema, captureRevision: clip.captureRevision });
    await put(join(project, 'Content/FlowFest/Characters/x_bot', `A_Flow_${entry.profile}.uasset`), 'asset');
  }
  await put(join(data, 'PropMotion/manifest.json'), JSON.stringify({
    schema: 'flow-fest-prop-motion-manifest-v1', clips }));
  const assets = [];
  for (const path of ['Content/FlowFest/Characters/x_bot/SK_x_bot.uasset',
    'Content/FlowFest/Characters/x_bot/SK_x_bot_Skeleton.uasset',
    'Content/Data/characters.json', 'Content/Data/props.json']) {
    const bytes = Buffer.from('asset');
    await put(join(project, path), bytes);
    assets.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  await put(join(data, 'shared-assets.json'), JSON.stringify({
    schema: 'museum-shared-assets-v1', characterId: 'x-bot', mount: '/Game/FlowFest', assets }));
  await cp(data, packagedData, { recursive: true });
  return { root, project, captures, packagedData, data, manifest, performances };
}

test('explicit zero duration and stale sequence fail the shared contract', () => {
  const manifest = { schema: 'museum-native-performances-v1', characterId: 'x-bot', propId: 'staff',
    performances: [{ sequenceId: 'zero', profile: 'M_zero', sequence: { steps: [{ duration: 0 }] } }] };
  assert.throws(() => museumPerformanceEntries(manifest), /step duration/);
  manifest.performances[0].sequence.steps[0].duration = 1;
  const entry = museumPerformanceEntries(manifest)[0];
  const raw = { schema: 'flow-fest-native-performance-v1', character: 'x-bot', role: entry.profile,
    propType: 'staff', fps: 30, captureRevision: 'clock-isolated-body-v3',
    sequence: { steps: [{ duration: 2 }] }, frames: Array.from({ length: 30 }, (_, i) => frame(i)) };
  assert.throws(() => assertMuseumRawCapture(raw, entry), /sequence/);
  raw.sequence = entry.sequence;
  raw.frames[0].leftProp.rotatedBodyWorld.position[0] = Number.NaN;
  assert.throws(() => assertMuseumRawCapture(raw, entry), /transform/);
});

test('pre-import, imported, and packaged stages validate data and hashes', async () => {
  const f = await fixture();
  try {
    assert.equal(museumPerformanceEntries(f.manifest)[0].frames, 60);
    assert.equal((await verifyPlaybackData(f)).profiles, 25);
    assert.equal((await verifyPlaybackData({ ...f, stage: 'imported' })).imported, 25);
    assert.equal((await verifyPlaybackData({ ...f, stage: 'packaged' })).stations, 33);
    const rawPath = join(f.captures, 'x_bot_M_s_0.json');
    const rawBytes = await readFile(rawPath);
    await rm(rawPath);
    await assert.rejects(verifyPlaybackData(f), /ENOENT/);
    await put(rawPath, rawBytes);
    const clipPath = join(f.data, 'PropMotion/x_bot_M_s_0.json');
    const clip = JSON.parse(await readFile(clipPath));
    clip.sourceSHA256 = '0'.repeat(64);
    assert.throws(() => assertMuseumCompactClip(clip, museumPerformanceEntries(f.manifest)[0],
      rawBytes), /hash mismatch/);
    await put(clipPath, JSON.stringify(clip));
    await assert.rejects(verifyPlaybackData(f), /Compact manifest mismatch/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
