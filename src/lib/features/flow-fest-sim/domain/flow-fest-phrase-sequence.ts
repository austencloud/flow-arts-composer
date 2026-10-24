/**
 * Between the phrase library file and the sequence a performer plays.
 *
 * The library stores each sequence the way the public library does (two solo
 * hand tracks and per-step pairings), with empty fields left out so the file
 * stays small: null values, a step `duration` of 1, false reversal flags, and
 * the start pose's placement data. `compactPhraseSequence` does the leaving
 * out; `rebuildPhraseSequence` puts it back and hands the tracks to
 * `deriveSteps`, the owner the app's own loader uses. Both engines rebuild
 * through this function, so they play identical steps.
 */
import { deriveSteps } from "#lib/shared/foundation/services/step-deriver.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  PhraseLibraryEntry,
  PhraseLibrarySequence,
} from "./flow-fest-phrase-library";

type Loose = Record<string, unknown>;

/** The start pose's motion fields a performer reads. */
const START_MOTION_FIELDS = [
  "motionType",
  "rotationDirection",
  "startLocation",
  "endLocation",
  "turns",
  "startOrientation",
  "endOrientation",
] as const;

function withoutEmpty(value: Loose, defaults: Loose = {}): Loose {
  const out: Loose = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === null || v === undefined) continue;
    if (key in defaults && defaults[key] === v) continue;
    out[key] = v;
  }
  return out;
}

/** The library form of a public-library sequence document. */
export function compactPhraseSequence(document: {
  gridMode?: string;
  isCircular?: boolean;
  startPlacement?: unknown;
  leftSoloProp: { steps: unknown[] };
  rightSoloProp: { steps: unknown[] };
  stepPairings: unknown[];
}): PhraseLibrarySequence {
  const start = document.startPlacement as Loose | null | undefined;
  const startMotions = (start?.motions ?? {}) as Record<string, Loose | null>;
  const compactStartMotion = (m: Loose | null | undefined) =>
    m
      ? Object.fromEntries(
          START_MOTION_FIELDS.filter((k) => m[k] !== undefined).map((k) => [
            k,
            m[k],
          ])
        )
      : null;
  return {
    gridMode: document.gridMode ?? "diamond",
    isCircular: Boolean(document.isCircular),
    startPlacement: start
      ? withoutEmpty({
          gridPlacement: start.gridPlacement,
          letter: start.letter,
          startPlacement: start.startPlacement,
          endPlacement: start.endPlacement,
          motions: {
            left: compactStartMotion(startMotions.left),
            right: compactStartMotion(startMotions.right),
          },
        })
      : null,
    leftSoloProp: {
      steps: document.leftSoloProp.steps.map((s) =>
        withoutEmpty(s as Loose, { duration: 1 })
      ),
    },
    rightSoloProp: {
      steps: document.rightSoloProp.steps.map((s) =>
        withoutEmpty(s as Loose, { duration: 1 })
      ),
    },
    stepPairings: document.stepPairings.map((p) =>
      withoutEmpty(p as Loose, { leftReversal: false, rightReversal: false })
    ),
  };
}

function expandSoloSteps(steps: readonly unknown[]): Loose[] {
  return steps.map((s) => ({ duration: 1, ...(s as Loose) }));
}

/** The full sequence a performer plays, rebuilt from one library entry. */
export function rebuildPhraseSequence(
  entry: Pick<PhraseLibraryEntry, "id" | "name" | "word" | "level" | "sequence">
): SequenceData {
  const { sequence } = entry;
  const pairings = sequence.stepPairings.map((p) => ({
    leftReversal: false,
    rightReversal: false,
    ...(p as Loose),
  }));
  const steps = deriveSteps(
    { steps: expandSoloSteps(sequence.leftSoloProp.steps) } as never,
    { steps: expandSoloSteps(sequence.rightSoloProp.steps) } as never,
    pairings as never
  );
  const start = sequence.startPlacement as Loose | null;
  const gridMode = sequence.gridMode;
  const startMotion = (hand: "left" | "right") => {
    const m = (start?.motions as Record<string, Loose | null> | undefined)?.[
      hand
    ];
    return m
      ? createMotionData({
          ...(m as object),
          hand: hand as never,
          propType: PropType.STAFF,
          isVisible: true,
          gridMode: gridMode as never,
          arrowLocation: m.startLocation as never,
        })
      : null;
  };
  return {
    id: entry.id,
    name: entry.name || entry.word || entry.id,
    word: entry.word,
    steps,
    startPlacement: start
      ? ({
          ...start,
          id: `start-${entry.id}`,
          isStartPlacement: true,
          gridMode,
          motions: { left: startMotion("left"), right: startMotion("right") },
        } as unknown as SequenceData["startPlacement"])
      : undefined,
    thumbnails: [],
    isFavorite: false,
    isCircular: sequence.isCircular,
    level: entry.level,
    tags: [],
    metadata: {},
  } as unknown as SequenceData;
}
