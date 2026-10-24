/**
 * body response (2026-10-23): the export job behind export-body-response.ts. It runs inside
 * Vitest with the project's config, because the planner and the character state are Svelte rune
 * modules that tsx cannot load (tests/unit/3d/body-clearance.test.ts builds its sources the same
 * way). Flags arrive as BODY_RESPONSE_FORCE=1 and BODY_RESPONSE_DRY_RUN=1.
 *
 * The Motions folder sits in the shared content store: add only. An existing sidecar with other
 * bytes is kept unless forced (the fixture's sidecar is one; rerun with --force once the
 * planner lands to replace it with the planned track).
 */
import { it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Plane, PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { buildStanceYawTrackForSource } from "#lib/shared/3d/collision/stance-yaw-track.js";
import {
  buildHardBeatTrack,
  HARD_BEAT_SAMPLES_PER_STEP,
} from "#lib/shared/3d/collision/hard-beat-displacement.js";
import { rebuildPhraseSequence } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-sequence.js";
import type { PhraseLibraryEntry } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const phraseDir = resolve(here, "../Content/FlowFest/PhraseStage");
const libraryPath = join(repo, "static/data/flow-fest/phrase-library.json");
const HEIGHT_M = 1.905;
/** The stage's fire staff (fire_double_staff), as captured. */
const STAFF_LENGTH_M = 0.9;

/** What the planner returns (spec "Planner"); arrays sampled at HARD_BEAT_SAMPLES_PER_STEP per step.
 *  The optional fields fall back to the hard-beat sampling, the sequence length and a loop. */
interface BodyResponseTrack {
  stepCount?: number;
  samplesPerStep?: number;
  loop?: boolean;
  offsetX: ArrayLike<number>;
  offsetY: ArrayLike<number>;
  offsetZ: ArrayLike<number>;
  yaw?: ArrayLike<number>;
  feet: Record<
    "left" | "right",
    {
      x: ArrayLike<number>;
      z: ArrayLike<number>;
      lift: ArrayLike<number>;
      yaw?: ArrayLike<number>;
    }
  >;
  steps: {
    foot: "left" | "right";
    startStep: number;
    endStep: number;
    from: { x: number; z: number };
    to: { x: number; z: number };
    yawFrom: number;
    yawTo: number;
    liftM: number;
  }[];
}
type BuildBodyResponseTrack = (
  options: Record<string, unknown>
) => BodyResponseTrack | null;

// TODO(body-response): the planner lands on main from the planner lane; until then this import
// fails and the script says so. Check the field names above against its BodyResponseTrack.
async function loadPlanner(): Promise<BuildBodyResponseTrack> {
  try {
    const module =
      (await import("#lib/shared/3d/collision/body-response.js")) as {
        buildBodyResponseTrack?: BuildBodyResponseTrack;
      };
    if (typeof module.buildBodyResponseTrack !== "function")
      throw new Error("it has no buildBodyResponseTrack export");
    return module.buildBodyResponseTrack;
  } catch (error) {
    throw new Error(
      `The body response planner (src/lib/shared/3d/collision/body-response.ts) is not available: ${(error as Error).message}. ` +
        "Merge the planner lane first; nothing was written."
    );
  }
}

function bodyResponseFile(motionFile: string): string {
  return motionFile.replace(/\.motion\.json$|\.json$/, "") + ".body.json";
}

interface MotionEntry {
  characterId: string;
  propType: string;
  plane: string;
  sequenceId: string;
  sequenceName: string;
  file: string;
  beats: number;
}

function readIndex(): MotionEntry[] {
  const motions: MotionEntry[] = [];
  for (const name of readdirSync(phraseDir)
    .filter((n) => /^phrase-motions-.*\.json$/.test(n))
    .sort()) {
    const index = JSON.parse(readFileSync(join(phraseDir, name), "utf8"));
    if (index.schema !== "flow-fest-phrase-motion-index-v1")
      throw new Error(`${name} is not a phrase motion index`);
    for (const m of index.motions as MotionEntry[])
      if (!motions.some((e) => e.file === m.file)) motions.push(m);
  }
  return motions;
}

/** The capture's plane names: wall and wheel are the two-hand presets; floor sets both hands. */
function setPlane(
  source: ReturnType<typeof createCharacterInstanceState>,
  plane: string
): PlaneMode {
  if (plane === "wall") source.setPlaneMode(PlaneMode.WALL);
  else if (plane === "wheel") source.setPlaneMode(PlaneMode.DUAL_WHEEL);
  else if (plane === "floor") {
    source.setHandPlane("left", Plane.FLOOR);
    source.setHandPlane("right", Plane.FLOOR);
  } else throw new Error(`Unknown phrase plane '${plane}'`);
  return source.planeMode as PlaneMode;
}

const rows = <T>(n: number, row: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => row(i));
const round = (v: number) => Math.round(v * 1e5) / 1e5;

function toSidecar(track: BodyResponseTrack, sequenceSteps: number) {
  const n = track.offsetX.length;
  const stepCount = track.stepCount ?? sequenceSteps;
  const samplesPerStep = track.samplesPerStep ?? HARD_BEAT_SAMPLES_PER_STEP;
  const loop = track.loop ?? true;
  const expected = stepCount * samplesPerStep + (loop ? 0 : 1);
  if (n !== expected)
    throw new Error(`The planner returned ${n} samples, expected ${expected}`);
  const at = (values: ArrayLike<number> | undefined, i: number) =>
    values?.[i] ?? 0;
  const foot = (side: "left" | "right") => {
    const f = track.feet[side];
    return rows(n, (i) => [f.x[i], f.z[i], f.lift[i], at(f.yaw, i)].map(round));
  };
  return {
    version: "flow-fest-body-response-v1",
    stepCount,
    samplesPerStep,
    loop,
    frame: "performer: +x left, +z audience, y up, metres",
    offset: rows(n, (i) =>
      [
        track.offsetX[i],
        track.offsetY[i],
        track.offsetZ[i],
        at(track.yaw, i),
      ].map(round)
    ),
    feet: { left: foot("left"), right: foot("right") },
    steps: track.steps.map((s) => ({
      foot: s.foot,
      startStep: s.startStep,
      endStep: s.endStep,
      from: [s.from.x, s.from.z],
      to: [s.to.x, s.to.z],
      yawFrom: s.yawFrom,
      yawTo: s.yawTo,
      liftM: s.liftM,
    })),
  };
}

it("exports a body response sidecar for every captured phrase routine", async () => {
  const force = process.env.BODY_RESPONSE_FORCE === "1";
  const dryRun = process.env.BODY_RESPONSE_DRY_RUN === "1";
  const buildBodyResponseTrack = await loadPlanner();
  const library = JSON.parse(readFileSync(libraryPath, "utf8"));
  if (library.version !== "flow-fest-phrase-library-v1")
    throw new Error(`${libraryPath}: not a phrase library`);
  const entries = new Map<string, PhraseLibraryEntry>(
    library.entries.map((e: PhraseLibraryEntry) => [e.id, e])
  );
  let written = 0,
    kept = 0;
  for (const motion of readIndex()) {
    const entry = entries.get(motion.sequenceId);
    if (!entry)
      throw new Error(
        `Sequence ${motion.sequenceId} (${motion.file}) is not in ${libraryPath}`
      );
    const sequence = rebuildPhraseSequence(entry);
    const source = createCharacterInstanceState(
      { id: `body-response-${motion.file}`, persistent: false },
      makeStandaloneDeps()
    );
    const planeMode = setPlane(source, motion.plane);
    source.loadSequence(sequence);
    const stanceTrack = buildStanceYawTrackForSource(source, planeMode);
    const hardBeatTrack = buildHardBeatTrack({
      source,
      stanceTrack,
      heightM: HEIGHT_M,
    });
    const track = buildBodyResponseTrack({
      source,
      stanceTrack,
      hardBeatTrack,
      heightM: HEIGHT_M,
      staffLengthM: STAFF_LENGTH_M,
      planeMode,
    });
    if (!track) {
      console.log(`  ${motion.file}: the planner returned no track; skipped`);
      continue;
    }
    const text = `${JSON.stringify(toSidecar(track, sequence.steps.length))}\n`;
    const target = join(phraseDir, bodyResponseFile(motion.file));
    if (existsSync(target) && readFileSync(target, "utf8") !== text && !force) {
      kept++;
      console.log(
        `  ${motion.file}: kept the existing sidecar (--force replaces it)`
      );
      continue;
    }
    if (!dryRun) writeFileSync(target, text);
    written++;
    console.log(
      `  ${motion.characterId} ${motion.plane} ${motion.sequenceName}: ${track.steps.length} steps planned`
    );
  }
  console.log(
    `${dryRun ? "Would write" : "Wrote"} ${written} body response sidecars to ${join(phraseDir, "Motions")}${kept ? `, kept ${kept}` : ""}`
  );
}, 600_000);
