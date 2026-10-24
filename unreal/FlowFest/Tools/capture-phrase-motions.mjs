/* global process, URL, window */
/**
 * Phrase stage capture: every distinct (sequence, plane, prop, character) the phrase schedule
 * plays, captured with the production browser performer at the schedule's tempo (one step per
 * beat) and written as a looping runtime motion bundle the native stage loads without cooking.
 *
 * Run through native-capture-static-runner.mjs with FLOW_FEST_CAPTURE_PHRASE_SCHEDULE set; see
 * native-capture-README.md. Optional: FLOW_FEST_CAPTURE_PHRASE_LIBRARY (defaults to the snapshot
 * next to the schedule) and FLOW_FEST_CAPTURE_PHRASE_BEATS (only phrases starting before it).
 * Also optional (2026-10-23): FLOW_FEST_CAPTURE_PHRASE_PERFORMER and FLOW_FEST_CAPTURE_PHRASE_MODE
 * keep only one performer's phrases or one mode (planted, turning, travelling), and
 * FLOW_FEST_CAPTURE_PHRASE_KEEP_GOING=1 records a capture that fails its checks in
 * phrase-failures.json and moves on instead of stopping; a failed capture is never written.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeployedCharacters } from "../../Shared/Tools/character-catalog.mjs";
import { createRuntimeMotionBundle, sourceGlbJson } from "../../Shared/Tools/runtime-motion-bundle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The prop each schedule family holds on the stage (fire, per the spec's fire-props rule). */
export const PHRASE_STAGE_PROPS = { staff: "fire_double_staff" };

/** The file name the native stage looks a phrase motion up by. */
export function phraseMotionFile({ characterId, propType, plane, sequenceId }) {
  const key = sha256(Buffer.from(sequenceId, "utf8")).slice(0, 12);
  return `${characterId.replaceAll("-", "_")}_${propType}_${plane}_${key}.motion.json`;
}

/** Distinct captures in schedule order: phrases starting before `maxBeats`, rests included,
 *  optionally only one performer's or one mode's. */
export function phraseCaptureJobs(schedule, maxBeats = Infinity, { performerId, mode } = {}) {
  const jobs = new Map();
  for (const performer of schedule.performers) {
    if (performerId && performer.id !== performerId) continue;
    const propType = PHRASE_STAGE_PROPS[performer.propFamily] ?? performer.propFamily;
    for (const phrase of performer.phrases) {
      if (phrase.startBeat >= maxBeats || (mode && phrase.mode !== mode)) continue;
      const job = { characterId: performer.characterId, propType, plane: phrase.plane,
        sequenceId: phrase.sequenceId, sequenceName: phrase.sequenceName };
      const file = phraseMotionFile(job);
      if (!jobs.has(file)) jobs.set(file, { ...job, file });
    }
  }
  return [...jobs.values()];
}

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
  await writeFile(temporary, typeof value === "string" ? value : JSON.stringify(value));
  await rename(temporary, path);
}

