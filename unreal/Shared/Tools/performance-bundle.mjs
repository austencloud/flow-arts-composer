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
const prepareScript = resolve(dirname(fileURLToPath(import.meta.url)), '../../FlowFest/Tools/prepare-characters.mjs');
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
    prepareSHA256: requireFile(prepareScript),
    bodySHA256: requireFile(body) };
  save(receipt(body), value);
  return value;
}
export async function validateBody(body, { captureFile, sourceRig, decodedRig, character, profile } = {}) {
  insist(existsSync(receipt(body)), `Missing body receipt: ${body}`);
  const value = read(receipt(body));
  same(value.schema, 'tka-performance-body-v1', 'Body receipt schema');
  same(value.bodySHA256, requireFile(body), 'Body GLB');
  same(value.prepareSHA256, requireFile(prepareScript), 'Body preparation tool');
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
      same(JSON.stringify(b.catalog), JSON.stringify(catalogHashes(project)), `${k} catalog`);
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
      same(JSON.stringify(legacy.catalog), JSON.stringify(catalogHashes(project)), `${k} legacy catalog`);
      unchangedLegacy++;
    }
  }
  if (packagedData) {
    for (const file of ['PropMotion/manifest.json', 'performance-bundles.json', 'performance-legacy-baseline.json', 'characters.json', 'props.json']) {
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
    else if (command === 'baseline') result = baseline(required('project'));
    else if (command === 'verify') result = verify(required('project'), opt('packaged-data'));
    else throw new Error(`Unknown performance bundle command: ${command}`);
    if (command === 'baseline') console.log(JSON.stringify({ entries: Object.keys(result.entries).length, path: baselineFile(required('project')) }));
    else if (command === 'seal') console.log(JSON.stringify({ entries: Object.keys(result.entries).length, path: bundlesFile(required('project')) }));
    else console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
