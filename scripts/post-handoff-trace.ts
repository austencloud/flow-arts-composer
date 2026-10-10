/**
 * Replays a saved post's animation-to-square hand-off frame by frame through
 * the same compiler and frame evaluator the editor and export use, and
 * reports what each layer does: where the figure is (in beats), how fast it
 * moves, the box, the fade and the look.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/post-handoff-trace.ts --sequence "DCKΨ-"
 *
 * Options: --file draft.json (else the newest saved copy of --sequence in
 * ~/.tka/post-studio-drafts), --fps 60, --before 1.5, --after 5,
 * --out trace.json (every frame, for charts).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  PostProjectSchema,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";
import { compilePostProject } from "#lib/shared/media-composition/domain/post-project-compiler.js";
import { takeRole } from "#lib/shared/media-composition/domain/post-plan-compiler.js";
import {
  PIP_HANDOFF_MAX_CLOCK_SECONDS,
  pipHandoffOf,
  type PipHandoffStep,
} from "#lib/shared/media-composition/domain/pip-handoff.js";
import {
  resolveTakeTiming,
  takeSampleAt,
  takeTimingMoveBeats,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import {
  evaluatePresetLayers,
  type TakeClock,
} from "#lib/shared/media-composition/services/frame-evaluator.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};

function newestDraft(sequenceId: string): PostProject {
  const directory = join(homedir(), ".tka", "post-studio-drafts");
  let best: PostProject | null = null;
  for (const file of readdirSync(directory)) {
    if (!file.endsWith(".json")) continue;
    let saved: { records?: unknown };
    try {
      saved = JSON.parse(readFileSync(join(directory, file), "utf8"));
    } catch {
      continue;
    }
    const records = Array.isArray(saved.records)
      ? saved.records
      : Object.values(saved.records ?? {});
    for (const record of records as { value?: unknown }[]) {
      let value = record?.value;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          continue;
        }
      }
      const parsed = PostProjectSchema.safeParse(value);
      if (
        parsed.success &&
        parsed.data.sequenceId === sequenceId &&
        (!best || parsed.data.updatedAt > best.updatedAt)
      )
        best = parsed.data;
    }
  }
  if (!best) throw new Error(`No saved post for ${sequenceId}.`);
  return best;
}

const project = normalizeProject(
  option("file")
    ? PostProjectSchema.parse(JSON.parse(readFileSync(option("file")!, "utf8")))
    : newestDraft(option("sequence") ?? "")
);
const timings = Object.entries(project.timings ?? {}) as [string, TakeTiming][];
const moveBeats = timings
  .map(([, timing]) => takeTimingMoveBeats(timing))
  .find((beats) => beats !== null);
if (!moveBeats) throw new Error("No take timing says how long the moves are.");
const clocks: Record<string, TakeClock> = {};
for (const [takeId, timing] of timings) {
  const resolved = resolveTakeTiming(timing, moveBeats);
  clocks[takeRole(takeId)] = {
    sampleAt: (media, options) => takeSampleAt(resolved, media, options),
  };
}
const handoff = pipHandoffOf(project);
if (!handoff) throw new Error("This post has no animation-to-square hand-off.");
const compiled = compilePostProject(project, { now: project.updatedAt });
if (!compiled) throw new Error("The post does not compile.");

const fps = Number(option("fps") ?? 60);
const from = handoff.start - Number(option("before") ?? 1.5);
const to =
  handoff.end + Number(option("after") ?? PIP_HANDOFF_MAX_CLOCK_SECONDS + 1);
type Step = PipHandoffStep & { role: "from" | "to"; postSeconds: number };
const steps: Step[] = [];
const alignment = {
  steps: moveBeats.map((duration) => ({ duration })) as unknown as StepData[],
  startPlacementDuration: 1,
  sequencePeriod: 1,
  clocks,
  explainHandoff: (step: Step) => steps.push(step),
};

/** A layer's part of one frame. */
interface Row {
  t: number;
  clip: string;
  region: string;
  opacity: number;
  arrival: number | null;
  move: number | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  lookBlend: number | null;
}
const rows: Row[] = [];
for (let frame = 0; from + frame / fps <= to + 1e-9; frame += 1) {
  const t = from + frame / fps;
  for (const layer of evaluatePresetLayers(
    compiled.preset,
    compiled.durationSeconds,
    t,
    alignment
  ))
    rows.push({
      t,
      clip: layer.clipId,
      region: layer.regionId,
      opacity: layer.opacity,
      arrival: layer.sequenceFrame?.arrival ?? null,
      move: layer.displayedBeatNumber ?? null,
      rect: layer.regionRect
        ? {
            x: layer.regionRect.x,
            y: layer.regionRect.y,
            width: layer.regionRect.width,
            height: layer.regionRect.height,
          }
        : null,
      lookBlend: layer.lookBlend ?? null,
    });
}

// Each clip's frames in order, with its pace in beats a second.
const byClip = new Map<string, Row[]>();
for (const row of rows) {
  if (!byClip.has(row.clip)) byClip.set(row.clip, []);
  byClip.get(row.clip)!.push(row);
}
const pace = (list: Row[], index: number): number | null => {
  const here = list[index]!;
  const next = list[index + 1];
  if (!next || here.arrival === null || next.arrival === null) return null;
  if (Math.abs(next.t - here.t - 1 / fps) > 1e-6) return null;
  return (next.arrival - here.arrival) * fps;
};

const name = (id: string) =>
  id.startsWith(handoff.animation.id)
    ? `animation ${id.slice(handoff.animation.id.length) || ""}`.trim()
    : id.startsWith(handoff.moves.id)
      ? `square ${id.slice(handoff.moves.id.length) || ""}`.trim()
      : id;

