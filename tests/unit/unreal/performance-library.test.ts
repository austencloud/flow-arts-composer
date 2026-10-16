import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { baseline, fileHash, recordBody, recordDecodedRig, recordFbx, recordImport, seal } from '../../../unreal/Shared/Tools/performance-bundle.mjs';
import { buildId, sha256, stableStringify } from '../../../unreal/Shared/Tools/capture-provenance.mjs';
import { createPerformanceLibrary, libraryPath, verifyPerformanceLibrary, writePerformanceLibrary } from '../../../unreal/Shared/Tools/performance-library.mjs';

const roots: string[] = [];
const put = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
};
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function fixture() {
  const project = mkdtempSync(join(tmpdir(), 'performance-library-'));
  roots.push(project);
  const sourceRig = join(project, 'rig.glb'), decodedRig = join(project, 'decoded.glb');
  const stage = join(project, 'Tools/staged/Characters/x_bot');
  const body = join(stage, 'capture_P_staff_A.glb'), fbx = join(stage, 'A_Flow_P_staff_A.fbx');
  const converter = join(project, 'Tools/convert-characters.py'), importer = join(project, 'Tools/import-characters.py');
  const asset = join(project, 'Content/FlowFest/Characters/x_bot/A_Flow_P_staff_A.uasset');
  const captureFile = join(project, 'Saved/PerformanceCaptures/raw.json');
  for (const [file, content] of [[sourceRig, 'rig'], [decodedRig, 'decoded'], [body, 'body'], [fbx, 'fbx'], [converter, 'converter'], [importer, 'importer'], [asset, 'asset']]) put(file!, content!);
  const sequence = { id: 'score-identity', name: 'A complete score', word: 'AB', steps: [{ id: 'step-1', duration: 1.5 }],
    metadata: { note: 'Retain me', custom: [3, 1, 2] }, performers: [{ id: 'lead', propType: 'staff' }], tags: ['museum'] };
  const build = { sourceCommit: 'commit', sourceSHA256: await sha256('source'), outputSHA256: await sha256('output') };
  const provenance = { schema: 'tka-performance-capture-v1', build: { ...build, id: await buildId(build) },
    sequenceSHA256: await sha256(stableStringify(sequence)), rig: { characterId: 'x-bot', sourcePath: 'rig.glb', sourceSHA256: fileHash(sourceRig) },
    props: { family: 'staff', buildSHA256: build.outputSHA256, assets: [] },
    motionOptions: { bodyClearance: null, enableLocomotion: true, enableFootPlanting: true, playbackSpeed: 1, phaseOffsetSteps: 0, showEffects: false },
    clock: { fps: 30, frameCount: 2, scoreUnitsPerSecond: 2, loopClosure: 'first-frame-at-duration' } };
  const capture = { schema: 'flow-fest-native-performance-v1', character: 'x-bot', role: 'family-staff-A', propType: 'staff',
    fps: 30, scoreUnitsPerSecond: 2, sequence, frames: [{ frame: 0 }, { frame: 1 }], provenance };
  put(captureFile, capture);
  recordDecodedRig(decodedRig, sourceRig);
  await recordBody({ body, captureFile, capture, character: 'x-bot', profile: 'P_staff_A', propId: 'staff', sourceRig, decodedRig });
  await recordFbx(body, fbx, converter);
  await recordImport(body, fbx, asset, importer, 'x-bot', 'P_staff_A', converter);
  const clip = { character: 'x-bot', profile: 'P_staff_A', filename: 'x_bot_P_staff_A.json', frames: 2, schema: 'test-prop-track', sourceSHA256: fileHash(captureFile) };
  put(join(project, 'Content/Data/PropMotion/manifest.json'), { schema: 'flow-fest-prop-motion-manifest-v1', clips: [clip] });
  put(join(project, 'Content/Data/PropMotion', clip.filename), { schema: clip.schema, character: clip.character, profile: clip.profile,
    propId: 'staff', sourceSHA256: clip.sourceSHA256, captureSHA256: clip.sourceSHA256, fps: 30, sourceFrameCount: 2, provenance });
  put(join(project, 'Content/Data/characters.json'), {});
  put(join(project, 'Content/Data/props.json'), {});
  await seal(project);
  return { project, sequence, captureFile, asset };
}

describe('exact prepared performance library', () => {
  it('retains the complete editable score and captured clock through generation and staging', async () => {
    const { project, sequence } = await fixture();
    const library = await writePerformanceLibrary(project);
    expect(library.entries).toHaveLength(1);
    const entry = library.entries[0]!;
    expect(JSON.parse(entry.sequenceJson)).toEqual(sequence);
    expect(entry.sequenceSHA256).toBe(await sha256(entry.sequenceJson));
    expect(entry).toMatchObject({ id: 'x-bot/P_staff_A', characterId: 'x-bot', profile: 'P_staff_A', propFamily: 'staff', durationSeconds: 2 / 30, scoreUnitsPerSecond: 2 });
    const staged = join(project, 'packaged/Data');
    put(join(staged, 'performance-library.json'), readFileSync(libraryPath(project), 'utf8'));
    expect(await verifyPerformanceLibrary(project, staged)).toEqual({ entries: 1, exactSequences: 1 });
    const changed = read(libraryPath(project));
    changed.entries[0].sequenceJson = '{}';
    put(join(staged, 'performance-library.json'), changed);
    await expect(verifyPerformanceLibrary(project, staged)).rejects.toThrow(/Packaged performance library/);
  });

  it('rejects a stale library instead of routing a changed snapshot to an old clip', async () => {
    const { project } = await fixture();
    await writePerformanceLibrary(project);
    const library = read(libraryPath(project));
    library.entries[0].sequenceJson = '{"id":"different"}';
    put(libraryPath(project), library);
    await expect(verifyPerformanceLibrary(project)).rejects.toThrow(/stale/);
  });

  it('fails before overwriting a library when captured or cooked bytes change', async () => {
    const { project, captureFile, asset } = await fixture();
    await writePerformanceLibrary(project);
    const original = readFileSync(libraryPath(project), 'utf8');
    const captureBytes = readFileSync(captureFile, 'utf8');
    put(captureFile, { ...JSON.parse(captureBytes), sequence: { id: 'other', steps: [{}] } });
    await expect(writePerformanceLibrary(project)).rejects.toThrow(/raw bytes/);
    expect(readFileSync(libraryPath(project), 'utf8')).toBe(original);
    put(captureFile, captureBytes);
    put(asset, 'changed asset');
    await expect(writePerformanceLibrary(project)).rejects.toThrow(/asset bytes/);
  });

  it('excludes legacy clips even when a raw capture happens to exist', async () => {
    const { project } = await fixture();
    rmSync(join(project, 'Content/Data/performance-bundles.json'));
    baseline(project);
    expect((await createPerformanceLibrary(project)).entries).toEqual([]);
  });
});
