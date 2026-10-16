/** Capture authored Museum sequences through the shared production performer route.
 * Usage: node capture-performances.mjs <base-url> <output-dir> <museum-performances.json> */
import { chromium } from "playwright";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCaptureProvenance } from "../../Shared/Tools/capture-provenance.mjs";

const [baseUrl, outputArg, manifestArg] = process.argv.slice(2);
if (!baseUrl || !outputArg || !manifestArg)
  throw new Error(
    "Usage: node capture-performances.mjs <base-url> <output-dir> <museum-performances.json>"
  );

const outputDir = resolve(outputArg);
const source = JSON.parse(await readFile(resolve(manifestArg), "utf8"));
if (
  source.schema !== "museum-native-performances-v1" ||
  source.characterId !== "x-bot" ||
  source.propId !== "staff" ||
  !Array.isArray(source.performances) ||
  source.performances.length !== 25
)
  throw new Error("Expected 25 authored x-bot/staff Museum performances");

function frameCount(sequence) {
  if (!Array.isArray(sequence?.steps) || sequence.steps.length === 0)
    throw new Error("Authored sequence has no steps");
  const scoreUnits = sequence.steps.reduce((total, step) => {
    if (!Number.isFinite(step.duration) || step.duration <= 0)
      throw new Error("Authored sequence has an invalid step duration");
    return total + step.duration;
  }, 0);
  const exactFrames = scoreUnits * 30;
  const frames = Math.round(exactFrames);
  if (
    !Number.isSafeInteger(frames) ||
    frames <= 0 ||
    Math.abs(exactFrames - frames) > 1e-6
  )
    throw new Error("Authored sequence must resolve to whole 30 fps frames");
  return frames;
}

function validVector(value, size) {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every(Number.isFinite)
  );
}

function validTransform(value) {
  return (
    validVector(value?.position, 3) &&
    validVector(value?.quaternion, 4) &&
    validVector(value?.scale, 3)
  );
}

function validProp(value) {
  return (
    validTransform(value?.correctionWorld) &&
    validTransform(value?.propRootWorld) &&
    validTransform(value?.rotatedBodyWorld) &&
    Array.isArray(value.renderedMeshes) &&
    value.renderedMeshes.length > 0 &&
    value.renderedMeshes.every((mesh) => validTransform(mesh.world))
  );
}

function validateCapture(capture, performance) {
  const { sequenceId, profile, sequence } = performance;
  const expectedFrames = frameCount(sequence);
  if (
    capture?.schema !== "flow-fest-native-performance-v1" ||
    capture.captureRevision !== "clock-isolated-body-v3" ||
    capture.character !== source.characterId ||
    capture.role !== profile ||
    capture.propType !== source.propId ||
    capture.effectId !== "led" ||
    capture.fps !== 30 ||
    capture.scoreUnitsPerSecond !== 1 ||
    capture.scoreSteps !== sequence.steps.length ||
    capture.frames?.length !== expectedFrames ||
    JSON.stringify(capture.sequence) !== JSON.stringify(sequence)
  )
    throw new Error(`Stale or incomplete capture for ${sequenceId}`);
  for (const [index, frame] of capture.frames.entries()) {
    if (
      frame.frame !== index ||
      frame.timeSeconds !== index / 30 ||
      frame.score !== index / 30 ||
      !frame.bones?.length ||
      !validTransform(frame.performerWorld) ||
      !validTransform(frame.skinnedMeshLocal) ||
      !frame.bones.every((bone) => validTransform(bone.local)) ||
      !validProp(frame.leftProp) ||
      !validProp(frame.rightProp) ||
      !validVector(frame.leftHandWorld, 3) ||
      !validVector(frame.rightHandWorld, 3)
    )
      throw new Error(`Incomplete frame ${index} for ${sequenceId}`);
  }
  return expectedFrames;
}

const profiles = new Set();
const sequenceIds = new Set();
for (const performance of source.performances) {
  if (
    typeof performance.sequenceId !== "string" ||
    !performance.sequenceId ||
    typeof performance.profile !== "string" ||
    !/^M_[A-Za-z0-9_]+$/.test(performance.profile) ||
    performance.sequence?.id !== `museum-native-${performance.sequenceId}` ||
    performance.profile !==
      `M_${performance.sequenceId.replace(/[^A-Za-z0-9]/g, "_")}` ||
    profiles.has(performance.profile) ||
    sequenceIds.has(performance.sequenceId)
  )
    throw new Error(
      `Invalid Museum performance identity: ${performance.sequenceId}`
    );
  frameCount(performance.sequence);
  profiles.add(performance.profile);
  sequenceIds.add(performance.sequenceId);
}

await mkdir(outputDir, { recursive: true });
const captureUrl = new URL("/test/flow-fest-native-export?custom=1", baseUrl)
  .href;
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  const receiptResponse = await page.request.get(
    new URL("/native-capture-build.json", baseUrl).href
  );
  if (!receiptResponse.ok())
    throw new Error(
      "Museum capture requires a fingerprinted native capture static build"
    );
  const buildReceipt = await receiptResponse.json();
  if (buildReceipt.schema !== "tka-native-capture-build-v1")
    throw new Error("Invalid native capture build receipt");
  page.on("pageerror", (error) =>
    process.stderr.write(`Page error: ${error.message}\n`)
  );
  for (const performance of source.performances) {
    const filename = `x_bot_${performance.profile}.json`;
    const outputPath = resolve(outputDir, filename);
    let existing = null;
    try {
      existing = JSON.parse(await readFile(outputPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (existing) {
      try {
        await page.goto(captureUrl, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        await page.waitForFunction(
          () => window.flowFestNativeCapture?.isReady(),
          null,
          { timeout: 120_000 }
        );
        const expected = await page.evaluate(
          ({ characterId, profile, sequence, propId }) =>
            window.flowFestNativeCapture.inspectCapture(
              characterId,
              profile,
              sequence,
              propId,
              "led"
            ),
          {
            characterId: source.characterId,
            profile: performance.profile,
            sequence: performance.sequence,
            propId: source.propId,
          }
        );
        await validateCaptureProvenance(existing, {
          expectedBuildId: buildReceipt.id,
          expectedSequence: performance.sequence,
          expectedMotionOptions: expected.motionOptions,
          expectedRig: expected.rig,
          expectedProps: expected.props,
          expectedClock: expected.clock,
        });
        validateCapture(existing, performance);
        process.stdout.write(`Reused ${filename}\n`);
        continue;
      } catch (error) {
        process.stdout.write(`Recapturing ${filename}: ${error.message}\n`);
      }
    }
    await page.goto(captureUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => window.flowFestNativeCapture?.isReady(),
      null,
      { timeout: 120_000 }
    );
    const capture = await page.evaluate(
      ({ characterId, profile, sequence, propId }) =>
        window.flowFestNativeCapture.captureSequence(
          characterId,
          profile,
          sequence,
          propId,
          "led"
        ),
      {
        characterId: source.characterId,
        profile: performance.profile,
        sequence: performance.sequence,
        propId: source.propId,
      }
    );
    const frames = validateCapture(capture, performance);
    await validateCaptureProvenance(capture, {
      expectedBuildId: buildReceipt.id,
      expectedSequence: performance.sequence,
    });
    const temporary = `${outputPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(capture));
    await rename(temporary, outputPath);
    process.stdout.write(`Captured ${filename}: ${frames} frames\n`);
  }
} finally {
  await browser.close();
}