console.log(
  `${project.sequenceId}: overlap ${handoff.start.toFixed(3)}-${handoff.end.toFixed(3)} s, ${handoff.shared ? "one shared surface" : "two surfaces"}, ${fps} fps`
);

// What each clip does across the window.
for (const [clip, list] of byClip) {
  if (list.every((row) => row.arrival === null)) continue;
  const paces = list.map((_, index) => pace(list, index));
  const jolts: string[] = [];
  for (let index = 1; index < list.length - 1; index += 1) {
    const before = paces[index - 1];
    const now = paces[index];
    if (
      before === null ||
      before === undefined ||
      now === null ||
      now === undefined
    )
      continue;
    const change = now - before;
    // A pace change bigger than a tenth of the pace in one frame is a jolt.
    if (Math.abs(change) > Math.max(0.15, 0.1 * Math.abs(before)))
      jolts.push(
        `${list[index]!.t.toFixed(3)}s ${before.toFixed(2)}→${now.toFixed(2)}`
      );
  }
  const backwards = list.filter(
    (row, index) =>
      index > 0 &&
      row.arrival !== null &&
      list[index - 1]!.arrival !== null &&
      row.arrival < list[index - 1]!.arrival! - 1e-6 &&
      Math.abs(row.t - list[index - 1]!.t - 1 / fps) < 1e-6
  );
  console.log(
    `\n${name(clip)} (${clip})  ${list[0]!.t.toFixed(2)}-${list.at(-1)!.t.toFixed(2)} s` +
      `\n  pace jolts (beats/s, one frame): ${jolts.length ? jolts.slice(0, 12).join(", ") + (jolts.length > 12 ? ` …+${jolts.length - 12}` : "") : "none"}` +
      `\n  steps backwards: ${backwards.length ? backwards.map((row) => row.t.toFixed(3)).join(", ") : "none"}`
  );
}

// Which way the hand-off clock went, one line per stretch on each side.
const fixed = (value: number | null | undefined, digits = 3) =>
  value === null || value === undefined ? "-" : value.toFixed(digits);
for (const role of ["from", "to"] as const) {
  const mine = steps.filter((step) => step.role === role);
  if (mine.length === 0) continue;
  console.log(`
hand-off clock, ${role === "from" ? "animation" : "square"} side:`);
  const landing = mine[0]!.landing;
  console.log(
    `  landing on the opening pose: ${landing ? `${fixed(landing.at)} s at beat ${fixed(landing.arrival)}, ${fixed(landing.rate, 2)} beats/s` : "none in the overlap"}`
  );
  let open = 0;
  for (let index = 1; index <= mine.length; index += 1) {
    const step = mine[index];
    if (step && step.branch === mine[open]!.branch) continue;
    const first = mine[open]!;
    const last = mine[index - 1]!;
    console.log(
      `  ${fixed(first.postSeconds)}-${fixed(last.postSeconds)} s  ${first.branch.padEnd(24)} animation clock ${fixed(first.from)}→${fixed(last.from)}  square clock ${fixed(first.to)}→${fixed(last.to)}` +
        (first.seconds !== undefined
          ? `  pivot ${fixed(first.pivot)} pose ${fixed(first.pose)} ${fixed(first.rate, 2)}→${fixed(first.targetRate, 2)} beats/s over ${fixed(first.seconds, 2)} s, gap ${fixed(first.gap)}`
          : first.gap !== undefined
            ? `  pose ${fixed(first.pose)} held as ${fixed(first.start)}, gap ${fixed(first.gap)}`
            : "")
    );
    open = index;
  }
}

// A table every tenth of a second of the hand-off's own layers and the footage.
const tracked = [...byClip.keys()].filter(
  (clip) =>
    clip.startsWith(handoff.animation.id) ||
    clip.startsWith(handoff.moves.id) ||
    byClip.get(clip)!.some((row) => row.arrival !== null && row.rect === null)
);
const every = Math.max(1, Math.round(fps / 10));
console.log(
  "\n   t      layer                 opacity  beat     pace   box w   look"
);
for (let frame = 0; from + frame / fps <= to + 1e-9; frame += every) {
  const t = from + frame / fps;
  const mark =
    Math.abs(t - handoff.start) < 0.5 / fps
      ? "  ← overlap starts"
      : Math.abs(t - handoff.end) < 0.5 / fps
        ? "  ← overlap ends"
        : "";
  let first = true;
  for (const clip of tracked) {
    const list = byClip.get(clip)!;
    const index = list.findIndex((row) => Math.abs(row.t - t) < 0.5 / fps);
    if (index < 0) continue;
    const row = list[index]!;
    const rate = pace(list, index);
    console.log(
      `${first ? t.toFixed(2).padStart(6) : "      "}  ${name(clip).padEnd(20).slice(0, 20)}  ${row.opacity.toFixed(2).padStart(6)}  ${row.arrival === null ? "   -   " : row.arrival.toFixed(3).padStart(7)}  ${rate === null ? "   -  " : rate.toFixed(2).padStart(6)}  ${row.rect ? row.rect.width.toFixed(3) : "  -  "}  ${row.lookBlend === null ? " -" : row.lookBlend.toFixed(2)}${first ? mark : ""}`
    );
    first = false;
  }
}

if (option("out")) {
  writeFileSync(
    option("out")!,
    JSON.stringify(
      {
        sequenceId: project.sequenceId,
        fps,
        handoff: {
          start: handoff.start,
          end: handoff.end,
          shared: handoff.shared,
          animationId: handoff.animation.id,
          movesId: handoff.moves.id,
        },
        rows,
      },
      null,
      1
    )
  );
  console.log(`\nWrote ${rows.length} layer frames to ${option("out")}.`);
}