export async function capturePhrases(baseUrl, outputDir) {
  const schedulePath = resolve(process.env.FLOW_FEST_CAPTURE_PHRASE_SCHEDULE);
  const libraryPath = resolve(process.env.FLOW_FEST_CAPTURE_PHRASE_LIBRARY ??
    join(dirname(schedulePath), "phrase-library.json"));
  const beatsArg = process.env.FLOW_FEST_CAPTURE_PHRASE_BEATS;
  const maxBeats = beatsArg === undefined ? Infinity : Number(beatsArg);
  if (!(maxBeats > 0)) throw new Error("FLOW_FEST_CAPTURE_PHRASE_BEATS must be a positive number");
  const scheduleBytes = await readFile(schedulePath);
  const libraryBytes = await readFile(libraryPath);
  const schedule = JSON.parse(scheduleBytes.toString("utf8"));
  const library = JSON.parse(libraryBytes.toString("utf8"));
  if (schedule.version !== "flow-fest-phrase-schedule-v1") throw new Error(`${schedulePath}: not a phrase schedule`);
  if (library.version !== "flow-fest-phrase-library-v1") throw new Error(`${libraryPath}: not a phrase library`);
  if (!(schedule.tempoBpm > 0)) throw new Error("The schedule has no tempo");
  const entries = new Map(library.entries.map((entry) => [entry.id, entry]));
  const secondsPerStep = 60 / schedule.tempoBpm;
  const jobs = phraseCaptureJobs(schedule, maxBeats, { performerId: process.env.FLOW_FEST_CAPTURE_PHRASE_PERFORMER,
    mode: process.env.FLOW_FEST_CAPTURE_PHRASE_MODE });
  const keepGoing = process.env.FLOW_FEST_CAPTURE_PHRASE_KEEP_GOING === "1";
  const failures = [];
  const failuresPath = join(outputDir, "phrase-failures.json");
  for (const job of jobs)
    if (!entries.has(job.sequenceId)) throw new Error(`Sequence ${job.sequenceId} is not in ${libraryPath}`);

  const characters = await loadDeployedCharacters(root);
  const rigs = new Map();
  for (const id of new Set(jobs.map((job) => job.characterId))) {
    const character = characters.find((entry) => entry.id === id);
    if (!character) throw new Error(`Unknown deployed character ${id}`);
    const bytes = await readFile(join(root, character.sourceRelativePath));
    rigs.set(id, { sourceGlb: sourceGlbJson(bytes), sha256: sha256(bytes) });
  }

  await mkdir(outputDir, { recursive: true });
  const manifestPath = join(outputDir, "phrase-manifest.json");
  const receipt = await (await fetch(new URL("/native-capture-build.json", baseUrl))).json();
  const prior = await readJson(manifestPath);
  const done = new Map((prior?.buildId === receipt.id ? prior.entries : []).map((entry) => [entry.file, entry]));
  const manifest = () => ({
    schema: "flow-fest-phrase-motions-v1",
    buildId: receipt.id,
    tempoBpm: schedule.tempoBpm,
    secondsPerStep,
    scheduleSHA256: sha256(scheduleBytes),
    librarySHA256: sha256(libraryBytes),
    maxBeats: Number.isFinite(maxBeats) ? maxBeats : null,
    entries: jobs.filter((job) => done.has(job.file)).map((job) => done.get(job.file)),
  });
  process.stdout.write(`Phrase capture: ${jobs.length} motions (${done.size} already captured) at ${schedule.tempoBpm} BPM\n`);

  const browser = await chromium.launch({
    headless: true, channel: "chrome",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
  });
  const started = Date.now();
  try {
    for (const [index, job] of jobs.entries()) {
      const path = join(outputDir, job.file);
      if (done.has(job.file) && (await readJson(path))) continue;
      const entry = entries.get(job.sequenceId);
      const t0 = Date.now();
      process.stdout.write(`[${index + 1}/${jobs.length}] ${job.characterId} ${job.plane} ${job.sequenceName} (${entry.beats} beats)\n`);
      let capture;
      // Each capture gets its own page lifetime: the production arm pose keeps page state.
      try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
        page.on("pageerror", (error) => process.stderr.write(`Capture page: ${error.message}\n`));
        try {
          await page.goto(new URL("/test/flow-fest-native-export?custom=1", baseUrl).href,
            { waitUntil: "domcontentloaded", timeout: 120_000 });
          await page.waitForFunction(() => window.flowFestNativeCapture?.isReady(), null, { timeout: 120_000 });
          capture = await page.evaluate(([request, phraseEntry, seconds]) =>
            window.flowFestNativeCapture.capturePhrase(request.characterId, phraseEntry,
              request.propType, "fire", request.plane, seconds), [job, entry, secondsPerStep]);
          break;
        } catch (error) {
          if (attempt === 3 || !String(error).includes("Failed to fetch")) throw error;
          process.stderr.write(`Retrying ${job.file} after a transient asset fetch (${attempt}/2)\n`);
        } finally {
          await page.close();
        }
      }
      } catch (error) {
        if (!keepGoing) throw error;
        const message = String(error?.message ?? error).split("\n")[0];
        failures.push({ file: job.file, characterId: job.characterId, plane: job.plane, sequenceName: job.sequenceName,
          seconds: Math.round((Date.now() - t0) / 100) / 10, error: message });
        await writeJsonAtomic(failuresPath, `${JSON.stringify({ failures }, null, 2)}\n`);
        process.stdout.write(`  failed after ${Math.round((Date.now() - t0) / 1000)} s: ${message.slice(0, 160)}\n`);
        continue;
      }
      const rig = rigs.get(job.characterId);
      const bundle = await createRuntimeMotionBundle(capture, { sourceGlb: rig.sourceGlb,
        sourceRigSHA256: rig.sha256, loop: true });
      await writeJsonAtomic(path, `${JSON.stringify(bundle)}\n`);
      done.set(job.file, { ...job, beats: entry.beats, sequenceSHA256: bundle.sequenceSHA256,
        frames: capture.frames.length, captureSeconds: Math.round((Date.now() - t0) / 100) / 10 });
      await writeJsonAtomic(manifestPath, manifest());
      process.stdout.write(`  captured in ${Math.round((Date.now() - t0) / 1000)} s\n`);
    }
  } finally {
    await browser.close();
  }
  await writeJsonAtomic(manifestPath, manifest());
  process.stdout.write(`Captured ${done.size} phrase motions into ${outputDir} in ${Math.round((Date.now() - started) / 1000)} s` +
    (failures.length ? `; ${failures.length} failed (${failuresPath})` : "") + "\n");
}
