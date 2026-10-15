import { createHash } from 'node:crypto';

export const MUSEUM_PROP_COORDINATE_BASIS =
  'source XYZ to UE Feet (Z,-X,Y); rotation uses mirrored avatar basis and fixed native mesh X=-1';

export function museumPerformanceEntries(manifest) {
  if (manifest?.schema !== 'museum-native-performances-v1' ||
      manifest.characterId !== 'x-bot' || manifest.propId !== 'staff' ||
      !Array.isArray(manifest.performances) || !manifest.performances.length)
    throw new Error('Invalid Museum performance manifest');
  const profiles = new Set();
  return manifest.performances.map(item => {
    if (typeof item.sequenceId !== 'string' || !item.sequenceId ||
        typeof item.profile !== 'string' ||
        item.profile !== `M_${item.sequenceId.replace(/[^A-Za-z0-9_]/g, '_')}` ||
        profiles.has(item.profile) || !Array.isArray(item.sequence?.steps) ||
        !item.sequence.steps.length)
      throw new Error(`Invalid Museum performance profile: ${item.sequenceId}`);
    profiles.add(item.profile);
    const units = item.sequence.steps.reduce((sum, step) => {
      const duration = step.duration === undefined ? 1 : step.duration;
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error(`Invalid Museum step duration: ${item.sequenceId}`);
      return sum + duration;
    }, 0);
    const frames = Math.round(units * 30);
    if (!Number.isSafeInteger(frames) || frames < 2 || Math.abs(units * 30 - frames) > 1e-6)
      throw new Error(`Invalid Museum sequence duration: ${item.sequenceId}`);
    return { ...item, frames, seconds: frames / 30,
      filename: `x_bot_${item.profile}.json` };
  });
}

export function assertMuseumRawCapture(capture, entry) {
  if (capture?.schema !== 'flow-fest-native-performance-v1' ||
      capture.character !== 'x-bot' || capture.role !== entry.profile ||
      capture.propType !== 'staff' || capture.fps !== 30 ||
      capture.captureRevision !== 'clock-isolated-body-v3' ||
      capture.frames?.length !== entry.frames ||
      JSON.stringify(capture.sequence) !== JSON.stringify(entry.sequence))
    throw new Error(`Museum capture identity, sequence, or duration mismatch: ${entry.filename}`);
  const vector = (value, length) => Array.isArray(value) && value.length === length &&
    value.every(Number.isFinite);
  const transform = value => value && vector(value.position, 3) &&
    vector(value.quaternion, 4) && vector(value.scale, 3) &&
    value.scale.every(component => component !== 0);
  for (const [index, frame] of capture.frames.entries()) {
    if (frame.frame !== index || !transform(frame.performerWorld) ||
        !transform(frame.skinnedMeshLocal) ||
        !transform(frame.leftProp?.propRootWorld) ||
        !transform(frame.rightProp?.propRootWorld) ||
        !transform(frame.leftProp?.rotatedBodyWorld) ||
        !transform(frame.rightProp?.rotatedBodyWorld) ||
        !vector(frame.leftHandWorld, 3) || !vector(frame.rightHandWorld, 3) ||
        !Array.isArray(frame.bones) || !frame.bones.length ||
        frame.bones.some(bone => typeof bone.name !== 'string' || !transform(bone.local)))
      throw new Error(`Invalid Museum capture transform: ${entry.filename} frame ${index}`);
  }
  return capture;
}

export function assertMuseumCompactShape(clip, entry) {
  if (clip?.schema !== 'flow-fest-prop-motion-v3' ||
      clip.character !== 'x-bot' || clip.profile !== entry.profile ||
      clip.propId !== 'staff' || clip.fps !== 30 ||
      clip.sourceFrameCount !== entry.frames || !Array.isArray(clip.frames) ||
      clip.frames.length !== entry.frames ||
      clip.captureRevision !== 'clock-isolated-body-v3' ||
      clip.coordinateBasis !== MUSEUM_PROP_COORDINATE_BASIS ||
      !/^[a-f0-9]{64}$/.test(clip.sourceSHA256) ||
      clip.frames.some(frame => !Array.isArray(frame) || frame.length !== 28 ||
        frame.some(value => !Number.isFinite(value))))
    throw new Error(`Museum compact clip mismatch: ${entry.profile}`);
  return clip;
}

export function assertMuseumCompactClip(clip, entry, rawBytes) {
  assertMuseumCompactShape(clip, entry);
  const sourceSHA256 = createHash('sha256').update(rawBytes).digest('hex');
  if (clip.sourceSHA256 !== sourceSHA256)
    throw new Error(`Museum compact source hash mismatch: ${entry.profile}`);
  return clip;
}
