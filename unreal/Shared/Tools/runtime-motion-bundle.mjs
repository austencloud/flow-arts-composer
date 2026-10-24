import { Matrix4, PropertyBinding, Quaternion, Vector3 } from 'three';
import { sha256, stableStringify, validateCaptureProvenance } from './capture-provenance.mjs';
import { nativePropFrame } from './native-prop-frame.mjs';

const SCHEMA = 'flow-arts-runtime-motion-v1';
const REVISION = 'clock-isolated-body-v3';
const GRIP_REVISION = 'monotonic-grip-validated-v4';
const DYNAMIC_GRIP_REVISION = 'monotonic-dynamic-grip-v5';
const hasGripValidation = capture => [GRIP_REVISION, DYNAMIC_GRIP_REVISION].includes(capture.captureRevision);
const MAX_FRAMES = 18000;
const identity = [0, 0, 0, 1];
const unit = [1, 1, 1];
const round = n => Math.round(n * 1e5) / 1e5;

export function sourceGlbJson(bytes) {
  const view = new DataView(bytes instanceof ArrayBuffer ? bytes : bytes.buffer,
    bytes instanceof ArrayBuffer ? 0 : bytes.byteOffset,
    bytes.byteLength);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== view.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a ||
    view.getUint32(12, true) > view.byteLength - 20)
    throw new Error('Source rig is not a complete binary glTF');
  const jsonBytes = new Uint8Array(view.buffer, view.byteOffset + 20, view.getUint32(12, true));
  return JSON.parse(new TextDecoder().decode(jsonBytes));
}

function assertNumbers(values, width, label) {
  if (!Array.isArray(values) || values.length !== width || values.some(n => !Number.isFinite(n)))
    throw new Error(`Invalid ${label}`);
}

function assertQuaternion(values, label) {
  assertNumbers(values, 4, label);
  const size = Math.hypot(...values);
  if (size < .995 || size > 1.005) throw new Error(`Non-unit ${label}`);
}

function transform(sample, label) {
  if (!sample) throw new Error(`Missing ${label}`);
  assertNumbers(sample.position, 3, `${label} position`);
  assertQuaternion(sample.quaternion, `${label} rotation`);
  assertNumbers(sample.scale, 3, `${label} scale`);
  return new Matrix4().compose(
    new Vector3(...sample.position), new Quaternion(...sample.quaternion),
    new Vector3(...sample.scale));
}

function sampleArray(sample, label) {
  if (!sample) throw new Error(`Missing ${label}`);
  assertNumbers(sample.position, 3, `${label} position`);
  assertQuaternion(sample.quaternion, `${label} rotation`);
  assertNumbers(sample.scale, 3, `${label} scale`);
  return [...sample.position, ...sample.quaternion, ...sample.scale].map(round);
}

function glbRestBones(glb, captureBones, firstFrame) {
  if (!glb || !Array.isArray(glb.nodes)) throw new Error('Source GLB nodes are missing');
  const expected = new Set(captureBones.map(bone => bone.name));
  const nodes = new Map();
  for (const node of glb.nodes) {
    // GLTFLoader applies this same sanitizer before exposing scene bone names.
    const name = PropertyBinding.sanitizeNodeName(node.name ?? '');
    if (!expected.has(name)) continue;
    if (nodes.has(name)) throw new Error(`Duplicate GLB node ${name}`);
    nodes.set(name, node);
  }
  const locals = captureBones.map(bone => {
    const node = nodes.get(bone.name);
    if (!node) throw new Error(`Source GLB bone ${bone.name} is missing`);
    let local;
    if (node.matrix) {
      assertNumbers(node.matrix, 16, `${bone.name} rest matrix`);
      const p = new Vector3(), q = new Quaternion(), s = new Vector3();
      new Matrix4().fromArray(node.matrix).decompose(p, q, s);
      local = [...p.toArray(), ...q.toArray(), ...s.toArray()];
    } else {
      const p = node.translation ?? [0, 0, 0];
      const q = node.rotation ?? identity;
      const s = node.scale ?? unit;
      assertNumbers(p, 3, `${bone.name} rest position`);
      assertQuaternion(q, `${bone.name} rest rotation`);
      assertNumbers(s, 3, `${bone.name} rest scale`);
      local = [...p, ...q, ...s];
    }
    return local;
  });
  const performerInverse = transform(firstFrame.performerWorld, 'performer').invert();
  const matrices = new Map();
  return captureBones.map((bone, index) => {
    const local = locals[index];
    const localMatrix = new Matrix4().compose(
      new Vector3(...local.slice(0, 3)), new Quaternion(...local.slice(3, 7)),
      new Vector3(...local.slice(7, 10)));
    const parentMatrix = bone.parent
      ? matrices.get(bone.parent)
      : performerInverse.clone().multiply(transform(bone.rootParentWorld, `${bone.name} root parent`));
    if (!parentMatrix) throw new Error(`Rest bone parent ${bone.parent} is missing`);
    const bindMatrix = parentMatrix.clone().multiply(localMatrix);
    matrices.set(bone.name, bindMatrix);
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    bindMatrix.decompose(p, q, s);
    return { name: bone.name, parent: bone.parent,
      rest: local.map(round), bind: sampleArray({ position: p.toArray(), quaternion: q.toArray(),
        scale: s.toArray() }, `${bone.name} bind`) };
  });
}

