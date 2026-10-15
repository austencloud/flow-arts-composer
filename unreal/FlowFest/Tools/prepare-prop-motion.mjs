/** Reduce production Three.js captures to runtime prop-root poses.
 * Usage: node Tools/prepare-prop-motion.mjs [raw-capture-dir]
 * Native FBX prop vertices retain the source prop's numeric local axes, so the
 * root quaternion includes the fixed Three-to-Unreal basis rotation.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const rawDir = resolve(process.argv[2] ?? join(project, "Saved/PerformanceCaptures"));
const outputDir = join(project, "Content/Data/PropMotion");
const profiles = new Map([
  ["fire-poi", "FirePoi"],
  ["fire-hoop", "FireHoop"],
  ["juggler", "Juggler"],
  ["led-flow", "LedFlow"],
]);

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

if (process.argv[2] === "--verify-sample") {
  const sample = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
  if (sample.schema !== "flow-fest-native-performance-v1" || !sample.frames?.length)
    throw new Error("Expected a production performance capture");
  for (const frame of sample.frames) {
    const performerInverse = fromSample(frame.performerWorld).invert();
    pose(performerInverse, frame.leftProp.propRootWorld);
    pose(performerInverse, frame.rightProp.propRootWorld);
  }
  console.log(`Verified mirrored native basis against ${sample.frames.length * 2} captured prop poses`);
  process.exit(0);
}

const manifest = JSON.parse(await readFile(join(rawDir, "manifest.json"), "utf8"));
if (manifest.schema !== "flow-fest-native-export-manifest-v1")
  throw new Error(`Unexpected capture manifest: ${manifest.schema}`);
await mkdir(outputDir, { recursive: true });
const generated = [];
for (const entry of manifest.artifacts) {
  const profile = profiles.get(entry.role);
  if (!profile) continue; // mounted pose has no held prop
  const capture = JSON.parse(await readFile(join(rawDir, entry.filename), "utf8"));
  if (capture.schema !== "flow-fest-native-performance-v1" ||
      capture.character !== entry.character || capture.role !== entry.role ||
      capture.fps !== 30 || capture.frames.length !== entry.frames)
    throw new Error(`Invalid production capture: ${entry.filename}`);
  const frames = capture.frames.map((frame, index) => {
    if (!frame.performerWorld || !frame.leftProp?.propRootWorld ||
        !frame.rightProp?.propRootWorld || frame.frame !== index)
      throw new Error(`Incomplete prop pose: ${entry.filename} frame ${index}`);
    const performerInverse = fromSample(frame.performerWorld).invert();
    return [
      ...pose(performerInverse, frame.leftProp.propRootWorld),
      ...pose(performerInverse, frame.rightProp.propRootWorld),
    ];
  });
  const character = entry.character.replaceAll("-", "_");
  const filename = `${character}_${profile}.json`;
  const clip = {
    schema: "flow-fest-prop-motion-v1",
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
const expected = manifest.artifacts.filter((entry) => profiles.has(entry.role)).length;
if (generated.length !== expected || generated.length !== 64)
  throw new Error(`Expected 64 complete prop clips, got ${generated.length}/${expected}`);
await writeFile(join(outputDir, "manifest.json"), JSON.stringify({
  schema: "flow-fest-prop-motion-manifest-v1", clips: generated,
}, null, 2));
console.log(`Prepared ${generated.length} compact prop-motion clips in ${outputDir}`);
