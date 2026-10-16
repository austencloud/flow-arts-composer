/* global process, URL, window */
/** Capture production performer rigs from a server rooted in this worktree.
 * Usage: node capture-performances.mjs http://127.0.0.1:5174 ./out */
import { chromium } from "playwright";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateCaptureProvenance,
  stableStringify,
} from "../../Shared/Tools/capture-provenance.mjs";

const [baseUrl, outputArg] = process.argv.slice(2);
if (!baseUrl || !outputArg)
  throw new Error(
    "Usage: node capture-performances.mjs <worktree-base-url> <output-dir>"
  );
const outputDir = resolve(outputArg);
await mkdir(outputDir, { recursive: true });
const list = (name) =>
  process.env[name]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const selected = list("FLOW_FEST_CAPTURE_CHARACTERS");
const selectedFamilies = list("FLOW_FEST_CAPTURE_FAMILIES");
const selectedVariants = list("FLOW_FEST_CAPTURE_VARIANTS") ?? ["A", "B"];
const familyMode = process.env.FLOW_FEST_CAPTURE_FAMILY_MODE === "1";
const rideOnly = process.env.FLOW_FEST_CAPTURE_RIDE_ONLY === "1";
const familyCaptureRevision = "clock-isolated-body-v3";
if (familyMode && rideOnly)
  throw new Error("Family and ride-only modes cannot be combined");

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, path);
}

