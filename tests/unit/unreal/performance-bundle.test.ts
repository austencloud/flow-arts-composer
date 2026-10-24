import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { baseline, verify, migratePropClearance, verifyPropClearance, inside, resolvedInside, resolvePreparer, recordDecodedRig, recordBody, validateBody, recordFbx, validateFbx, recordImport, validateImport } from '../../../unreal/Shared/Tools/performance-bundle.mjs';
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
  it('resolves the actual preparer in repository or detached project layout', () => {
    const root = mkdtempSync(join(tmpdir(), 'performance-preparer-'));
    const moduleDir = join(root, 'Shared/Tools');
    const flow = join(root, 'FlowFest/Tools/prepare-characters.mjs');
    const project = join(root, 'Project/Tools/prepare-characters.mjs');
    expect(() => resolvePreparer(moduleDir, undefined)).toThrow(/Missing body preparation tool/);
    put(project, 'project preparer');
    expect(resolvePreparer(moduleDir, undefined)).toBe(project);
    put(flow, 'flow preparer');
    expect(resolvePreparer(moduleDir, undefined)).toBe(flow);
    expect(resolvePreparer(moduleDir, project)).toBe(project);
    expect(() => resolvePreparer(moduleDir, join(root, 'missing.mjs'))).toThrow(/Missing body preparation tool/);
  });
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


describe('geometric prop metadata migration', () => {
  function migrationFixture() {
    const { project } = fixture();
    const catalogPath = join(project, 'Content/Data/props.json');
    const before = join(project, 'before.json');
    const original = { props: [{ id: 'staff', variants: [{ id: 'default', mesh: '/Game/FlowFest/Props/L', rightMesh: '/Game/FlowFest/Props/R' }] }] };
    put(catalogPath, JSON.stringify(original));
    put(before, JSON.stringify(original));
    baseline(project);
    const baselineBytes = readFileSync(join(project, 'Content/Data/performance-legacy-baseline.json'), 'utf8');
    const capsule = [{ start: [0, 0, 0], end: [0, 10, 0], radiusCm: 1 }];
    Object.assign(original.props[0].variants[0], { clearanceSpace: 'ue-static-mesh-local-cm-v1', clearanceCapsules: capsule, rightClearanceCapsules: capsule });
    put(catalogPath, JSON.stringify(original));
    const covers: Record<string, unknown> = {};
    for (const side of ['L', 'R']) {
      put(join(project, `Content/FlowFest/Props/${side}.uasset`), side);
      covers[`/Game/FlowFest/Props/${side}`] = { vertices: 3, triangles: 1, capsules: 1, maxTriangleExcessCm: -0.001 };
    }
    const report = join(project, 'coverage.json');
    put(report, JSON.stringify({ clearanceGenerated: true, errors: [], clearanceCovers: covers }));
    return { project, before, report, catalogPath, baselineBytes };
  }
  it('preserves exact historical baseline and binds coverage, mesh bytes and packaged metadata', () => {
    const f = migrationFixture();
    expect(() => verify(f.project)).toThrow(/legacy catalog/);
    migratePropClearance(f.project, f.before, f.report);
    expect(verify(f.project).unchangedLegacy).toBe(1);
    expect(readFileSync(join(f.project, 'Content/Data/performance-legacy-baseline.json'), 'utf8')).toBe(f.baselineBytes);
    expect(verifyPropClearance(f.project).assets).toHaveProperty('Content/FlowFest/Props/L.uasset');
    put(join(f.project, 'Content/FlowFest/Props/L.uasset'), 'changed mesh');
    expect(() => verify(f.project)).toThrow(/asset inventory/);
  });
  it('rejects unrelated identity changes and incomplete coverage without rewriting historical proof', () => {
    const f = migrationFixture();
    const catalog = JSON.parse(readFileSync(f.catalogPath, 'utf8'));
    catalog.props[0].variants[0].id = 'other';
    put(f.catalogPath, JSON.stringify(catalog));
    expect(() => migratePropClearance(f.project, f.before, f.report)).toThrow(/catalog identity/);
    catalog.props[0].variants[0].id = 'default';
    put(f.catalogPath, JSON.stringify(catalog));
    put(f.report, JSON.stringify({ clearanceGenerated: true, errors: [], clearanceCovers: {} }));
    expect(() => migratePropClearance(f.project, f.before, f.report)).toThrow(/complete-triangle/);
  });
  it('is idempotent when bootstrap regenerates coverage for the upgraded catalog', () => {
    const f = migrationFixture();
    migratePropClearance(f.project, f.before, f.report);
    const receipt = readFileSync(join(f.project, 'Content/Data/prop-clearance-migration.json'), 'utf8');
    // A fresh validation report may have unrelated diagnostic fields. The
    // original geometric receipt and immutable baseline must stay untouched.
    const report = JSON.parse(readFileSync(f.report, 'utf8'));
    report.regenerated = true;
    put(f.report, JSON.stringify(report));
    migratePropClearance(f.project, f.before, f.report);
    expect(readFileSync(join(f.project, 'Content/Data/prop-clearance-migration.json'), 'utf8')).toBe(receipt);
    expect(readFileSync(join(f.project, 'Content/Data/performance-legacy-baseline.json'), 'utf8')).toBe(f.baselineBytes);
    expect(verify(f.project).unchangedLegacy).toBe(1);
  });
  it('rejects changed capsule numbers after the migration receipt', () => {
    const f = migrationFixture();
    migratePropClearance(f.project, f.before, f.report);
    const catalog = JSON.parse(readFileSync(f.catalogPath, 'utf8'));
    catalog.props[0].variants[0].clearanceCapsules[0].radiusCm += 1;
    put(f.catalogPath, JSON.stringify(catalog));
    expect(() => verifyPropClearance(f.project)).toThrow();
  });
  it('requires right-hand geometry and rejects a fourth metadata field', () => {
    const f = migrationFixture();
    const catalog = JSON.parse(readFileSync(f.catalogPath, 'utf8'));
    delete catalog.props[0].variants[0].rightClearanceCapsules;
    put(f.catalogPath, JSON.stringify(catalog));
    expect(() => migratePropClearance(f.project, f.before, f.report)).toThrow(/capsule count/);
    catalog.props[0].variants[0].rightClearanceCapsules = catalog.props[0].variants[0].clearanceCapsules;
    catalog.props[0].variants[0].newMetadata = true;
    put(f.catalogPath, JSON.stringify(catalog));
    expect(() => migratePropClearance(f.project, f.before, f.report)).toThrow(/catalog identity/);
  });
});
