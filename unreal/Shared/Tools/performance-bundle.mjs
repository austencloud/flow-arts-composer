import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCaptureProvenance } from './capture-provenance.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const fileHash = file => hash(readFileSync(file));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a, b, what) => insist(a === b, `${what} is missing or stale`);
const receipt = file => `${file}.performance.json`;
export const resolvePreparer = (moduleDir = dirname(fileURLToPath(import.meta.url)), override = process.env.TKA_PERFORMANCE_PREPARER) => {
  if (override) {
    const file = resolve(override);
    insist(existsSync(file), `Missing body preparation tool: ${file}`);
    return file;
  }
  const candidates = ['../../FlowFest/Tools/prepare-characters.mjs', '../../Project/Tools/prepare-characters.mjs']
    .map(path => resolve(moduleDir, path));
  const found = candidates.find(existsSync);
  insist(found, `Missing body preparation tool: ${candidates.join(' or ')}`);
  return found;
};
export const inside = (root, file) => {
  const rel = relative(resolve(root), resolve(file));
  insist(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), `Path escapes root: ${file}`);
  return rel.replaceAll('\\', '/');
};
export const resolvedInside = (root, rel) => {
  insist(typeof rel === 'string' && !isAbsolute(rel) && !rel.includes('\\') && !rel.startsWith('/') && !rel.split('/').includes('..'), `Unsafe relative path: ${rel}`);
  const file = resolve(root, rel);
  inside(root, file);
  return file;
};
const requireFile = file => { insist(existsSync(file), `Missing ${file}`); return fileHash(file); };
const key = (character, profile) => `${character}/${profile}`;

export async function validateRawCapture(capture, captureFile, character, sourceRig) {
  const provenance = await validateCaptureProvenance(capture);
  same(provenance.rig.characterId, character, 'Capture rig character');
  same(provenance.rig.sourceSHA256, requireFile(sourceRig), 'Capture source rig');
  return { captureSHA256: requireFile(captureFile), provenance };
}

