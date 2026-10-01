// Points a saved post's clips at the whole recordings they were cut from,
// keeping every edit where it is, so each clip's edges can be dragged out.
//
// The plan is a JSON array of { takeId, url, takeKey, durationSeconds,
// offsetSeconds }: where the take's old file starts inside the whole recording.
// Build and run from the repository root:
//   npx esbuild docs/superpowers/specs/tutorial-videos-scripts/use-whole-recording.ts \
//     --bundle --platform=node --format=esm --alias:$lib=./src/lib --outfile=<out.mjs>
//   node <out.mjs> <project.json> <plan.json> <out.post-studio.json>
// Import the output through the post's restore action; the import is undoable.
import { readFileSync, writeFileSync } from "node:fs";
import { PostProjectSchema } from "$lib/shared/media-composition/domain/post-project";
import { replaceTakeMedia } from "$lib/shared/media-composition/domain/post-project-edits";

interface PlanEntry {
  takeId: string;
  url: string;
  takeKey: string;
  durationSeconds: number;
  offsetSeconds: number;
}
const [projectPath, planPath, outPath] = process.argv.slice(2);
const before = PostProjectSchema.parse(
  JSON.parse(readFileSync(projectPath!, "utf8"))
);
const plan = JSON.parse(readFileSync(planPath!, "utf8")) as PlanEntry[];
const ctx = { now: Date.now() };
let after = before;
for (const entry of plan) {
  const next = replaceTakeMedia(
    after,
    entry.takeId,
    {
      ref: { kind: "linked", url: entry.url },
      takeKey: entry.takeKey,
      durationSeconds: entry.durationSeconds,
      offsetSeconds: entry.offsetSeconds,
    },
    ctx
  );
  if (next === after) throw new Error(`${entry.takeId} was not replaced`);
  after = next;
}
after = PostProjectSchema.parse(after);
// Nothing on the post may move: every item keeps its start and length.
const spans = (p: typeof before) =>
  p.tracks.flatMap((t) =>
    t.items.map((i) => `${i.id}:${i.start.toFixed(6)}:${i.duration.toFixed(6)}`)
  );
const a = spans(before).join("|"),
  b = spans(after).join("|");
if (a !== b) throw new Error(`items moved\n${a}\n${b}`);
writeFileSync(
  outPath!,
  JSON.stringify({ format: "post-studio-draft-v1", project: after })
);
for (const take of after.takes)
  console.log(
    take.id,
    take.ref.kind === "linked" ? take.ref.url : take.ref.kind,
    take.durationSeconds
  );
for (const item of after.tracks.flatMap((t) => t.items))
  if (item.kind === "video")
    console.log(
      item.id,
      item.takeId,
      item.sourceIn.toFixed(3),
      item.sourceOut.toFixed(3),
      "start",
      item.start.toFixed(3)
    );
for (const [id, t] of Object.entries(after.timings ?? {}))
  console.log(
    "timing",
    id,
    t.takeKey.slice(-24),
    t.sections
      .map(
        (s) =>
          `${s.startSeconds.toFixed(3)}-${s.endSeconds.toFixed(3)} taps ${s.taps.length}`
      )
      .join(", ")
  );
