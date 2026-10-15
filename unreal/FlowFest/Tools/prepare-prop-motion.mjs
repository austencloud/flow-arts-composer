/** Reduce production Three.js captures to runtime prop-root poses.
 * Usage: node Tools/prepare-prop-motion.mjs [raw-capture-dir]
 * Native FBX prop vertices retain the source prop's numeric local axes, so the
 * root quaternion includes the fixed Three-to-Unreal basis rotation.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const rawDir = resolve(process.argv[2] ?? join(project, "Saved/PerformanceCaptures"));
const outputDir = join(project, "Content/Data/PropMotion");
const familyOnly = process.argv.includes('--family-only');
const allowPartial = process.argv.includes('--allow-partial');
const captureIdFlag = process.argv.indexOf('--capture-id');
const captureId = captureIdFlag < 0 ? null : process.argv[captureIdFlag + 1];
if (allowPartial && !familyOnly) throw new Error('--allow-partial requires --family-only');
if (captureIdFlag >= 0 && (!captureId || !allowPartial))
  throw new Error('--capture-id requires an ID and --allow-partial');
const profiles = new Map([
  ["fire-poi", "FirePoi"],
  ["fire-hoop", "FireHoop"],
  ["juggler", "Juggler"],
  ["led-flow", "LedFlow"],
]);
function profileForRole(role) {
  if (profiles.has(role)) return profiles.get(role);
  const family = /^family-([a-z0-9_]+)-([AB])$/.exec(role);
  return family ? `P_${family[1]}_${family[2].toUpperCase()}` : null;
}

const fromSample = ({ position, quaternion, scale }) =>
  new Matrix4().compose(
    new Vector3(...position),
    new Quaternion(...quaternion),
    new Vector3(...scale),
  );

// Native prop mesh vertices retain source XYZ. B is a proper rotation that
// maps those mesh coordinates to UE's axes; the avatar's imported Feet basis
// also mirrors source X, so a fixed -X mesh scale supplies that reflection.
const basis = new Matrix4().makeBasis(
  new Vector3(0, 1, 0),
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
);
const avatarBasis = new Matrix4().makeBasis(
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
);
const avatarBasisInverse = avatarBasis.clone().invert();
const pos = new Vector3();
const rot = new Quaternion();
const scale = new Vector3();
const round = (n) => Math.round(n * 1e5) / 1e5;
function pose(performerInverse, propRootWorld) {
  performerInverse.clone().multiply(fromSample(propRootWorld)).decompose(pos, rot, scale);
  if (Math.max(Math.abs(scale.x - 1), Math.abs(scale.y - 1), Math.abs(scale.z - 1)) > 1e-4)
    throw new Error(`Unexpected animated prop-root scale: ${scale.toArray()}`);
  // (M R M^-1) B is a proper rotation; the mesh's fixed -X scale completes
  // M R without asking a quaternion to encode a reflection.
  const rotation = avatarBasis.clone()
    .multiply(new Matrix4().makeRotationFromQuaternion(rot))
    .multiply(avatarBasisInverse)
    .multiply(basis);
  const q = new Quaternion().setFromRotationMatrix(rotation).normalize();
  // Check an asymmetric mesh point against the captured pose. The negative
  // native X coordinate represents the component's fixed mesh reflection.
  const sourcePoint = new Vector3(.17, .29, -.11).applyQuaternion(rot).add(pos);
  const expectedPoint = new Vector3(sourcePoint.z, -sourcePoint.x, sourcePoint.y).multiplyScalar(100);
  const nativePoint = new Vector3(-17, 29, -11).applyQuaternion(q)
    .add(new Vector3(pos.z, -pos.x, pos.y).multiplyScalar(100));
  if (nativePoint.distanceTo(expectedPoint) > .001)
    throw new Error(`Prop basis mismatch: ${nativePoint.distanceTo(expectedPoint)} cm`);
  return [
    round(pos.z * 100), round(-pos.x * 100), round(pos.y * 100),
    round(q.x), round(q.y), round(q.z), round(q.w),
  ];
}

function gripPosition(frame, side) {
  const measured = frame[`${side.toLowerCase()}HandWorld`];
  if (measured) {
    if (!Array.isArray(measured) || measured.length !== 3 || measured.some(n => !Number.isFinite(n)))
      throw new Error(`Invalid ${side}HandWorld in captured frame`);
    const local = new Vector3(...measured).applyMatrix4(fromSample(frame.performerWorld).invert());
    return local.applyMatrix4(avatarBasis).multiplyScalar(100).toArray().map(round);
  }
  // Legacy captures lack explicit hand measurements; recover their skin
  // origin from the complete local joint hierarchy for diagnostics.
  const bones = new Map(frame.bones.map((bone) => [bone.name, bone]));
  const name = frame.bones.find((bone) => bone.name.replace(/^mixamorig\d*:?/, '') === `${side}Hand`)?.name;
  if (!name) throw new Error(`Missing ${side}Hand in captured frame`);
  const chain = [];
  for (let cursor = name; cursor; cursor = bones.get(cursor)?.parent) {
    const bone = bones.get(cursor);
    if (!bone || chain.length > bones.size) throw new Error(`Broken ${side}Hand hierarchy`);
    chain.unshift(bone.local);
  }
  const matrix = fromSample(frame.skinnedMeshLocal);
  for (const local of chain) matrix.multiply(fromSample(local));
  const hand = new Vector3().setFromMatrixPosition(matrix).applyMatrix4(avatarBasis).multiplyScalar(100);
  return hand.toArray().map(round);
}

if (process.argv[2] === "--verify-sample") {
  const sample = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
  if (sample.schema !== "flow-fest-native-performance-v1" || !sample.frames?.length)
    throw new Error("Expected a production performance capture");
  for (const frame of sample.frames) {
    const performerInverse = fromSample(frame.performerWorld).invert();
    pose(performerInverse, frame.leftProp.propRootWorld);
    pose(performerInverse, frame.rightProp.propRootWorld);
    gripPosition(frame, 'Left');
    gripPosition(frame, 'Right');
  }
  console.log(`Verified mirrored native basis against ${sample.frames.length * 2} captured prop poses`);
  process.exit(0);
}

const manifests = [];
for (const filename of ['manifest.json', 'family-manifest.json']) {
  if (!existsSync(join(rawDir, filename))) continue;
  const manifest = JSON.parse(await readFile(join(rawDir, filename), "utf8"));
  if (manifest.schema !== "flow-fest-native-export-manifest-v1")
    throw new Error(`Unexpected capture manifest: ${manifest.schema}`);
  manifests.push(manifest);
}
if (!manifests.length) throw new Error(`Missing native capture manifest in ${rawDir}`);
const artifacts = manifests.flatMap(manifest => manifest.artifacts);
const keys = artifacts.map(entry => `${entry.character}/${entry.role}`);
if (new Set(keys).size !== keys.length) throw new Error('Duplicate character/role in capture manifests');
const familyArtifacts = artifacts.filter(entry => entry.role.startsWith('family-'));
if (!allowPartial && familyArtifacts.length && (familyArtifacts.length !== 16 * 82 ||
    new Set(familyArtifacts.map(entry => entry.character)).size !== 16))
  throw new Error(`Expected 1,312 family captures over 16 rigs; found ${familyArtifacts.length}`);
await mkdir(outputDir, { recursive: true });
const generated = [];
for (const entry of artifacts.filter(entry =>
  (!familyOnly || entry.role.startsWith('family-')) &&
  (!captureId || entry.character === captureId) &&
  (!allowPartial || existsSync(join(rawDir, entry.filename))))) {
  const profile = profileForRole(entry.role);
  if (!profile) continue; // mounted pose has no held prop
  const capture = JSON.parse(await readFile(join(rawDir, entry.filename), "utf8"));
  if (capture.schema !== "flow-fest-native-performance-v1" ||
      capture.character !== entry.character || capture.role !== entry.role ||
      (entry.propType && capture.propType !== entry.propType) ||
      capture.fps !== 30 || capture.frames.length !== entry.frames)
    throw new Error(`Invalid production capture: ${entry.filename}`);
  const family = /^family-([a-z0-9_]+)-[AB]$/.exec(entry.role)?.[1];
  if (family && (capture.propType !== family || capture.frames.length !== 480))
    throw new Error(`Capture family/timing mismatch: ${entry.filename}`);
  const frames = capture.frames.map((frame, index) => {
    if (!frame.performerWorld || !frame.leftProp?.propRootWorld ||
        !frame.rightProp?.propRootWorld || frame.frame !== index)
      throw new Error(`Incomplete prop pose: ${entry.filename} frame ${index}`);
    const performerInverse = fromSample(frame.performerWorld).invert();
    return [
      ...pose(performerInverse, frame.leftProp.propRootWorld),
      ...pose(performerInverse, frame.rightProp.propRootWorld),
      ...gripPosition(frame, 'Left'),
      ...gripPosition(frame, 'Right'),
    ];
  });
  const character = entry.character.replaceAll("-", "_");
  const filename = `${character}_${profile}.json`;
  const clip = {
    schema: "flow-fest-prop-motion-v2",
    character: entry.character,
    profile,
    propId: String(capture.propType).toLowerCase(),
    fps: 30,
    sourceFrameCount: frames.length,
    coordinateBasis: "source XYZ to UE Feet (Z,-X,Y); rotation uses mirrored avatar basis and fixed native mesh X=-1",
    frames,
  };
  await writeFile(join(outputDir, filename), JSON.stringify(clip));
  generated.push({ character: entry.character, profile, filename, frames: frames.length });
}
if (!generated.length) throw new Error('No complete listed prop captures available for staging');
if (!allowPartial && !familyOnly && !captureId && generated.length !== artifacts.filter(
  entry => profileForRole(entry.role)).length)
  throw new Error(`Prop motion generation missed a listed capture: ${generated.length}`);
const manifestPath = join(outputDir, 'manifest.json');
let clips = generated;
if (allowPartial || familyOnly) {
  const previous = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
  if (previous && (previous.schema !== 'flow-fest-prop-motion-manifest-v1' || !Array.isArray(previous.clips)))
    throw new Error(`Unexpected existing prop manifest: ${manifestPath}`);
  const byKey = new Map((previous?.clips ?? []).map(clip => [`${clip.character}/${clip.profile}`, clip]));
  for (const clip of generated) byKey.set(`${clip.character}/${clip.profile}`, clip);
  clips = [...byKey.values()];
}
await writeFile(manifestPath, JSON.stringify({
  schema: 'flow-fest-prop-motion-manifest-v1', clips,
}, null, 2));
console.log(`Prepared ${generated.length} compact prop-motion clips (${clips.length} staged total) in ${outputDir}`);