export function recordDecodedRig(decoded, sourceRig) {
  const value = { schema: 'tka-performance-decoded-rig-v1', sourceRigSHA256: requireFile(sourceRig), decodedRigSHA256: requireFile(decoded) };
  save(receipt(decoded), value);
  return value;
}
export function validateDecodedRig(decoded, sourceRig) {
  insist(existsSync(receipt(decoded)), `Missing decoded rig receipt: ${decoded}`);
  const value = read(receipt(decoded));
  same(value.schema, 'tka-performance-decoded-rig-v1', 'Decoded rig receipt schema');
  same(value.sourceRigSHA256, requireFile(sourceRig), 'Decoded rig source');
  same(value.decodedRigSHA256, requireFile(decoded), 'Decoded rig bytes');
  return value;
}
export async function recordBody({ body, captureFile, capture, character, profile, propId, sourceRig, decodedRig }) {
  await validateRawCapture(capture, captureFile, character, sourceRig);
  same(propId, capture.propType, 'Body prop');
  const rig = validateDecodedRig(decodedRig, sourceRig);
  const value = { schema: 'tka-performance-body-v1', character, profile, propId,
    captureRelativePath: relative(dirname(body), captureFile).replaceAll('\\', '/'), captureSHA256: requireFile(captureFile), provenance: capture.provenance,
    sourceRigSHA256: rig.sourceRigSHA256, decodedRigSHA256: rig.decodedRigSHA256,
    prepareSHA256: requireFile(resolvePreparer()),
    bodySHA256: requireFile(body) };
  save(receipt(body), value);
  return value;
}
export async function validateBody(body, { captureFile, sourceRig, decodedRig, character, profile } = {}) {
  insist(existsSync(receipt(body)), `Missing body receipt: ${body}`);
  const value = read(receipt(body));
  same(value.schema, 'tka-performance-body-v1', 'Body receipt schema');
  same(value.bodySHA256, requireFile(body), 'Body GLB');
  same(value.prepareSHA256, requireFile(resolvePreparer()), 'Body preparation tool');
  if (character) same(value.character, character, 'Body character');
  if (profile) same(value.profile, profile, 'Body profile');
  const source = captureFile ?? (value.captureRelativePath ? resolve(dirname(body), value.captureRelativePath) : null);
  if (source && existsSync(source)) {
    same(value.captureSHA256, requireFile(source), 'Raw capture');
    const capture = read(source);
    const p = await validateCaptureProvenance(capture);
    same(JSON.stringify(value.provenance), JSON.stringify(p), 'Body provenance');
    same(value.character, capture.character, 'Body capture character');
    same(value.propId, capture.propType, 'Body prop');
    same(value.sourceRigSHA256, p.rig.sourceSHA256, 'Body source rig');
  } else {
    insist(!captureFile, `Missing raw capture: ${captureFile}`);
    same(value.sourceRigSHA256, value.provenance?.rig?.sourceSHA256, 'Body source rig');
  }
  if (sourceRig) same(value.sourceRigSHA256, requireFile(sourceRig), 'Source rig');
  if (decodedRig) {
    same(value.decodedRigSHA256, requireFile(decodedRig), 'Body decoded rig');
    insist(existsSync(receipt(decodedRig)), `Missing decoded rig receipt: ${decodedRig}`);
    const rig = read(receipt(decodedRig));
    same(rig.schema, 'tka-performance-decoded-rig-v1', 'Decoded rig receipt schema');
    same(rig.sourceRigSHA256, value.sourceRigSHA256, 'Decoded rig source');
    same(rig.decodedRigSHA256, value.decodedRigSHA256, 'Decoded rig receipt bytes');
  }
  return value;
}
export async function recordFbx(body, fbx, converter) {
  const b = await validateBody(body);
  const value = { schema: 'tka-performance-fbx-v1', bodySHA256: b.bodySHA256, bodyReceiptSHA256: requireFile(receipt(body)), fbxSHA256: requireFile(fbx), converterSHA256: requireFile(converter) };
  save(receipt(fbx), value);
  return value;
}
export async function validateFbx(body, fbx, converter) {
  const b = await validateBody(body);
  insist(existsSync(receipt(fbx)), `Missing FBX receipt: ${fbx}`);
  const value = read(receipt(fbx));
  same(value.schema, 'tka-performance-fbx-v1', 'FBX receipt schema');
  same(value.bodySHA256, b.bodySHA256, 'FBX source body');
  same(value.bodyReceiptSHA256, requireFile(receipt(body)), 'FBX source receipt');
  same(value.fbxSHA256, requireFile(fbx), 'FBX bytes');
  same(value.converterSHA256, requireFile(converter), 'Converter');
  return value;
}
export async function recordImport(body, fbx, asset, importer, character, profile, converter) {
  insist(converter && character && profile, 'Import recording requires converter, character and profile');
  const b = await validateBody(body, { character, profile });
  const f = await validateFbx(body, fbx, converter);
  same(f.fbxSHA256, requireFile(fbx), 'Import FBX');
  const value = { schema: 'tka-performance-import-v1', character, profile, bodySHA256: b.bodySHA256,
    fbxSHA256: f.fbxSHA256, fbxReceiptSHA256: requireFile(receipt(fbx)), importerSHA256: requireFile(importer), assetSHA256: requireFile(asset) };
  save(receipt(asset), value);
  return value;
}
export async function validateImport(body, fbx, asset, importer, character, profile, converter) {
  insist(converter && character && profile, 'Import validation requires converter, character and profile');
  const b = await validateBody(body, { character, profile });
  const f = await validateFbx(body, fbx, converter);
  insist(existsSync(receipt(asset)), `Missing import receipt: ${asset}`);
  const value = read(receipt(asset));
  same(value.schema, 'tka-performance-import-v1', 'Import receipt schema');
  same(value.character, character, 'Imported character'); same(value.profile, profile, 'Imported profile');
  same(value.bodySHA256, b.bodySHA256, 'Imported body'); same(value.fbxSHA256, f.fbxSHA256, 'Imported FBX');
  same(value.fbxReceiptSHA256, requireFile(receipt(fbx)), 'Imported FBX receipt');
  same(value.importerSHA256, requireFile(importer), 'Importer'); same(value.assetSHA256, requireFile(asset), 'Imported asset');
  return value;
}

