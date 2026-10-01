// Apply Austen's approved 2026-10-01 finishing edits to the three Post drafts.
// Build from the repository root:
//   npx esbuild docs/superpowers/specs/tutorial-videos-scripts/apply-final-post-edits.ts --bundle --platform=node --format=esm --alias:$lib=./src/lib --outfile=<scratch>/apply-final-post-edits.mjs
//   node <scratch>/apply-final-post-edits.mjs             # inspect only
//   node <scratch>/apply-final-post-edits.mjs --apply     # append new archives
// Each run reads every archive and picks the greatest project.updatedAt. It
// never edits or deletes an existing archive file.
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  PostProjectSchema,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";

const archiveDir = join(homedir(), ".tka", "post-studio-drafts");
const targets = ["DCKΨ-", "ΩΛ-XJ", "Δ-ΛRZ"] as const;
const prefix = "tka:post-studio:project:v2:";
type Target = (typeof targets)[number];
type Selected = { project: PostProject; file: string };

function latestProjects(): Map<Target, Selected> {
  const selected = new Map<Target, Selected>();
  for (const file of readdirSync(archiveDir).filter((name) =>
    name.endsWith(".json")
  )) {
    const archive = JSON.parse(readFileSync(join(archiveDir, file), "utf8"));
    if (!Array.isArray(archive.records)) continue;
    for (const record of archive.records) {
      const id = targets.find((target) => record.key === `${prefix}${target}`);
      if (!id || typeof record.value !== "string") continue;
      const candidate = PostProjectSchema.safeParse(JSON.parse(record.value));
      if (!candidate.success) continue;
      if (candidate.data.sequenceId !== id) continue;
      if (
        (selected.get(id)?.project.updatedAt ?? -1) < candidate.data.updatedAt
      )
        selected.set(id, { project: candidate.data, file });
    }
  }
  for (const id of targets)
    if (!selected.has(id)) throw new Error(`No valid saved project for ${id}`);
  return selected;
}

function item(project: PostProject, id: string) {
  const match = project.tracks
    .flatMap((track) => track.items)
    .find((i) => i.id === id);
  if (!match) throw new Error(`${project.sequenceId}: missing ${id}`);
  return match;
}

function credit(woods: PostProject, target: PostProject, id: string): void {
  const source = item(woods, "text-1");
  if (
    source.kind !== "text" ||
    source.text !== "Created with\nFlow Arts Composer"
  )
    throw new Error("Woods credit differs from the approved source");
  const card = item(target, "card-1");
  if (card.kind !== "card")
    throw new Error(`${target.sequenceId}: missing card`);
  const existing = target.tracks
    .flatMap((track) => track.items)
    .find((i) => i.id === id);
  if (existing) {
    if (
      existing.kind !== "text" ||
      existing.text !== source.text ||
      existing.start !== card.start + 2 ||
      existing.anchor?.itemId !== card.id ||
      existing.anchor.offset !== 2
    )
      throw new Error(
        `${target.sequenceId}: credit id conflicts with the approved edit`
      );
    return;
  }
  const track = target.tracks.find((track) => track.id === "track-1");
  if (!track) throw new Error(`${target.sequenceId}: missing track-1`);
  track.items.push({
    ...structuredClone(source),
    id,
    start: card.start + 2,
    anchor: { itemId: card.id, offset: 2 },
  });
}

function editDck(project: PostProject): void {
  const run = item(project, "dck-main-1");
  const slow = item(project, "dck-main-2");
  const card = item(project, "card-1");
  if (run.kind !== "video" || slow.kind !== "video" || card.kind !== "card")
    throw new Error("DCK project items have changed kind");
  if (Math.abs(slow.start - 21.411648) < 0.0001 && run.fadeOut === 0) {
    const repeat = item(project, "text-6");
    const encourage = item(project, "text-5");
    if (
      repeat.kind !== "text" ||
      encourage.kind !== "text" ||
      Math.abs(repeat.start - (card.start - 3)) > 0.0001 ||
      Math.abs(encourage.start + encourage.duration - repeat.start) > 0.0001
    )
      throw new Error("DCK final captions conflict with the approved edit");
    return;
  }
  if (Math.abs(slow.start - 22.411648) > 0.0001 || slow.speed !== 0.8)
    throw new Error(
      `DCK slow clip has changed: start=${slow.start}, speed=${slow.speed}`
    );
  if (Math.abs(card.start - 79.2778863333333) > 0.0001)
    throw new Error(`DCK card has moved: ${card.start}`);
  run.fadeOut = 0;
  slow.start -= 1;
  for (const overlay of project.tracks.flatMap((track) => track.items))
    if (overlay.anchor?.itemId === slow.id) overlay.start -= 1;
  const repeat = item(project, "text-6");
  const encourage = item(project, "text-5");
  if (
    repeat.kind !== "text" ||
    repeat.text !== "Now repeat 100x" ||
    encourage.kind !== "text" ||
    encourage.text.trim() !== "You got this!"
  )
    throw new Error("DCK final captions have changed");
  repeat.start = card.start - 3;
  repeat.duration = 3;
  repeat.fadeOut = 0.5;
  repeat.anchor = { itemId: slow.id, offset: repeat.start - slow.start };
  encourage.duration = repeat.start - encourage.start;
  if (encourage.duration <= 0)
    throw new Error("DCK final caption has no duration");
  if (Math.abs(slow.start + slow.duration - card.start) > 0.0001)
    throw new Error("DCK slow clip must end at the card");
}

const selected = latestProjects();
const edited = new Map<Target, PostProject>();
for (const id of targets)
  edited.set(id, structuredClone(selected.get(id)!.project));
const dck = edited.get("DCKΨ-")!;
const omega = edited.get("ΩΛ-XJ")!;
const woods = edited.get("Δ-ΛRZ")!;
editDck(dck);
credit(woods, dck, "credit-final-1");
credit(woods, omega, "credit-final-1");

for (const id of targets) {
  const before = selected.get(id)!;
  const after = PostProjectSchema.parse(edited.get(id)!);
  const changed = JSON.stringify(after) !== JSON.stringify(before.project);
  console.log(
    `${id}: ${before.file}; updatedAt=${before.project.updatedAt}; ${changed ? "changed" : "unchanged"}`
  );
  if (!changed) continue;
  if (!process.argv.includes("--apply")) continue;
  const now = Math.max(Date.now(), before.project.updatedAt + 1);
  after.updatedAt = now;
  const output = `${now}-${randomUUID()}.json`;
  const tmp = join(archiveDir, `.${output}.tmp`);
  const final = join(archiveDir, output);
  try {
    writeFileSync(
      tmp,
      JSON.stringify({
        savedAt: now,
        records: [
          {
            key: `${prefix}${id}`,
            value: JSON.stringify(PostProjectSchema.parse(after)),
          },
        ],
      })
    );
    renameSync(tmp, final);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* No temporary file to remove. */
    }
    throw error;
  }
  console.log(`  wrote ${output}`);
}
