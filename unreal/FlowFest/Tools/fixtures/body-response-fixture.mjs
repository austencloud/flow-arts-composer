/* global process */
/**
 * body response (2026-10-23): a synthetic `flow-fest-body-response-v1` sidecar for one captured
 * phrase motion, to prove the native stage's -BodyResponse playback before the browser planner
 * exports real tracks. It writes `<motion base>.body.json` beside the motion file (add only: an
 * existing sidecar is left alone unless --force is given).
 *
 * The motion is the stage-left performer's first wall-plane routine in the motion index that the
 * schedule plays in a planted phrase (the stage applies sidecars only while planted) and that is
 * at least 16 steps long (the pattern below spans 16 steps). Its track:
 *   - a slow 0.2 m sway left and right, one cycle every 8 steps;
 *   - step pair 1 (steps 1.30-2.00): left then right foot, 0.35 steps each, 0.07 m lift, 0.1 m
 *     toward the sway;
 *   - a 90 degree body turn over steps 4-6 with step pair 2 (5.30-6.00) re-planting both feet at
 *     the new yaw, back under the hips;
 *   - a 0.15 m duck over steps 6.5-8.5;
 *   - over steps 12-14 the body turns back with step pair 3, so the loop ends where it starts;
 *   - chestYaw: the chest keeps 0.3 rad back against the turn, in proportion to it.
 *
 * Usage (from the repo root):
 *   node unreal/FlowFest/Tools/fixtures/body-response-fixture.mjs [--force] [--file Motions/x.motion.json]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const phraseDir = join(project, "Content/FlowFest/PhraseStage");
const schedulePath = join(
  project,
  "Content/FlowFest/Assets/Jam/Data/phrase-stage-schedule.json"
);
const SAMPLES_PER_STEP = 12;
const PERFORMER = "stage-left";

export function bodyResponseFile(motionFile) {
  return motionFile.replace(/\.motion\.json$|\.json$/, "") + ".body.json";
}

function readIndex() {
  const motions = [];
  for (const name of readdirSync(phraseDir)
    .filter((n) => /^phrase-motions-.*\.json$/.test(n))
    .sort()) {
    const index = JSON.parse(readFileSync(join(phraseDir, name), "utf8"));
    if (index.schema !== "flow-fest-phrase-motion-index-v1")
      throw new Error(`${name} is not a phrase motion index`);
    motions.push(...index.motions);
  }
  return motions;
}

export function pickMotion(motions, schedule) {
  const performer = schedule.performers.find((p) => p.id === PERFORMER);
  if (!performer) throw new Error(`The schedule has no ${PERFORMER} performer`);
  const wall = motions.filter(
    (m) => m.characterId === performer.characterId && m.plane === "wall"
  );
  if (wall.length === 0)
    throw new Error(`No wall-plane motion for ${performer.characterId}`);
  const planted = (m) =>
    m.beats >= 16 &&
    performer.phrases.some(
      (q) =>
        q.mode === "planted" &&
        q.plane === "wall" &&
        q.sequenceId === m.sequenceId
    );
  const pick = wall.find(planted);
  if (!pick)
    throw new Error(
      `${PERFORMER} plays none of its wall routines in a planted phrase`
    );
  for (const m of wall.slice(0, wall.indexOf(pick)))
    console.log(
      `Skipped ${m.sequenceName} (${m.beats} steps): ${m.beats < 16 ? "shorter than the 16-step pattern" : `${PERFORMER} plays it only while turning, where the stage keeps the native footwork`}.`
    );
  const phrases = performer.phrases.filter(
    (q) =>
      q.mode === "planted" &&
      q.sequenceId === pick.sequenceId &&
      q.plane === "wall"
  );
  return { performer, motion: pick, phrases };
}

const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Steps in order; each moves one foot from its last plant to `to` (x, z) at `yaw`. */
const STEPS = [
  { foot: "left", startStep: 1.3, endStep: 1.65, to: [0.1, 0], yaw: 0 },
  { foot: "right", startStep: 1.65, endStep: 2.0, to: [0.1, 0], yaw: 0 },
  { foot: "left", startStep: 5.3, endStep: 5.65, to: [0, 0], yaw: Math.PI / 2 },
  {
    foot: "right",
    startStep: 5.65,
    endStep: 6.0,
    to: [0, 0],
    yaw: Math.PI / 2,
  },
  { foot: "left", startStep: 13.3, endStep: 13.65, to: [0, 0], yaw: 0 },
  { foot: "right", startStep: 13.65, endStep: 14.0, to: [0, 0], yaw: 0 },
];
const LIFT_M = 0.07;
/** Radians the chest keeps back against a full 90 degree turn. */
const CHEST_KEEPS = 0.3;

