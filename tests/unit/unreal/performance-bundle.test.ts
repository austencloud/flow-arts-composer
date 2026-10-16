import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { baseline, verify, inside, resolvedInside, recordDecodedRig, recordBody, validateBody, recordFbx, validateFbx, recordImport, validateImport } from '../../../unreal/Shared/Tools/performance-bundle.mjs';
import { buildId, sha256, stableStringify } from '../../../unreal/Shared/Tools/capture-provenance.mjs';

const put = (path: string, value: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
function fixture() {
  const project = mkdtempSync(join(tmpdir(), 'performance-bundle-'));
  const clip = { character: 'x-bot', profile: 'P_staff_A', filename: 'x_bot_P_staff_A.json', frames: 480 };
  put(join(project, 'Content/Data/PropMotion/manifest.json'), JSON.stringify({ schema: 'flow-fest-prop-motion-manifest-v1', clips: [clip] }));
  put(join(project, 'Content/Data/PropMotion', clip.filename), 'prop');
  put(join(project, 'Content/FlowFest/Characters/x_bot/A_Flow_P_staff_A.uasset'), 'asset');
  put(join(project, 'Content/Data/characters.json'), '{}');
  put(join(project, 'Content/Data/props.json'), '{}');
  return { project, clip };
}

describe('performance legacy coverage', () => {
  it.skipIf(process.platform !== 'win32')('rejects another drive and absolute relative paths', () => {
    expect(() => inside('C:/project', 'D:/other/asset.uasset')).toThrow(/escapes root/);
    expect(() => resolvedInside('C:/project', 'D:/other/asset.uasset')).toThrow(/Unsafe relative path/);
  });
  it('requires an explicit frozen inventory for every clip', () => {
    const { project } = fixture();
    expect(() => verify(project)).toThrow(/Unverified performance/);
    const frozen = baseline(project);
    expect(frozen.provenanceStatus).toBe('unavailable');
    expect(verify(project)).toEqual({ bundled: 0, unchangedLegacy: 1, total: 1 });
    expect(() => baseline(project)).toThrow(/already exists/);
  });
  it('rejects changed legacy bytes and new manifest entries', () => {
    const { project, clip } = fixture();
    baseline(project);
    put(join(project, 'Content/Data/PropMotion', clip.filename), 'changed');
    expect(() => verify(project)).toThrow(/legacy prop/);
    put(join(project, 'Content/Data/PropMotion', clip.filename), 'prop');
    put(join(project, 'Content/Data/PropMotion/manifest.json'), JSON.stringify({ schema: 'flow-fest-prop-motion-manifest-v1', clips: [clip, { ...clip, profile: 'P_staff_B', filename: 'x_bot_P_staff_B.json' }] }));
    expect(() => verify(project)).toThrow(/Missing/);
  });
  it('rejects catalog changes even when clip bytes remain frozen', () => {
    const { project } = fixture();
    baseline(project);
    put(join(project, 'Content/Data/characters.json'), '{"changed":true}');
    expect(() => verify(project)).toThrow(/legacy catalog/);
  });
  it('rejects duplicate, unsafe, empty and malformed manifests', () => {
    const { project, clip } = fixture();
    const manifest = (clips: unknown[]) => put(join(project, 'Content/Data/PropMotion/manifest.json'), JSON.stringify({ schema: 'flow-fest-prop-motion-manifest-v1', clips }));
    manifest([]); expect(() => baseline(project)).toThrow(/empty/);
    manifest([clip, clip]); expect(() => baseline(project)).toThrow(/Duplicate/);
    manifest([{ ...clip, profile: '../escape' }]); expect(() => baseline(project)).toThrow(/Unsafe/);
    manifest([clip]);
    rmSync(join(project, 'Content/Data/props.json'));
    expect(() => baseline(project)).toThrow(/Missing/);
  });
});

describe('performance stage receipts', () => {
  it('binds raw capture, source rig, decoded rig, body, FBX and converter bytes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'performance-chain-'));
    const sourceRig = join(root, 'rig.glb'), decodedRig = join(root, 'decoded.glb');
    const body = join(root, 'capture_P_staff_A.glb'), fbx = join(root, 'A_Flow_P_staff_A.fbx');
    const converter = join(root, 'converter.py'), importer = join(root, 'importer.py');
    const asset = join(root, 'A_Flow_P_staff_A.uasset'), captureFile = join(root, 'raw.json');
    for (const [file, value] of [[sourceRig, 'source'], [decodedRig, 'decoded'], [body, 'body'], [fbx, 'fbx'], [converter, 'converter']]) put(file, value);
    const build = { sourceCommit: 'commit', sourceSHA256: await sha256('build source'), outputSHA256: await sha256('build output') };
    const sequence = { id: 'sample' };
    const capture = { schema: 'flow-fest-native-performance-v1', character: 'x-bot', role: 'family-staff-A', propType: 'staff', fps: 30,
      scoreUnitsPerSecond: 2, sequence, frames: [{ frame: 0 }, { frame: 1 }], provenance: {
        schema: 'tka-performance-capture-v1', build: { ...build, id: await buildId(build) },
        sequenceSHA256: await sha256(stableStringify(sequence)), rig: { characterId: 'x-bot', sourcePath: 'rig.glb', sourceSHA256: await sha256('source') },
        props: { family: 'staff', buildSHA256: build.outputSHA256, assets: [{ path: 'staff.glb', sha256: await sha256('prop') }] },
        motionOptions: { bodyClearance: null, enableLocomotion: true, enableFootPlanting: true, playbackSpeed: 1, phaseOffsetSteps: 0, showEffects: false },
        clock: { fps: 30, frameCount: 2, scoreUnitsPerSecond: 2, loopClosure: 'first-frame-at-duration' },
      } };
    put(captureFile, JSON.stringify(capture));
    recordDecodedRig(decodedRig, sourceRig);
    await recordBody({ body, captureFile, capture, character: 'x-bot', profile: 'P_staff_A', propId: 'staff', sourceRig, decodedRig });
    await validateBody(body, { character: 'x-bot', profile: 'P_staff_A', decodedRig });
    await expect(validateBody(body, { character: 'other' })).rejects.toThrow(/character/);
    await recordFbx(body, fbx, converter);
    await validateFbx(body, fbx, converter);
    put(importer, 'importer'); put(asset, 'asset');
    await recordImport(body, fbx, asset, importer, 'x-bot', 'P_staff_A', converter);
    await validateImport(body, fbx, asset, importer, 'x-bot', 'P_staff_A', converter);
    await expect(validateImport(body, fbx, asset, importer, 'wrong', 'P_staff_A', converter)).rejects.toThrow(/character/);
    put(importer, 'changed');
    await expect(validateImport(body, fbx, asset, importer, 'x-bot', 'P_staff_A', converter)).rejects.toThrow(/Importer/);
    put(importer, 'importer');
    put(fbx, 'mutated');
    await expect(validateFbx(body, fbx, converter)).rejects.toThrow(/FBX bytes/);
    put(fbx, 'fbx'); put(converter, 'changed');
    await expect(validateFbx(body, fbx, converter)).rejects.toThrow(/Converter/);
    put(converter, 'converter'); put(body, 'changed');
    await expect(validateBody(body)).rejects.toThrow(/Body GLB/);
    put(body, 'body'); put(captureFile, '{}');
    await expect(validateBody(body)).rejects.toThrow(/Raw capture/);
    put(captureFile, JSON.stringify(capture)); put(decodedRig, 'changed');
    await expect(validateBody(body, { decodedRig })).rejects.toThrow(/decoded rig/);
    put(decodedRig, 'decoded'); rmSync(`${decodedRig}.performance.json`);
    await expect(validateBody(body, { decodedRig })).rejects.toThrow(/Missing decoded rig receipt/);
  });
});