function validatePerformance(result, character, role, propType) {
  if (
    (familyMode && result.captureRevision !== familyCaptureRevision) ||
    result.character !== character ||
    result.role !== role ||
    result.propType !== propType ||
    result.fps !== 30 ||
    result.scoreSteps !== 16 ||
    result.frames?.length !== 480 ||
    result.frames.some(
      (frame) =>
        !frame.bones?.length ||
        !frame.leftProp?.renderedMeshes?.length ||
        !frame.rightProp?.renderedMeshes?.length ||
        !frame.leftProp?.rotatedBodyWorld ||
        !frame.rightProp?.rotatedBodyWorld ||
        !Array.isArray(frame.leftHandWorld) ||
        frame.leftHandWorld.length !== 3 ||
        !Array.isArray(frame.rightHandWorld) ||
        frame.rightHandWorld.length !== 3
    )
  )
    throw new Error(`Incomplete production capture: ${character} / ${role}`);
  const tracks = {
    leftHand: (frame) => frame.leftHandWorld,
    rightHand: (frame) => frame.rightHandWorld,
    leftProp: (frame) => frame.leftProp.correctionWorld.position,
    rightProp: (frame) => frame.rightProp.correctionWorld.position,
  };
  const motion = {};
  for (const [name, point] of Object.entries(tracks)) {
    const distances = result.frames
      .slice(1)
      .map((frame, index) =>
        Math.hypot(
          ...point(frame).map(
            (value, axis) => value - point(result.frames[index])[axis]
          )
        )
      );
    const sorted = [...distances].sort((left, right) => left - right);
    const p99StepMeters = sorted[Math.floor(sorted.length * 0.99)];
    const seamMeters = Math.hypot(
      ...point(result.frames[0]).map(
        (value, axis) => value - point(result.frames.at(-1))[axis]
      )
    );
    const maxStepMeters = sorted.at(-1);
    motion[name] = { seamMeters, p99StepMeters, maxStepMeters };
    if (
      familyMode &&
      (!Number.isFinite(seamMeters) ||
        !Number.isFinite(maxStepMeters) ||
        seamMeters > Math.max(0.15, Math.min(0.5, p99StepMeters * 2)) ||
        maxStepMeters > 1)
    )
      throw new Error(
        `Discontinuous ${name} capture: ${character} / ${role}; seam ${seamMeters.toFixed(3)}m, largest step ${maxStepMeters.toFixed(3)}m`
      );
  }
  return motion;
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  page.on("pageerror", (error) =>
    process.stderr.write(`Page error: ${error.message}\n`)
  );
  const captureAddress = new URL("/test/flow-fest-native-export", baseUrl);
  if (familyMode) captureAddress.searchParams.set("family", "1");
  const captureUrl = captureAddress.href;
  async function loadPage() {
    await page.goto(captureUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => window.flowFestNativeCapture?.isReady(),
      null,
      { timeout: 120_000 }
    );
    const status = await page.evaluate(() =>
      window.flowFestNativeCapture.getStatus()
    );
    if (!status.startsWith("Generated ")) throw new Error(status);
  }
  await loadPage();
  const receiptResponse = await page.request.get(
    new URL("/native-capture-build.json", baseUrl).href
  );
  if (!receiptResponse.ok())
    throw new Error(
      "Native capture requires a fingerprinted static build; run the native capture Vite build and static runner."
    );
  const buildReceipt = await receiptResponse.json();
  if (buildReceipt.schema !== "tka-native-capture-build-v1")
    throw new Error("Invalid native capture build receipt");
  const catalog = await page.evaluate(() => ({
    characters: window.flowFestNativeCapture.characters,
    roles: window.flowFestNativeCapture.roles,
    families: window.flowFestNativeCapture.families,
  }));
  if (
    catalog.characters.length !== 16 ||
    catalog.roles.length !== 4 ||
    catalog.families.length !== 41
  )
    throw new Error(
      `Unexpected production catalog: ${JSON.stringify(catalog)}`
    );
  if (selected?.some((id) => !catalog.characters.includes(id)))
    throw new Error(
      `Unknown focused capture character: ${selected.join(", ")}`
    );
  if (selectedFamilies?.some((id) => !catalog.families.includes(id)))
    throw new Error(`Unknown prop family: ${selectedFamilies.join(", ")}`);
  if (selectedVariants.some((id) => id !== "A" && id !== "B"))
    throw new Error(`Unknown variant: ${selectedVariants.join(", ")}`);

  const characters = selected ?? catalog.characters;
  const families = selectedFamilies ?? catalog.families;
  const manifestPath = resolve(
    outputDir,
    familyMode ? "family-manifest.json" : "manifest.json"
  );
  const prior = await readJson(manifestPath);
  if (
    familyMode &&
    prior?.artifacts?.length &&
    prior.captureRevision !== familyCaptureRevision
  )
    process.stdout.write(
      "Old family manifest found; checking each capture before reuse.\n"
    );
  const artifacts = new Map(
    (prior?.buildId === buildReceipt.id ? (prior.artifacts ?? []) : []).map(
      (item) => [item.filename, item]
    )
  );
  async function record(artifact) {
    artifacts.set(artifact.filename, artifact);
    if (!familyMode && (selected || rideOnly)) return;
    await writeJsonAtomic(manifestPath, {
      schema: "flow-fest-native-export-manifest-v1",
      ...(familyMode ? { captureRevision: familyCaptureRevision } : {}),
      sourceUrl: captureUrl,
      buildId: buildReceipt.id,
      mode: familyMode ? "families" : "legacy",
      artifacts: [...artifacts.values()],
    });
  }

  if (familyMode) {
    for (const family of families)
      for (const variant of selectedVariants) {
        const role = `family-${family}-${variant}`;
        const snapshotPath = resolve(outputDir, `${role}.sequence.json`);
        let snapshot = await readJson(snapshotPath);
        if (snapshot && snapshot.steps?.length !== 16)
          throw new Error(`Preserved 16-step LOOP invalid for ${role}`);
        if (snapshot) {
          await page.evaluate(
            ([key, sequence]) =>
              window.flowFestNativeCapture.setFamilySequenceSnapshots({
                [key]: sequence,
              }),
            [role, snapshot]
          );
        } else {
          snapshot = await page.evaluate(
            ([prop, nextVariant]) =>
              window.flowFestNativeCapture.prepareFamily(prop, nextVariant),
            [family, variant]
          );
          if (snapshot?.steps?.length !== 16)
            throw new Error(`Generation failed for ${role}`);
          await writeJsonAtomic(snapshotPath, snapshot);
        }
        for (const character of characters) {
          const filename = `${character}_${role}.json`;
          const path = resolve(outputDir, filename);
          const existing = await readJson(path);
          if (existing) {
            try {
              const effect =
                family.includes("fire") ||
                family.includes("torch") ||
                family === "poi"
                  ? "fire"
                  : "led";
              const expected = await page.evaluate(
                ([id, profile, sequence, prop, fx]) =>
                  window.flowFestNativeCapture.inspectCapture(
                    id,
                    profile,
                    sequence,
                    prop,
                    fx
                  ),
                [character, role, snapshot, family, effect]
              );
              await validateCaptureProvenance(existing, {
                expectedBuildId: buildReceipt.id,
                expectedSequence: snapshot,
                expectedMotionOptions: expected.motionOptions,
                expectedRig: expected.rig,
                expectedProps: expected.props,
                expectedClock: expected.clock,
              });
              const motion = validatePerformance(
                existing,
                character,
                role,
                family
              );
              if (
                stableStringify(existing.sequence) !== stableStringify(snapshot)
              )
                throw new Error("Sequence differs");
              await record({
                character,
                role,
                propType: family,
                filename,
                frames: 480,
                motion,
              });
              continue;
            } catch (error) {
              process.stdout.write(
                `Recapturing ${filename}: ${error.message}\n`
              );
            }
          }
          process.stdout.write(`${character} / ${role}\n`);
          const result = await page.evaluate(
            ([id, prop, nextVariant]) =>
              window.flowFestNativeCapture.captureFamily(id, prop, nextVariant),
            [character, family, variant]
          );
          const motion = validatePerformance(result, character, role, family);
          await validateCaptureProvenance(result, {
            expectedBuildId: buildReceipt.id,
            expectedSequence: snapshot,
          });
          if (JSON.stringify(result.sequence) !== JSON.stringify(snapshot))
            throw new Error(`Captured LOOP differs from ${snapshotPath}`);
          await writeJsonAtomic(path, result);
          await record({
            character,
            role,
            propType: family,
            filename,
            frames: 480,
            motion,
          });
        }
        // A fresh page releases WebGL resources accumulated by dozens of production rigs.
        await loadPage();
      }
  } else {
    if (selected && !rideOnly) {
      const snapshots = {};
      for (const role of catalog.roles) {
        const previous = await readJson(
          resolve(outputDir, `x-bot_${role}.json`)
        );
        if (previous?.role !== role || !previous.sequence?.steps?.length)
          throw new Error(`Preserved production sequence missing for ${role}`);
        snapshots[role] = previous.sequence;
      }
      await page.evaluate(
        (value) => window.flowFestNativeCapture.setSequenceSnapshots(value),
        snapshots
      );
    }
    for (const character of characters) {
      for (const role of rideOnly ? [] : catalog.roles) {
        process.stdout.write(`${character} / ${role}\n`);
        const result = await page.evaluate(
          ([id, profile]) =>
            window.flowFestNativeCapture.captureOne(id, profile),
          [character, role]
        );
        validatePerformance(result, character, role, result.propType);
        await validateCaptureProvenance(result, {
          expectedBuildId: buildReceipt.id,
        });
        const filename = `${character}_${role}.json`;
        await writeJsonAtomic(resolve(outputDir, filename), result);
        await record({
          character,
          role,
          filename,
          frames: result.frames.length,
        });
      }
      process.stdout.write(`${character} / ride\n`);
      const ride = await page.evaluate(
        (id) => window.flowFestNativeCapture.captureRide(id),
        character
      );
      if (
        ride.frames?.length !== 30 ||
        ride.frames.some((frame) => !frame.bones?.length)
      )
        throw new Error(`Incomplete mounted capture: ${character}`);
      const filename = `${character}_ride.json`;
      await writeJsonAtomic(resolve(outputDir, filename), ride);
      await record({ character, role: "ride", filename, frames: 30 });
    }
  }
  process.stdout.write(`Captured ${artifacts.size} clips into ${outputDir}\n`);
} finally {
  await browser.close();
}