function bodyYaw(t) {
  if (t < 4) return 0;
  if (t < 6) return (Math.PI / 2) * smooth((t - 4) / 2);
  if (t < 12) return Math.PI / 2;
  if (t < 14) return (Math.PI / 2) * (1 - smooth((t - 12) / 2));
  return 0;
}

function duck(t) {
  return t >= 6.5 && t <= 8.5
    ? -0.15 * Math.sin((Math.PI * (t - 6.5)) / 2) ** 2
    : 0;
}

/** Each foot at score step t: [x, z, lift, yaw]. */
function footAt(foot, t) {
  let at = [0, 0],
    yaw = 0;
  for (const step of STEPS.filter((s) => s.foot === foot)) {
    if (t <= step.startStep) break;
    const a = Math.min(
      1,
      (t - step.startStep) / (step.endStep - step.startStep)
    );
    const s = smooth(a);
    const swinging = a < 1;
    const next = [lerp(at[0], step.to[0], s), lerp(at[1], step.to[1], s)];
    const nextYaw = lerp(yaw, step.yaw, s);
    if (swinging)
      return [next[0], next[1], LIFT_M * Math.sin(Math.PI * a), nextYaw];
    at = step.to;
    yaw = step.yaw;
  }
  return [at[0], at[1], 0, yaw];
}

export function buildFixture(stepCount) {
  if (!(stepCount >= 16))
    throw new Error(
      `The fixture needs a routine of at least 16 steps (got ${stepCount})`
    );
  const offset = [],
    left = [],
    right = [],
    chestYaw = [];
  const round = (v) => Math.round(v * 1e5) / 1e5;
  for (let i = 0; i < stepCount * SAMPLES_PER_STEP; i++) {
    const t = i / SAMPLES_PER_STEP;
    // Two-step pattern: the turn and its return sit in the first 16 steps; longer routines rest.
    const local = t < 16 ? t : 16;
    offset.push(
      [
        0.2 * Math.sin((2 * Math.PI * t) / 8),
        duck(local),
        0,
        bodyYaw(local),
      ].map(round)
    );
    left.push(footAt("left", local).map(round));
    right.push(footAt("right", local).map(round));
    chestYaw.push(round(-CHEST_KEEPS * (bodyYaw(local) / (Math.PI / 2))));
  }
  let from = { left: [0, 0, 0], right: [0, 0, 0] };
  const steps = STEPS.map((s) => {
    const prev = from[s.foot];
    from = { ...from, [s.foot]: [...s.to, s.yaw] };
    return {
      foot: s.foot,
      startStep: s.startStep,
      endStep: s.endStep,
      from: prev.slice(0, 2),
      to: s.to,
      yawFrom: prev[2],
      yawTo: s.yaw,
      liftM: LIFT_M,
    };
  });
  return {
    version: "flow-fest-body-response-v1",
    stepCount,
    samplesPerStep: SAMPLES_PER_STEP,
    loop: true,
    frame: "performer: +x left, +z audience, y up, metres",
    fixture:
      "Tools/fixtures/body-response-fixture.mjs: 0.2 m sway, three step pairs, 90 degree turn, 0.15 m duck, 0.3 rad chest twist",
    offset,
    feet: { left, right },
    chestYaw,
    steps,
  };
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const fileArg =
    args.indexOf("--file") >= 0 ? args[args.indexOf("--file") + 1] : null;
  const motions = readIndex();
  const schedule = JSON.parse(readFileSync(schedulePath, "utf8"));
  const { motion, phrases } = fileArg
    ? { motion: motions.find((m) => m.file === fileArg), phrases: [] }
    : pickMotion(motions, schedule);
  if (!motion) throw new Error(`${fileArg} is not in the motion index`);
  const target = join(phraseDir, bodyResponseFile(motion.file));
  if (existsSync(target) && !force) {
    console.log(`Kept the existing ${target} (pass --force to rewrite it)`);
    return;
  }
  writeFileSync(target, JSON.stringify(buildFixture(motion.beats)) + "\n");
  console.log(`Wrote ${target}`);
  console.log(
    `  ${motion.characterId} ${motion.plane} ${motion.sequenceName}: ${motion.beats} steps x ${SAMPLES_PER_STEP} samples`
  );
  for (const q of phrases)
    console.log(
      `  planted at beat ${q.startBeat} for ${q.beats} beats (launch with -StartBeat ${Math.max(0, q.startBeat - 1)})`
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
