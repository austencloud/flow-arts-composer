/**
 * Reproduce the source target delta against the frozen c827a453d3 planner.
 *
 * FLOW_FEST_SEQUENCES_DIR must contain exactly the 82 frozen family snapshots.
 * FLOW_FEST_RIG_SCALARS_JSON must be the 16-rig table reconstructed from frozen
 * native captures. FLOW_FEST_CENSUS_OUTPUT is the output JSON path. Run with:
 * npx vitest run --config tests/manual/3d/front-route-census.manual.config.ts
 *
 * The baseline composes the unchanged stance and hard-beat planners without
 * front-route selection. This is a source-target comparison, not a new native
 * capture or proof of final skeletal IK motion.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { it } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
} from "#lib/shared/3d/collision/stance-yaw-track.js";
import {
  buildHardBeatTrack,
  displaceProp,
  sampleHardBeatTrack,
} from "#lib/shared/3d/collision/hard-beat-displacement.js";
import { resolvePerformerContact } from "#lib/shared/3d/domain/performer-contact-displacement.js";

const BASELINE_REVISION = "c827a453d3";
const FRAME_RATE = 30;
const CHANGE_EPSILON_M = 1e-6;
const RIG_IDS = [
  "ch01",
  "ch07",
  "ch10",
  "ch12",
  "ch18",
  "ch21",
  "ch22",
  "ch24",
  "ch26",
  "ch34",
  "ch41",
  "ch42",
  "ch44",
  "remy",
  "x-bot",
  "y-bot",
] as const;
const FAMILY_IDS = [
  "bigbuugeng",
  "bigchicken",
  "bigclub",
  "bigcontactball",
  "bigdoublecontactball",
  "bigdoublestar",
  "bigeightrings",
  "bigfan",
  "bighoop",
  "bigstaff",
  "bigtorch",
  "bigtriad",
  "buugeng",
  "capsule_baton",
  "chicken",
  "club",
  "contactball",
  "doublecontactball",
  "doublestar",
  "eightrings",
  "fan",
  "fire_double_staff",
  "fractalgeng",
  "guitar",
  "minihoop",
  "pen",
  "poi",
  "quiad",
  "sickles",
  "simple_staff",
  "staff_v2",
  "staff",
  "stick",
  "sword",
  "torch",
  "triad",
  "triangle",
  "trigeng",
  "triquetra",
  "triquetra2",
  "ukulele",
] as const;
const BASELINE_PLANNER_FILES = [
  "src/lib/shared/3d/collision/stance-yaw-track.ts",
  "src/lib/shared/3d/collision/hard-beat-displacement.ts",
  "src/lib/shared/3d/domain/performer-contact-displacement.ts",
  "src/lib/shared/3d/domain/performer-upper-body-stance.ts",
  "src/lib/shared/3d/collision/upper-body-stance-planner.ts",
];

type Rig = {
  character: string;
  upperArmM: number;
  forearmM: number;
  shoulderWidthM: number;
  reachM: number;
  fittedStaffLengthM: number;
  gridScale: number;
  heightM: number;
};

function requiredPath(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return resolve(value);
}

function readHashed(path: string): { text: string; sha256: string } {
  const bytes = readFileSync(path);
  return {
    text: bytes.toString("utf8"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function validPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

it("compares all frozen family roles on all measured rigs", () => {
  // The repair's parent must still contain the exact frozen producer planners.
  // Thus constructing their unmodified branch here is the c827 source target.
  const baselineDiff = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      BASELINE_REVISION,
      "HEAD^",
      "--",
      ...BASELINE_PLANNER_FILES,
    ],
    { encoding: "utf8" }
  ).trim();
  if (baselineDiff)
    throw new Error(`Baseline planner changed before repair: ${baselineDiff}`);
  const sequenceDir = requiredPath("FLOW_FEST_SEQUENCES_DIR");
  const scalarPath = requiredPath("FLOW_FEST_RIG_SCALARS_JSON");
  const outputPath = requiredPath("FLOW_FEST_CENSUS_OUTPUT");
  const scalarInput = readHashed(scalarPath);
  const scalarTable: unknown = JSON.parse(scalarInput.text);
  if (
    !scalarTable ||
    typeof scalarTable !== "object" ||
    !("rigs" in scalarTable) ||
    !Array.isArray(scalarTable.rigs) ||
    scalarTable.rigs.length !== 16
  ) {
    throw new Error("Expected exactly 16 rig scalar entries");
  }
  const rigs = scalarTable.rigs as Rig[];
  for (const rig of rigs) {
    if (
      typeof rig.character !== "string" ||
      !RIG_IDS.includes(rig.character as (typeof RIG_IDS)[number]) ||
      ![
        rig.upperArmM,
        rig.forearmM,
        rig.shoulderWidthM,
        rig.reachM,
        rig.fittedStaffLengthM,
        rig.gridScale,
        rig.heightM,
      ].every(validPositive) ||
      Math.abs(rig.reachM - rig.upperArmM - rig.forearmM) > 1e-5 ||
      rig.gridScale !== 1
    ) {
      throw new Error(`Malformed rig scalar entry: ${rig.character}`);
    }
  }
  if (new Set(rigs.map((rig) => rig.character)).size !== 16) {
    throw new Error("Duplicate rig character IDs");
  }
  const sequenceFiles = readdirSync(sequenceDir)
    .filter((name) => /^family-.+\.sequence\.json$/.test(name))
    .sort();
  const expectedFiles = FAMILY_IDS.flatMap((id) =>
    ["A", "B"].map((variant) => `family-${id}-${variant}.sequence.json`)
  ).sort();
  if (JSON.stringify(sequenceFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Expected exactly ${expectedFiles.length} frozen family snapshots`
    );
  }

  const profiles: Record<string, Record<string, unknown>> = {};
  const hashes: Record<string, string> = {};
  const started = performance.now();
  let coldPlanMs = 0;
  let cachedSampleMs = 0;
  let sampleCount = 0;
  for (const file of sequenceFiles) {
    const input = readHashed(join(sequenceDir, file));
    hashes[file] = input.sha256;
    const sequence: unknown = JSON.parse(input.text);
    if (
      !sequence ||
      typeof sequence !== "object" ||
      !("steps" in sequence) ||
      !Array.isArray(sequence.steps) ||
      sequence.steps.length === 0
    ) {
      throw new Error(`Malformed sequence: ${file}`);
    }
    const source = createCharacterInstanceState(
      { id: `manual-front-route-${file}`, persistent: false },
      makeStandaloneDeps()
    );
    try {
      source.setPlaneMode(PlaneMode.WALL);
      source.loadSequence(
        sequence as Parameters<typeof source.loadSequence>[0]
      );
      const baselineStance = buildStanceYawTrackForSource(
        source,
        PlaneMode.WALL
      );
      if (
        !baselineStance ||
        baselineStance.stepCount !== source.motionStepCount
      ) {
        throw new Error(`Cannot plan sequence: ${file}`);
      }
      const role = file.slice("family-".length, -".sequence.json".length);
      const row: Record<string, unknown> = {};
      profiles[role] = row;
      for (const rig of rigs) {
        source.setCharacter(
          rig.character as Parameters<typeof source.setCharacter>[0]
        );
        const staffLengthM = rig.fittedStaffLengthM * rig.gridScale;
        const measurements = {
          upperArmM: rig.upperArmM,
          forearmM: rig.forearmM,
          shoulderWidthM: rig.shoulderWidthM,
          reachM: rig.reachM,
        };
        const baselineHands = buildHardBeatTrack({
          source,
          stanceTrack: baselineStance,
          heightM: rig.heightM,
          staffLengthM,
          planeMode: PlaneMode.WALL,
        });
        if (!baselineHands)
          throw new Error(`No baseline hands: ${role}/${rig.character}`);
        const planStart = performance.now();
        const selected = resolvePerformerContact(source, {
          heightCm: rig.heightM * 100,
          staffLengthM,
          measurements,
        });
        coldPlanMs += performance.now() - planStart;
        if (!selected.track || !selected.stanceTrack) {
          throw new Error(`No selected plan: ${role}/${rig.character}`);
        }
        let maxTargetDeltaM = 0;
        let maxStanceYawDeltaRad = 0;
        let maxStancePitchDeltaRad = 0;
        let maxCorridorBlendDelta = 0;
        let changedFrames = 0;
        let oldMaxStepM = 0;
        let newMaxStepM = 0;
        let firstOld: Array<{ x: number; y: number; z: number } | null> | null =
          null;
        let firstNew: Array<{ x: number; y: number; z: number } | null> | null =
          null;
        let priorOld: typeof firstOld = null;
        let priorNew: typeof firstNew = null;
        const stepCount = source.motionStepCount;
        const frames = stepCount * FRAME_RATE;
        for (let frame = 0; frame < frames; frame++) {
          const time = frame / FRAME_RATE;
          const props = source.propStatesAtScoreTime(time);
          const sampleStart = performance.now();
          const selectedHands = sampleHardBeatTrack(selected.track, time);
          const selectedStance = resolveTrackedUpperBodyStance(
            selected.stanceTrack,
            time,
            PlaneMode.WALL,
            props.left,
            props.right,
            measurements
          );
          cachedSampleMs += performance.now() - sampleStart;
          sampleCount++;
          const oldHands = sampleHardBeatTrack(baselineHands, time);
          const oldStance = resolveTrackedUpperBodyStance(
            baselineStance,
            time,
            PlaneMode.WALL,
            props.left,
            props.right,
            measurements
          );
          const yawDelta = Math.abs(selectedStance.yawRad - oldStance.yawRad);
          const pitchDelta = Math.abs(
            selectedStance.pitchRad - oldStance.pitchRad
          );
          const blendDelta = Math.abs(
            selectedStance.corridorBlend - oldStance.corridorBlend
          );
          maxStanceYawDeltaRad = Math.max(maxStanceYawDeltaRad, yawDelta);
          maxStancePitchDeltaRad = Math.max(maxStancePitchDeltaRad, pitchDelta);
          maxCorridorBlendDelta = Math.max(maxCorridorBlendDelta, blendDelta);
          const targets = (hands: typeof oldHands, stance: typeof oldStance) =>
            (["left", "right"] as const).map((side) => {
              const prop = displaceProp(props[side], hands[side]);
              if (!prop) return null;
              return {
                x: prop.worldPosition.x,
                y: prop.worldPosition.y,
                z:
                  prop.worldPosition.z +
                  (side === "left"
                    ? stance.leftDepthOffsetM
                    : stance.rightDepthOffsetM),
              };
            });
          const old = targets(oldHands, oldStance);
          const next = targets(selectedHands, selectedStance);
          if (frame === 0) {
            firstOld = old;
            firstNew = next;
          }
          let changed =
            yawDelta > 1e-8 || pitchDelta > 1e-8 || blendDelta > 1e-8;
          for (let side = 0; side < 2; side++) {
            const a = old[side],
              b = next[side];
            if (!a || !b) {
              if (a !== b)
                throw new Error(
                  `Prop presence changed: ${role}/${rig.character}`
                );
              continue;
            }
            const delta = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
            maxTargetDeltaM = Math.max(maxTargetDeltaM, delta);
            changed ||= delta > CHANGE_EPSILON_M;
            if (priorOld?.[side] && priorNew?.[side]) {
              const p = priorOld[side]!,
                q = priorNew[side]!;
              oldMaxStepM = Math.max(
                oldMaxStepM,
                Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z)
              );
              newMaxStepM = Math.max(
                newMaxStepM,
                Math.hypot(b.x - q.x, b.y - q.y, b.z - q.z)
              );
            }
          }
          if (changed) changedFrames++;
          priorOld = old;
          priorNew = next;
        }
        for (let side = 0; side < 2; side++) {
          const a = firstOld?.[side],
            b = firstNew?.[side];
          const p = priorOld?.[side],
            q = priorNew?.[side];
          if (a && p)
            oldMaxStepM = Math.max(
              oldMaxStepM,
              Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z)
            );
          if (b && q)
            newMaxStepM = Math.max(
              newMaxStepM,
              Math.hypot(b.x - q.x, b.y - q.y, b.z - q.z)
            );
        }
        row[rig.character] = {
          events:
            selected.track.frontRouteOverlay?.events.map(
              (event) => event.startStep + event.durationSteps / 2
            ) ?? [],
          changedFrames,
          maxTargetDeltaM,
          maxStanceYawDeltaRad,
          maxStancePitchDeltaRad,
          maxCorridorBlendDelta,
          oldMaxStepM,
          newMaxStepM,
        };
      }
      console.log(
        `front-route census ${Object.keys(profiles).length}/82 ${role}`
      );
    } finally {
      source.destroy();
    }
  }
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const changedMatrix: Record<string, string[]> = {};
  let acceptedEvents = 0;
  for (const [role, row] of Object.entries(profiles)) {
    const rigsChanged: string[] = [];
    for (const [character, value] of Object.entries(row)) {
      const entry = value as { changedFrames: number; events: number[] };
      acceptedEvents += entry.events.length;
      if (entry.changedFrames > 0) rigsChanged.push(character);
    }
    if (rigsChanged.length) changedMatrix[role] = rigsChanged;
  }
  const result = {
    currentRevision: revision,
    baselineRevision: BASELINE_REVISION,
    baselinePlannerFiles: BASELINE_PLANNER_FILES,
    baselinePlannerUnchangedAtRepairParent: true,
    baselineMethod:
      "Same source stance and hard-beat composition with front-route selection disabled",
    frameRate: FRAME_RATE,
    changeEpsilonM: CHANGE_EPSILON_M,
    inputs: {
      sequenceDir,
      sequenceSha256: hashes,
      scalarPath,
      scalarSha256: scalarInput.sha256,
    },
    timings: {
      elapsedMs: performance.now() - started,
      coldPlanMs,
      cachedSampleMeanMs: cachedSampleMs / sampleCount,
      samples: sampleCount,
    },
    summary: {
      changedRoleCount: Object.keys(changedMatrix).length,
      changedProfileCount: Object.values(changedMatrix).reduce(
        (sum, rigsChanged) => sum + rigsChanged.length,
        0
      ),
      acceptedEventsAcrossProfiles: acceptedEvents,
      changedMatrix,
    },
    profiles,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(
    `front-route census: ${Object.keys(changedMatrix).length} changed roles / 82; output ${outputPath}`
  );
});