function frameBones(frame, skeleton) {
  if (!Array.isArray(frame.bones) || frame.bones.length !== skeleton.length)
    throw new Error('Incomplete captured bone frame');
  return frame.bones.map((bone, index) => {
    const expected = skeleton[index];
    if (bone.name !== expected.name || bone.parent !== expected.parent)
      throw new Error(`Captured bone order changed at ${index}`);
    return sampleArray(bone.component, `${bone.name} component`);
  });
}

/** Exact score duration with a uniform sampling interval no longer than 1/30s. */
export function runtimeMotionTiming(sequence) {
  if (!sequence?.steps?.length) throw new Error('Authored sequence has no steps');
  const durationSeconds = sequence.steps.reduce((total, step) => {
    if (!Number.isFinite(step.duration) || step.duration <= 0)
      throw new Error('Authored sequence has an invalid step duration');
    return total + step.duration;
  }, 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600)
    throw new Error('Authored sequence duration must be positive and at most 600 seconds');
  const nearestFrame = Math.round(durationSeconds * 30);
  const frameCount = durationSeconds === nearestFrame / 30
    ? nearestFrame : Math.ceil(durationSeconds * 30);
  return { durationSeconds, frameCount };
}

export function runtimeMotionSampleTime(index, durationSeconds, frameCount) {
  if (index === frameCount) return durationSeconds;
  // Preserve the existing integer-frame clock byte for byte.
  return durationSeconds === frameCount / 30 ? index / 30 : index * (durationSeconds / frameCount);
}

/**
 * Build a portable, runtime-readable pose bundle from the production capture.
 * @param {unknown} capture
 * @param {{ sourceGlb: ReturnType<typeof sourceGlbJson>, sourceRigSHA256: string, loop?: boolean }} [options]
 */