const dataDir = project => join(project, 'Content/Data');
const manifestFile = project => join(dataDir(project), 'PropMotion/manifest.json');
const bundlesFile = project => join(dataDir(project), 'performance-bundles.json');
const baselineFile = project => join(dataDir(project), 'performance-legacy-baseline.json');
const listed = project => {
  const manifest = read(manifestFile(project));
  insist(manifest.schema === 'flow-fest-prop-motion-manifest-v1' && Array.isArray(manifest.clips) && manifest.clips.length > 0, 'Invalid or empty prop manifest');
  const keys = new Set();
  for (const clip of manifest.clips) {
    insist(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clip.character) && /^[A-Za-z0-9_]+$/.test(clip.profile), 'Unsafe performance identity');
    insist(clip.filename === `${clip.character.replaceAll('-', '_')}_${clip.profile}.json`, 'Noncanonical prop filename');
    insist(Number.isInteger(clip.frames) && clip.frames > 0, 'Invalid performance frame count');
    const k = key(clip.character, clip.profile);
    insist(!keys.has(k), `Duplicate performance ${k}`);
    keys.add(k);
  }
  return manifest.clips;
};
const clipPath = (project, clip) => resolvedInside(join(dataDir(project), 'PropMotion'), clip.filename);
const assetPath = (project, clip) => join(project, `Content/FlowFest/Characters/${clip.character.replaceAll('-', '_')}/A_Flow_${clip.profile}.uasset`);
const stagedPaths = (staged, clip) => {
  const root = join(staged, clip.character.replaceAll('-', '_'));
  return { body: join(root, `capture_${clip.profile}.glb`), fbx: join(root, `A_Flow_${clip.profile}.fbx`) };
};
const catalogHashes = project => Object.fromEntries(['characters.json', 'props.json'].map(name => [name, requireFile(join(dataDir(project), name))]));
const inventory = (project, clip) => ({ propMotionSHA256: requireFile(clipPath(project, clip)), assetSHA256: requireFile(assetPath(project, clip)) });
const clearanceFile = project => join(dataDir(project), 'prop-clearance-migration.json');
const turnFile = project => join(dataDir(project), 'character-turn-migration.json');
const previousCharactersFile = project => join(dataDir(project), 'characters-before-turn.json');
const turnClips = ['TurnLeft', 'TurnRight'];
const sameValue = (a, b, what) => same(JSON.stringify(a), JSON.stringify(b), what);
function turnAssets(project, previous, current) {
  insist(previous.version === current.version && Array.isArray(previous.characters) &&
    Array.isArray(current.characters) && previous.characters.length === 16 &&
    current.characters.length === previous.characters.length, 'Turn migration requires the existing 16-character catalog');
  const assets = {};
  for (let i = 0; i < previous.characters.length; i++) {
    const before = previous.characters[i], after = current.characters[i];
    insist(before.id === after.id && before.key === after.key &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(after.id) && /^[a-z0-9_]+$/.test(after.key) &&
      after.folder === `/Game/FlowFest/Characters/${after.key}` &&
      before.animations && after.animations && !before.turns && !before.turnRetarget &&
      turnClips.every(clip => !(clip in before.animations)), 'Turn migration changed character identity or historical turns');
    const unchanged = structuredClone(after);
    for (const clip of turnClips) delete unchanged.animations[clip];
    delete unchanged.turns;
    delete unchanged.turnRetarget;
    sameValue(unchanged, before, `${before.id} pre-turn character fields`);
    sameValue(Object.keys(after.animations), [...Object.keys(before.animations), ...turnClips], `${before.id} animation references`);
    sameValue(Object.keys(after.turns ?? {}), turnClips, `${before.id} source turn metadata`);
    sameValue(Object.keys(after.turnRetarget ?? {}), turnClips, `${before.id} native turn metadata`);
    for (const clip of turnClips) {
      const reference = `/Game/FlowFest/Characters/${after.key}/A_${clip}.A_${clip}`;
      same(after.animations[clip], reference, `${before.id}/${clip} animation reference`);
      const metadata = after.turnRetarget[clip];
      same(metadata.asset, reference, `${before.id}/${clip} retarget asset`);
      insist(Number.isFinite(metadata.headingDegrees) && Number.isFinite(metadata.durationSeconds) &&
        metadata.durationSeconds > 0 && Number.isInteger(metadata.frameCount) && metadata.frameCount > 1 &&
        [1, 100].includes(metadata.nativeHipsTranslationUnitsPerMeter), `${before.id}/${clip} invalid turn metadata`);
      const asset = join(project, 'Content/FlowFest/Characters', after.key, `A_${clip}.uasset`);
      const fbx = join(project, 'Tools/staged/Characters', after.key, `A_${clip}.fbx`);
      const sidecar = join(project, 'Tools/staged/Characters', after.key, `A_${clip}.turn.json`);
      const source = read(sidecar);
      same(source.schema, 'flowfest-native-turn-retarget-v1', `${before.id}/${clip} sidecar schema`);
      same(source.characterId, before.id, `${before.id}/${clip} sidecar character`);
      same(source.clip, clip, `${before.id}/${clip} sidecar clip`);
      sameValue(source.source, after.turns[clip], `${before.id}/${clip} source metadata`);
      for (const field of ['durationSeconds', 'frameCount', 'supportWindows', 'neutralStart', 'neutralEnd'])
        sameValue(metadata[field], source[field], `${before.id}/${clip} ${field}`);
      same(metadata.headingDegrees, source.source.headingDegrees, `${before.id}/${clip} heading`);
      same(metadata.sourceSha256, source.sourceSha256, `${before.id}/${clip} source hash`);
      same(metadata.fbxSha256, source.fbxSha256, `${before.id}/${clip} FBX metadata hash`);
      same(source.fbxSha256, requireFile(fbx), `${before.id}/${clip} FBX bytes`);
      assets[`${before.id}/${clip}`] = {
        asset: inside(project, asset), assetSHA256: requireFile(asset),
        fbx: inside(project, fbx), fbxSHA256: requireFile(fbx),
        sidecar: inside(project, sidecar), sidecarSHA256: requireFile(sidecar),
      };
    }
  }
  same(Object.keys(assets).length, 32, 'Native turn asset inventory');
  return assets;
}
// Additive turn import has its own receipt. Historical performance hashes remain immutable.
export function migrateCharacterTurns(project, previous) {
  project = resolve(project);
  const oldBytes = readFileSync(previous), oldHash = hash(oldBytes);
  const currentFile = join(dataDir(project), 'characters.json');
  const currentHash = requireFile(currentFile);
  const expected = [existsSync(baselineFile(project)) && read(baselineFile(project)).catalog,
    ...Object.values(existsSync(bundlesFile(project)) ? read(bundlesFile(project)).entries : {}).map(b => b.catalog)].filter(Boolean);
  insist(expected.some(c => c['characters.json'] === oldHash) &&
    expected.every(c => [oldHash, currentHash].includes(c['characters.json'])),
    'Historical characters catalog does not match the pre-turn catalog');
  const assets = turnAssets(project, JSON.parse(oldBytes.toString('utf8')), read(currentFile));
  if (existsSync(turnFile(project))) {
    const existing = verifyCharacterTurns(project);
    same(existing.previousCharactersSHA256, oldHash, 'Existing turn migration');
    return existing;
  }
  writeFileSync(previousCharactersFile(project), oldBytes);
  const value = { schema: 'tka-character-turn-migration-v1', previousCharactersSHA256: oldHash,
    charactersSHA256: currentHash, assets };
  save(turnFile(project), value);
  return value;
}
export function verifyCharacterTurns(project) {
  project = resolve(project);
  const value = read(turnFile(project));
  same(value.schema, 'tka-character-turn-migration-v1', 'Turn migration schema');
  same(value.previousCharactersSHA256, requireFile(previousCharactersFile(project)), 'Pre-turn catalog bytes');
  same(value.charactersSHA256, requireFile(join(dataDir(project), 'characters.json')), 'Turn catalog bytes');
  const expected = [existsSync(baselineFile(project)) && read(baselineFile(project)).catalog,
    ...Object.values(existsSync(bundlesFile(project)) ? read(bundlesFile(project)).entries : {}).map(b => b.catalog)].filter(Boolean);
  insist(expected.some(c => c['characters.json'] === value.previousCharactersSHA256) &&
    expected.every(c => [value.previousCharactersSHA256, value.charactersSHA256].includes(c['characters.json'])),
    'Historical characters catalog does not match the turn migration');
  const assets = turnAssets(project, read(previousCharactersFile(project)), read(join(dataDir(project), 'characters.json')));
  sameValue(value.assets, assets, 'Turn asset inventory');
  return value;
}
const clearanceFields = ['clearanceSpace', 'clearanceCapsules', 'rightClearanceCapsules'];
function identityWithoutClearance(catalog) {
  const copy = structuredClone(catalog);
  insist(Array.isArray(copy.props) && copy.props.length > 0, 'Invalid prop catalog');
  for (const prop of copy.props) {
    insist(Array.isArray(prop.variants), 'Invalid prop variants');
    for (const variant of prop.variants) for (const field of clearanceFields) delete variant[field];
  }
  return JSON.stringify(copy);
}
function clearanceAssets(project, catalog, report) {
  insist(report.clearanceGenerated === true && Array.isArray(report.errors) && !report.errors.length, 'Successful generated clearance coverage required');
  const assets = {};
  for (const prop of catalog.props) for (const variant of prop.variants) {
    same(variant.clearanceSpace, 'ue-static-mesh-local-cm-v1', 'Prop clearance coordinate space');
    for (const [meshField, coverField] of [['mesh', 'clearanceCapsules'], ['rightMesh', 'rightClearanceCapsules']]) {
      const mesh = variant[meshField], capsules = variant[coverField];
      insist(typeof mesh === 'string' && mesh.startsWith('/Game/') && !mesh.includes('..'), 'Invalid clearance mesh path');
      insist(Array.isArray(capsules) && capsules.length > 0 && capsules.length <= 16, 'Invalid clearance capsule count');
      for (const c of capsules) insist(['start', 'end'].every(k => Array.isArray(c[k]) && c[k].length === 3 && c[k].every(Number.isFinite)) && Number.isFinite(c.radiusCm) && c.radiusCm > 0, 'Invalid clearance capsule');
      const proof = report.clearanceCovers?.[mesh];
      insist(proof && proof.triangles > 0 && proof.vertices > 0 && proof.capsules === capsules.length && proof.maxTriangleExcessCm <= 1e-7, `Missing complete-triangle coverage: ${mesh}`);
      const asset = join(project, 'Content', `${mesh.slice(6).split('.')[0]}.uasset`);
      const assetHash = requireFile(asset);
      if (proof.assetSHA256) same(proof.assetSHA256, assetHash, `Clearance mesh bytes ${mesh}`);
      if (proof.capsulesSHA256) {
        const numbers = capsules.flatMap(c => [...c.start, ...c.end, c.radiusCm]);
        const bytes = Buffer.alloc(numbers.length * 8);
        numbers.forEach((n, i) => bytes.writeDoubleLE(n, i * 8));
        same(proof.capsulesSHA256, hash(bytes), `Clearance capsule bytes ${mesh}`);
      }
      assets[inside(project, asset)] = assetHash;
    }
  }
  same(Object.keys(report.clearanceCovers).length, Object.keys(assets).length, 'Clearance coverage inventory');
  return assets;
}
// Explicit geometric metadata migration. Never rewrite the immutable legacy
// baseline or pretend historical captures were regenerated with these bounds.
export function migratePropClearance(project, previous, reportPath) {
  project = resolve(project);
  const oldBytes = readFileSync(previous), oldCatalog = JSON.parse(oldBytes.toString('utf8'));
  const current = read(join(dataDir(project), 'props.json')), report = read(reportPath);
  same(identityWithoutClearance(current), identityWithoutClearance(oldCatalog), 'Clearance-only catalog identity');
  const assets = clearanceAssets(project, current, report);
  const priorHash = hash(oldBytes);
  const expected = [existsSync(baselineFile(project)) && read(baselineFile(project)).catalog,
    ...Object.values(existsSync(bundlesFile(project)) ? read(bundlesFile(project)).entries : {}).map(b => b.catalog)].filter(Boolean);
  const turnMigration = existsSync(turnFile(project)) ? verifyCharacterTurns(project) : null;
  for (const catalog of expected) {
    insist([priorHash, requireFile(join(dataDir(project), 'props.json'))].includes(catalog['props.json']), 'Historical props catalog is missing or stale');
    insist([requireFile(join(dataDir(project), 'characters.json')), turnMigration?.previousCharactersSHA256]
      .includes(catalog['characters.json']), 'Historical characters catalog is missing or stale');
  }
  const oldFile = join(dataDir(project), 'props-before-clearance.json');
  const coverageFile = join(dataDir(project), 'prop-clearance-coverage.json');
  if (existsSync(clearanceFile(project))) {
    verifyPropClearance(project);
    same(read(clearanceFile(project)).previousPropsSHA256, priorHash, 'Existing clearance migration');
    return read(clearanceFile(project));
  }
  writeFileSync(oldFile, oldBytes);
  writeFileSync(coverageFile, readFileSync(reportPath));
  const value = { schema: 'tka-prop-clearance-migration-v1', previousPropsSHA256: priorHash,
    propsSHA256: requireFile(join(dataDir(project), 'props.json')), coverageSHA256: requireFile(coverageFile), assets };
  save(clearanceFile(project), value);
  return value;
}
export function verifyPropClearance(project) {
  const value = read(clearanceFile(project));
  same(value.schema, 'tka-prop-clearance-migration-v1', 'Clearance migration schema');
  same(value.previousPropsSHA256, requireFile(join(dataDir(project), 'props-before-clearance.json')), 'Previous props bytes');
  same(value.propsSHA256, requireFile(join(dataDir(project), 'props.json')), 'Clearance props bytes');
  same(value.coverageSHA256, requireFile(join(dataDir(project), 'prop-clearance-coverage.json')), 'Clearance coverage bytes');
  const oldCatalog = read(join(dataDir(project), 'props-before-clearance.json'));
  const current = read(join(dataDir(project), 'props.json'));
  same(identityWithoutClearance(current), identityWithoutClearance(oldCatalog), 'Clearance-only catalog identity');
  const assets = clearanceAssets(project, current, read(join(dataDir(project), 'prop-clearance-coverage.json')));
  same(JSON.stringify(value.assets), JSON.stringify(assets), 'Clearance asset inventory');
  return value;
}
function verifyCatalog(project, historical, label, clearanceMigration, turnMigration) {
  const current = catalogHashes(project);
  if (JSON.stringify(historical) === JSON.stringify(current)) return;
  if (historical['characters.json'] !== current['characters.json'])
    same(historical['characters.json'], turnMigration?.previousCharactersSHA256, `${label} turn migration`);
  if (historical['props.json'] !== current['props.json'])
    same(historical['props.json'], clearanceMigration?.previousPropsSHA256, `${label} clearance migration`);
}
export function baseline(project) {
  project = resolve(project);
  const entries = Object.fromEntries(listed(project).map(clip => [key(clip.character, clip.profile), inventory(project, clip)]));
  const value = { schema: 'tka-performance-legacy-baseline-v1', provenanceStatus: 'unavailable', catalog: catalogHashes(project), entries };
  insist(!existsSync(baselineFile(project)), 'Legacy baseline already exists; it is immutable');
  save(baselineFile(project), value);
  return value;
}
export async function seal(project, staged, character, profile, converter, importer, captures) {
  project = resolve(project); staged = resolve(staged ?? join(project, 'Tools/staged/Characters'));
  converter = resolve(converter ?? join(project, 'Tools/convert-characters.py'));
  importer = resolve(importer ?? join(project, 'Tools/import-characters.py'));
  const clips = listed(project).filter(clip => (!character || clip.character === character) && (!profile || clip.profile === profile));
  insist(clips.length, 'No matching clips to seal');
  const prior = existsSync(bundlesFile(project)) ? read(bundlesFile(project)) : { schema: 'tka-performance-bundles-v1', entries: {} };
  for (const clip of clips) {
    const { body, fbx } = stagedPaths(staged, clip);
    const rawOverride = captures ? resolve(captures, basename(read(receipt(body)).captureRelativePath)) : null;
    const b = await validateBody(body, { character: clip.character, profile: clip.profile,
      ...(rawOverride && existsSync(rawOverride) ? { captureFile: rawOverride } : {}) });
    const conversion = read(receipt(fbx));
    same(conversion.schema, 'tka-performance-fbx-v1', 'FBX receipt schema');
    same(conversion.bodySHA256, b.bodySHA256, 'FBX source body');
    same(conversion.bodyReceiptSHA256, requireFile(receipt(body)), 'FBX source receipt');
    same(conversion.fbxSHA256, requireFile(fbx), 'FBX bytes');
    same(conversion.converterSHA256, requireFile(converter), 'Current converter');
    const imp = read(receipt(assetPath(project, clip)));
    same(imp.schema, 'tka-performance-import-v1', 'Native import receipt');
    same(imp.character, clip.character, 'Native import character'); same(imp.profile, clip.profile, 'Native import profile');
    same(imp.bodySHA256, b.bodySHA256, 'Native import body');
    same(imp.fbxSHA256, requireFile(fbx), 'Native import FBX');
    same(imp.fbxReceiptSHA256, requireFile(receipt(fbx)), 'Native import FBX receipt');
    same(imp.assetSHA256, requireFile(assetPath(project, clip)), 'Native import asset');
    same(imp.importerSHA256, requireFile(importer), 'Current importer');
    const prop = read(clipPath(project, clip));
    same(prop.character, clip.character, 'Prop character'); same(prop.profile, clip.profile, 'Prop profile');
    same(prop.propId, b.propId, 'Prop identity');
    same(prop.sourceSHA256, b.captureSHA256, 'Prop and body capture');
    same(prop.captureSHA256, b.captureSHA256, 'Prop capture');
    same(JSON.stringify(prop.provenance), JSON.stringify(b.provenance), 'Prop and body provenance');
    same(prop.fps, b.provenance.clock.fps, 'Prop clock FPS');
    same(prop.sourceFrameCount, b.provenance.clock.frameCount, 'Prop clock frames');
    same(clip.sourceSHA256, b.captureSHA256, 'Prop manifest capture');
    same(clip.frames, b.provenance.clock.frameCount, 'Prop manifest frames');
    same(clip.schema, prop.schema, 'Prop manifest schema');
    const captureFile = rawOverride ?? resolve(dirname(body), b.captureRelativePath);
    same(requireFile(captureFile), b.captureSHA256, 'Sealed raw capture');
    prior.entries[key(clip.character, clip.profile)] = { schema: 'tka-performance-bundle-v1', character: clip.character, profile: clip.profile,
      provenance: b.provenance, captureSHA256: b.captureSHA256, bodySHA256: b.bodySHA256, fbxSHA256: requireFile(fbx),
      paths: { body: inside(project, body), fbx: inside(project, fbx), capture: inside(project, captureFile), asset: inside(project, assetPath(project, clip)) },
      receipts: { body: requireFile(receipt(body)), fbx: requireFile(receipt(fbx)), asset: requireFile(receipt(assetPath(project, clip))) },
      ...inventory(project, clip), catalog: catalogHashes(project), evidence: { collision: 'not-evaluated', contact: 'not-evaluated', continuity: 'not-evaluated' } };
  }
  save(bundlesFile(project), prior);
  return prior;
}
export function verify(project, packagedData) {
  project = resolve(project);
  const clips = listed(project), bundles = existsSync(bundlesFile(project)) ? read(bundlesFile(project)).entries : {};
  const legacy = existsSync(baselineFile(project)) ? read(baselineFile(project)) : null;
  const clearanceMigration = existsSync(clearanceFile(project)) ? verifyPropClearance(project) : null;
  const turnMigration = existsSync(turnFile(project)) ? verifyCharacterTurns(project) : null;
  const expected = new Set(clips.map(clip => key(clip.character, clip.profile)));
  for (const k of [...Object.keys(bundles), ...Object.keys(legacy?.entries ?? {})]) insist(expected.has(k), `Unlisted performance ${k}`);
  let bundled = 0, unchangedLegacy = 0;
  for (const clip of clips) {
    const k = key(clip.character, clip.profile), current = inventory(project, clip);
    if (bundles[k]) {
      const b = bundles[k];
      same(b.schema, 'tka-performance-bundle-v1', `${k} bundle schema`);
      same(b.character, clip.character, `${k} character`); same(b.profile, clip.profile, `${k} profile`);
      same(b.propMotionSHA256, current.propMotionSHA256, `${k} prop bytes`);
      same(b.assetSHA256, current.assetSHA256, `${k} asset bytes`);
      same(b.bodySHA256, requireFile(resolvedInside(project, b.paths.body)), `${k} body bytes`);
      same(b.fbxSHA256, requireFile(resolvedInside(project, b.paths.fbx)), `${k} FBX bytes`);
      same(b.captureSHA256, requireFile(resolvedInside(project, b.paths.capture)), `${k} raw bytes`);
      for (const [part, path] of [['body', b.paths.body], ['fbx', b.paths.fbx], ['asset', b.paths.asset]])
        same(b.receipts[part], requireFile(receipt(resolvedInside(project, path))), `${k} ${part} receipt`);
      verifyCatalog(project, b.catalog, `${k} catalog`, clearanceMigration, turnMigration);
      const prop = read(clipPath(project, clip));
      same(prop.sourceSHA256, b.captureSHA256, `${k} prop capture`);
      same(clip.sourceSHA256, b.captureSHA256, `${k} manifest capture`);
      same(clip.frames, b.provenance.clock.frameCount, `${k} manifest frames`);
      same(clip.schema, prop.schema, `${k} manifest schema`);
      same(JSON.stringify(prop.provenance), JSON.stringify(b.provenance), `${k} provenance`);
      bundled++;
    } else {
      insist(legacy?.schema === 'tka-performance-legacy-baseline-v1' && legacy.provenanceStatus === 'unavailable', `Unverified performance ${k}`);
      same(legacy.entries[k]?.propMotionSHA256, current.propMotionSHA256, `${k} legacy prop`);
      same(legacy.entries[k]?.assetSHA256, current.assetSHA256, `${k} legacy asset`);
      verifyCatalog(project, legacy.catalog, `${k} legacy catalog`, clearanceMigration, turnMigration);
      unchangedLegacy++;
    }
  }
  if (packagedData) {
    for (const file of ['PropMotion/manifest.json', 'performance-bundles.json', 'performance-legacy-baseline.json', 'characters.json', 'characters-before-turn.json', 'character-turn-migration.json', 'props.json', 'prop-clearance-migration.json', 'props-before-clearance.json', 'prop-clearance-coverage.json']) {
      const original = join(dataDir(project), file), packaged = join(packagedData, file);
      if (existsSync(original)) same(requireFile(packaged), requireFile(original), `Packaged ${file}`);
    }
    for (const clip of clips) same(requireFile(resolvedInside(join(packagedData, 'PropMotion'), clip.filename)), requireFile(clipPath(project, clip)), `Packaged ${clip.filename}`);
  }
  return { bundled, unchangedLegacy, total: clips.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
  const required = name => { const value = opt(name); insist(value && !value.startsWith('--'), `--${name} required`); return resolve(value); };
  try {
    let result;
    if (command === 'validate-body') result = await validateBody(required('body'), { character: opt('character'), profile: opt('profile'), captureFile: opt('capture') && required('capture'), decodedRig: opt('decoded-rig') && required('decoded-rig') });
    else if (command === 'record-fbx') result = await recordFbx(required('body'), required('fbx'), required('converter'));
    else if (command === 'validate-fbx') result = await validateFbx(required('body'), required('fbx'), required('converter'));
    else if (command === 'record-import') result = await recordImport(required('body'), required('fbx'), required('asset'), required('importer'), opt('character'), opt('profile'), opt('converter') && required('converter'));
    else if (command === 'validate-import') result = await validateImport(required('body'), required('fbx'), required('asset'), required('importer'), opt('character'), opt('profile'), opt('converter') && required('converter'));
    else if (command === 'seal') result = await seal(required('project'), opt('staged'), opt('character'), opt('profile'), opt('converter'), opt('importer'), opt('captures'));
    else if (command === 'migrate-prop-clearance') result = migratePropClearance(required('project'), required('previous'), required('coverage'));
    else if (command === 'verify-prop-clearance') result = verifyPropClearance(required('project'));
    else if (command === 'migrate-character-turns') result = migrateCharacterTurns(required('project'), required('previous'));
    else if (command === 'verify-character-turns') result = verifyCharacterTurns(required('project'));
    else if (command === 'baseline') result = baseline(required('project'));
    else if (command === 'verify') result = verify(required('project'), opt('packaged-data'));
    else throw new Error(`Unknown performance bundle command: ${command}`);
    if (command === 'baseline') console.log(JSON.stringify({ entries: Object.keys(result.entries).length, path: baselineFile(required('project')) }));
    else if (command === 'seal') console.log(JSON.stringify({ entries: Object.keys(result.entries).length, path: bundlesFile(required('project')) }));
    else console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
