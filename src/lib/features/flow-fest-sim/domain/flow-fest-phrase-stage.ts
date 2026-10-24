/**
 * The staff test stage's cast: two spinners side by side with the same prop
 * and different personalities. Stage left is a planted techer, stage right a
 * wanderer. The audience is to the south (+z), so both face yaw pi/2, as the
 * spec's example does. The ids name the sides as the audience sees them:
 * stage-left is on the left of the audience's view (-x).
 *
 * The schedule tool and the browser stage both build from these, so the file
 * on disk and the page agree for the default settings.
 */
import {
  buildPhraseSchedule,
  DEFAULT_PHRASE_BRAIN_SETTINGS,
  type PhraseBrainEntry,
  type PhraseBrainSettings,
  type PhrasePerformerSpec,
  type PhraseScheduleFile,
} from "./flow-fest-phrase-brain";

/** The app's animation default (`AnimationControlsPanel`'s `DEFAULT_BPM`): one step a second. */
export const PHRASE_STAGE_TEMPO_BPM = 60;
export const PHRASE_STAGE_LENGTH_BEATS = 512;
/** Facing the audience, to the south. */
export const PHRASE_STAGE_OUTWARD_YAW = Math.PI / 2;

export const PHRASE_STAGE_PERFORMERS: readonly PhrasePerformerSpec[] = [
  {
    id: "stage-left",
    seed: 11,
    characterId: "ch07",
    propFamily: "staff",
    personality: { skill: 0.9, style: 0.15, energy: 0.6 },
    home: { x: -2.25, z: 0 },
    // Room from home for the shortest walk (three 0.56 m steps, kept 0.25 m
    // inside the edge), and little more.
    areaRadius: 2,
    outwardYaw: PHRASE_STAGE_OUTWARD_YAW,
  },
  {
    id: "stage-right",
    seed: 23,
    characterId: "ch21",
    propFamily: "staff",
    personality: { skill: 0.55, style: 0.85, energy: 0.75 },
    // A wanderer needs room for two or three walks in a row along one
    // facing: every walk is at least three 0.55 m steps.
    home: { x: 3, z: 0 },
    areaRadius: 3,
    outwardYaw: PHRASE_STAGE_OUTWARD_YAW,
  },
];

export function buildPhraseStageSchedule(
  library: readonly PhraseBrainEntry[],
  options: {
    performers?: readonly PhrasePerformerSpec[];
    tempoBpm?: number;
    lengthBeats?: number;
    settings?: PhraseBrainSettings;
  } = {}
): PhraseScheduleFile {
  return buildPhraseSchedule(options.performers ?? PHRASE_STAGE_PERFORMERS, {
    tempoBpm: options.tempoBpm ?? PHRASE_STAGE_TEMPO_BPM,
    lengthBeats: options.lengthBeats ?? PHRASE_STAGE_LENGTH_BEATS,
    library,
    settings: options.settings ?? DEFAULT_PHRASE_BRAIN_SETTINGS,
  });
}