export async function createRuntimeMotionBundle(capture, { sourceGlb, sourceRigSHA256, loop = true } = {}) {
  if (capture?.schema !== 'flow-fest-native-performance-v1' || ![REVISION, GRIP_REVISION, DYNAMIC_GRIP_REVISION].includes(capture.captureRevision) ||
    capture.fps !== 30 || !capture.character || !capture.propType ||
    !Array.isArray(capture.frames) || capture.frames.length < 1 || capture.frames.length > MAX_FRAMES ||
    typeof loop !== 'boolean') throw new Error('Invalid runtime capture identity or length');
  await validateCaptureProvenance(capture);
  const capturePlane = capture.provenance.motionOptions.capturePlane;
  if (capturePlane !== undefined && !['wall', 'wheel', 'floor'].includes(capturePlane))
    throw new Error('Invalid capture plane');
  if (hasGripValidation(capture) &&
      (capture.provenance.motionOptions.contactMode !== 'prop-authoritative' ||
       capture.provenance.motionOptions.reachPolicy !== 'paired-body-final-socket-v1'))
    throw new Error('Invalid strict palm contact policy');
  if (!/^[a-f0-9]{64}$/.test(sourceRigSHA256) ||
    sourceRigSHA256 !== capture.provenance.rig.sourceSHA256)
    throw new Error('Source rig hash differs from captured rig');
  const { durationSeconds, frameCount } = runtimeMotionTiming(capture.sequence);
  if (capture.frames.length !== frameCount ||
      (capture.provenance.clock.durationSeconds !== undefined &&
       capture.provenance.clock.durationSeconds !== durationSeconds))
    throw new Error('Capture clock duration or sample count differs from authored score');
  const first = capture.frames[0];
  if (!first?.bones?.length || new Set(first.bones.map(bone => bone.name)).size !== first.bones.length)
    throw new Error('Incomplete or duplicate captured skeleton');
  const effectivePropLengthCm = first.effectivePropLengthCm;
  if (effectivePropLengthCm !== undefined &&
      (typeof effectivePropLengthCm !== 'number' || !Number.isFinite(effectivePropLengthCm) ||
       effectivePropLengthCm <= 0 || effectivePropLengthCm > 1000))
    throw new Error('Invalid captured effective prop length');
  const skeleton = glbRestBones(sourceGlb, first.bones, first);
  if (loop && capture.terminalFrame)
    throw new Error('Looping capture must not include a terminal frame');
  if (!loop && !capture.terminalFrame)
    throw new Error('One-shot capture needs an exact terminal frame');
  const sourceFrames = loop ? capture.frames : [...capture.frames, capture.terminalFrame];
  let maxPalmGripErrorM = 0;
  let visibleSideSamples = 0;
  const frames = sourceFrames.map((frame, index) => {
    const propVisibility = frame.propVisibility === undefined ? [true, true] : frame.propVisibility;
    if (!Array.isArray(propVisibility) || propVisibility.length !== 2 ||
        propVisibility.some(value => typeof value !== 'boolean'))
      throw new Error(`Invalid prop visibility at frame ${index}`);

    if (hasGripValidation(capture)) {
      for (const [sideIndex, side] of ['left', 'right'].entries()) {
        const palm = frame.gripAttachment?.[`${side}PalmWorld`];
        const grip = frame.gripAttachment?.[`${side}RenderedGripWorld`];
        const finitePoint = point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
        if (!finitePoint(palm) || (propVisibility[sideIndex] && !finitePoint(grip)))
          throw new Error(`Missing actual palm/visible grip measurement at frame ${index}`);
        if (propVisibility[sideIndex]) {
          const errorM = Math.hypot(...palm.map((value, axis) => value - grip[axis]));
          if (errorM > 0.002) throw new Error(`Detached palm/visible grip at frame ${index}`);
          maxPalmGripErrorM = Math.max(maxPalmGripErrorM, errorM);
          visibleSideSamples++;
        }
        const prop = frame[`${side}Prop`];
        if (['position', 'quaternion', 'scale'].some(field =>
          !Array.isArray(prop?.correctionWorld?.[field]) ||
          prop.correctionWorld[field].some((value, axis) => value !== prop.propRootWorld?.[field]?.[axis])))
          throw new Error(`Prop root differs from visible grip frame at frame ${index}`);
      }
    }
    if (frame.frame !== index || frame.timeSeconds !== runtimeMotionSampleTime(index, durationSeconds, frameCount))
      throw new Error(`Capture clock changed at frame ${index}`);
    if (frame.effectivePropLengthCm !== effectivePropLengthCm)
      throw new Error(`Effective prop length changed at frame ${index}`);
    const visibility = { propVisibility: [...propVisibility] };
    const bones = frameBones(frame, skeleton);
    const prop = nativePropFrame(frame);
    if (prop.length !== 28 || prop.some(value => !Number.isFinite(value)))
      throw new Error(`Invalid native prop frame ${index}`);
    if (capture.captureRevision === DYNAMIC_GRIP_REVISION) {
      if (!Array.isArray(frame.palmLocal) || frame.palmLocal.length !== 6 ||
          !frame.palmLocal.every(Number.isFinite) ||
          [0, 3].some(start => Math.hypot(...frame.palmLocal.slice(start, start + 3)) > 0.5) ||
          !Number.isFinite(frame.gripRelaxation) || frame.gripRelaxation < 0 || frame.gripRelaxation > 1)
        throw new Error(`Invalid dynamic grip calibration at frame ${index}`);
      return { bones, prop, ...visibility, palmLocal: [...frame.palmLocal], gripRelaxation: frame.gripRelaxation };
    }
    return { bones, prop, ...visibility };
  });
  const sequenceJson = stableStringify(capture.sequence);
  const sequenceSHA256 = await sha256(sequenceJson);
  const propId = capture.nativePropId ?? capture.propType;
  if (typeof propId !== 'string' || (propId !== capture.propType && !propId.startsWith(`${capture.propType}:`)))
    throw new Error('Native prop identity differs from captured family');
  const bundleIdentitySHA256 = await sha256(stableStringify({
    ...(capturePlane && capturePlane !== 'wall' ? { capturePlane } : {}),
    characterId: capture.character, propId,
    rigSHA256: sourceRigSHA256, sequenceSHA256, loop,
  }));
  return {
    schema: SCHEMA, characterId: capture.character, propId,
    ...(capturePlane && capturePlane !== 'wall' ? { capturePlane } : {}),
    propFamily: String(capture.propType).toLowerCase().split(':')[0],
    ...(effectivePropLengthCm === undefined ? {} : { effectivePropLengthCm }),
    sequenceJson, sequenceSHA256, bundleIdentitySHA256,
    fps: 30, frameCount: frames.length,
    durationSeconds, loop, captureRevision: capture.captureRevision,
    ...(hasGripValidation(capture) ? { gripValidation: {
      measurement: 'same-frame-calibrated-palm-to-rendered-grip',
      maxErrorCm: maxPalmGripErrorM * 100, limitCm: 0.2,
      sideSamples: visibleSideSamples,
      contactMode: capture.provenance.motionOptions.contactMode,
      reachPolicy: capture.provenance.motionOptions.reachPolicy,
    } } : {}),
    skeleton: { space: 'three-performer-meters', rigSHA256: sourceRigSHA256, bones: skeleton },
    frames,
  };
}
