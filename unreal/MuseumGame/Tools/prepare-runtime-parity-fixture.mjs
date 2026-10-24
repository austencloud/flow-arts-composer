/** Convert one preserved raw capture to a portable runtime parity fixture.
 * This never alters or fills capture data: legacy local-only captures require
 * a fresh production recapture from the exact authored score. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRuntimeMotionBundle, sourceGlbJson } from '../../Shared/Tools/runtime-motion-bundle.mjs';

const [captureArg, sourceRigArg, outputArg] = process.argv.slice(2);
if (!captureArg || !sourceRigArg || !outputArg)
  throw new Error('Usage: node prepare-runtime-parity-fixture.mjs CAPTURE.json SOURCE_RIG.glb OUTPUT.motion.json');
const captureBytes = await readFile(resolve(captureArg));
const captureSHA256 = createHash('sha256').update(captureBytes).digest('hex');
const capture = JSON.parse(captureBytes.toString('utf8'));
if (capture?.schema !== 'flow-fest-native-performance-v1' ||
    capture.character !== 'x-bot' || !Array.isArray(capture.frames) || !capture.frames.length)
  throw new Error('Expected one preserved production x-bot performance capture');
if (capture.frames.some(frame => !Array.isArray(frame.bones) ||
    !frame.bones.length || frame.bones.some(bone => !bone.component ||
      (bone.parent === null && !bone.rootParentWorld))))
  throw new Error('Capture lacks component bones/rootParentWorld; recapture the score through the current production exporter instead of inventing ancestor transforms');
if (!Number.isFinite(capture.frames[0].effectivePropLengthCm) ||
    capture.frames[0].effectivePropLengthCm <= 0)
  throw new Error('Capture lacks an explicit effective physical prop length; recapture with the physical prop selected');
const rigBytes = await readFile(resolve(sourceRigArg));
const sourceRigSHA256 = createHash('sha256').update(rigBytes).digest('hex');
const bundle = await createRuntimeMotionBundle(capture, {
  sourceGlb: sourceGlbJson(rigBytes), sourceRigSHA256, loop: true,
});
await writeFile(resolve(outputArg), `${JSON.stringify(bundle)}\n`, 'utf8');
console.log(JSON.stringify({ output: resolve(outputArg), captureSHA256,
  rigSHA256: sourceRigSHA256, characterId: bundle.characterId,
  propId: bundle.propId, sequenceSHA256: bundle.sequenceSHA256,
  frameCount: bundle.frameCount, durationSeconds: bundle.durationSeconds }));
