/**
 * Write the staff test stage's phrase schedule, the file both engines play.
 *
 *   node --import tsx scripts/flow-fest/build-phrase-stage-schedule.ts
 *
 * Runs the phrase brain for the stage's two performers at their fixed seeds,
 * with the default settings, over the phrase library snapshot. Contract:
 * docs/superpowers/specs/active/2026-10-22-flow-fest-phrase-brain.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isClosedLoop,
  phraseJoins,
  PHRASE_PLANES,
  type PhraseLibrary,
  type PhrasePlane,
} from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";
import { planeShareTargets } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.js";
import { buildPhraseStageSchedule } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-stage.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const libraryPath = "static/data/flow-fest/phrase-library.json";
const outputPath = "static/data/flow-fest/phrase-stage-schedule.json";

const library = JSON.parse(
  readFileSync(resolve(root, libraryPath), "utf8")
) as PhraseLibrary;
const schedule = buildPhraseStageSchedule(library.entries);
writeFileSync(
  resolve(root, outputPath),
  `${JSON.stringify(schedule, null, 2)}\n`
);

// The mix, so a regenerated file can be checked by eye: the plane shares per
// staff over the beats played, how long a staff holds a plane, where the body
// faces, and how many picks are sequences that do not end where they start.
const closed = new Map(
  library.entries.map((e) => [e.id, isClosedLoop(phraseJoins(e.sequence))])
);
const percent = (n: number, of: number) =>
  `${Math.round((n / of) * 1000) / 10}%`;
const degrees = (yaw: number) => Math.round((yaw * 180) / Math.PI);
console.log(
  `Library: ${library.entries.length} sequences, all eligible; ${[...closed.values()].filter((c) => !c).length} do not end where they start (played once, never repeated)`
);
for (const performer of schedule.performers) {
  const beats = { planted: 0, turning: 0, travelling: 0, rest: 0 };
  const share = {
    left: { wall: 0, wheel: 0, floor: 0 },
    right: { wall: 0, wheel: 0, floor: 0 },
  };
  const line: Record<"left" | "right", PhrasePlane[]> = { left: [], right: [] };
  let played = 0;
  let differ = 0;
  let picks = 0;
  let open = 0;
  for (const phrase of performer.phrases) {
    if (phrase.rest) beats.rest += phrase.beats;
    else beats[phrase.mode] += phrase.beats;
    if (phrase.rest) continue;
    picks++;
    if (!closed.get(phrase.sequenceId)) open++;
    for (let r = 0; r < phrase.repeats; r++)
      for (const planes of phrase.beatPlanes) {
        played++;
        if (planes.left !== planes.right) differ++;
        for (const hand of ["left", "right"] as const) {
          share[hand][planes[hand]]++;
          line[hand].push(planes[hand]);
        }
      }
  }
  const runs: Record<string, number> = {};
  for (const hand of ["left", "right"] as const) {
    let n = 1;
    for (let i = 1; i <= line[hand].length; i++) {
      if (i < line[hand].length && line[hand][i] === line[hand][i - 1]) n++;
      else {
        const key = n > 8 ? "9+" : String(n);
        runs[key] = (runs[key] ?? 0) + 1;
        n = 1;
      }
    }
  }
  const targets = planeShareTargets(performer.personality.style);
  const shares = (hand: "left" | "right") =>
    PHRASE_PLANES.map((p) => `${p} ${percent(share[hand][p], played)}`).join(
      ", "
    );
  console.log(
    `${performer.id}: ${performer.phrases.length} phrases, beats ${JSON.stringify(beats)}`
  );
  console.log(
    `  targets ${PHRASE_PLANES.map((p) => `${p} ${percent(targets[p], 1)}`).join(", ")}`
  );
  console.log(`  left staff  ${shares("left")}`);
  console.log(`  right staff ${shares("right")}`);
  console.log(
    `  staffs in different planes on ${percent(differ, played)} of beats`
  );
  console.log(
    `  plane runs (beats: count, both staffs, across phrases) ${JSON.stringify(runs)}`
  );
  console.log(
    `  facing targets (deg) ${performer.phrases
      .filter((p) => !p.rest)
      .map((p) => degrees(p.facingTarget))
      .join(" ")}`
  );
  console.log(
    `  picks that do not end where they start: ${open} of ${picks} (${percent(open, picks)})`
  );
}
console.log(`Wrote ${outputPath}`);
