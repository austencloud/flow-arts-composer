/**
 * Copy the phrase schedule for the -PhraseStage mode into the Jam workstream's data folder of
 * the shared content store, next to `jam-layout.json`. The brain writes the real schedule to
 * `static/data/flow-fest/phrase-stage-schedule.json`; until that file exists this copies the
 * hand-made fixture in `fixtures/`, which has the same contract and says `"fixture": true`.
 *
 * Fields the native stage does not read yet ride along for later:
 * - `beatPlanes`: each phrase's planes per beat of its sequence, `{ left, right }`, straight
 *   from the brain.
 * - `facingYaw`: the body's facing at the start of each beat of the phrase (schedule yaw, the
 *   same sign as `facingStart`), sampled from the web playback so both stages turn alike. The
 *   last beat eases into the next phrase's first sample.
 *
 * `--out <dir>` writes somewhere else, to check the output without replacing the shared file.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { phraseFacingYaw } from "../../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-playback.ts";
import type { ScheduledPhrase } from "../../../src/lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outFlag = process.argv.indexOf("--out");
const outputDir =
  outFlag >= 0 && process.argv[outFlag + 1]
    ? resolve(process.argv[outFlag + 1]!)
    : resolve(here, "../Content/FlowFest/Assets/Jam/Data");
const brainFile = resolve(here, "../../../static/data/flow-fest/phrase-stage-schedule.json");
const fixtureFile = resolve(here, "fixtures/phrase-stage-schedule.fixture.json");

const exists = (path: string) => access(path).then(() => true, () => false);
const source = (await exists(brainFile)) ? brainFile : fixtureFile;
const schedule = JSON.parse(await readFile(source, "utf8"));
if (schedule.version !== "flow-fest-phrase-schedule-v1") {
  throw new Error(`${source}: expected version flow-fest-phrase-schedule-v1, found ${schedule.version}`);
}
const round = (value: number) => Math.round(value * 1e4) / 1e4;
for (const performer of schedule.performers as Array<{ phrases: ScheduledPhrase[] }>) {
  performer.phrases.forEach((phrase, index, phrases) => {
    // The fixture predates per-beat facing; it keeps its shape.
    if (phrase.facingTarget === undefined) return;
    const from = index === 0 ? phrase.facingStart : phrases[index - 1]!.facingTarget;
    (phrase as ScheduledPhrase & { facingYaw: number[] }).facingYaw = Array.from(
      { length: phrase.beats },
      (_, beat) => round(phraseFacingYaw(phrase, from, beat))
    );
  });
}
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "phrase-stage-schedule.json"), `${JSON.stringify(schedule, null, 2)}\n`);
console.log(
  `Exported the phrase schedule${schedule.fixture ? " (FIXTURE)" : ""}: ${schedule.performers.length} performers, ` +
    `${schedule.lengthBeats} beats at ${schedule.tempoBpm} BPM, from ${source} to ${outputDir}`
);
