/**
 * Three ways to name a pattern, the Guide's shared record: Gage DeMello's
 * Eight Step code (the name), the TKA word (the letters), and a VTG reading
 * of every beat. The /guide/three-levels page reads from here.
 *
 * Every reading is derived from the transcribed sequences in
 * docs/research/spiroanim/eightstep-72-sequences.json; nothing per pattern is
 * hand-written. Timing and direction come from TKA's letter canon
 * (TYPE1_ROTATION), never from the transcription's per-beat `timing` field,
 * which disagrees with the canon for D, E, F, J, K and L (see the research
 * README). Ratios come from ratioLabel, the conversion /guide/ratios uses.
 *
 * Spec: docs/superpowers/specs/2026-10-14-three-levels-guide-page-design.md
 */
import { TYPE1_ROTATION } from "@tka/domain";
import { ratioLabel } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  type MotionType,
  type Orientation,
  type RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  type GridLocation,
  type GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";

/** One hand's motion as the transcription stores it. */
export interface EightStepMotion {
  hand: string;
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  turns: number;
  startOrientation: string;
  endOrientation: string;
}

/** One record of eightstep-72-sequences.json. */
export interface EightStepRecord {
  word: string;
  metadata: { cell: string; attribution?: string };
  startPlacement: {
    gridPlacement: string;
    motions: { left: EightStepMotion; right: EightStepMotion };
  };
  steps: readonly {
    stepNumber: number;
    letter: string;
    startPlacement: string;
    endPlacement: string;
    motions: { left: EightStepMotion; right: EightStepMotion };
  }[];
}

/** The picker's patterns: one per hand relationship, both cell lengths. */
export const THREE_LEVELS_PATTERNS = [
  "1-AA",
  "3-AI",
  "5-EI",
  "7-IA",
  "2-EA",
  "4-AA",
] as const;

/** Two codes that spell the same word and differ only in turns. */
export const THREE_LEVELS_SAME_WORD_PAIR = ["1-AE", "1-AI"] as const;

/** Gage's chart as SpiroAnim documents it; the credit links here. */
export const EIGHT_STEP_SOURCE_HREF =
  "https://github.com/rbgirard/spiroanim/blob/main/docs/EIGHT_STEP.md";

/**
 * Gage's column groups, in his own words (docs/EIGHT_STEP.md): columns 1-2
 * Opposite, 3-4 Same, 5-6 Quarter Aligned, 7-8 Quarter Opposed. They are
 * the chart's labels, so they stay in English like the VTG labels.
 */
const COLUMN_RELATIONSHIP = [
  "Opposite",
  "Same",
  "Quarter Aligned",
  "Quarter Opposed",
] as const;

export type SpinFamily = "antispin" | "extension" | "inspin";

const ROW_FAMILY: Record<string, SpinFamily> = {
  A: "antispin",
  E: "extension",
  I: "inspin",
};

/** VTG's own hyphenated labels, kept in English (i18n glossary, section 1). */
const VTG_GROUP_LABEL: Record<string, string> = {
  ss: "Split-Same",
  so: "Split-Opp",
  ts: "Tog-Same",
  to: "Tog-Opp",
  qs: "Quarter-Same",
  qo: "Quarter-Opp",
};

export interface HandReading {
  /** Hand cycles to prop rotations, e.g. "1:3". */
  ratio: string;
  spin: SpinFamily;
}

export interface VtgBeat {
  beat: number;
  letter: string;
  /** Timing and direction, e.g. "Split-Opp", from the letter canon. */
  group: string;
  /** One hand pro, the other anti, per the letter canon. */
  hybrid: boolean;
  blue: HandReading;
  red: HandReading;
}

export interface NameReading {
  code: string;
  column: number;
  relationship: (typeof COLUMN_RELATIONSHIP)[number];
  row: string;
  capping: SpinFamily;
  continual: SpinFamily;
}

export interface ThreeLevelsPattern {
  name: NameReading;
  word: string;
  /** The repeating cell, e.g. ["K", "E", "C"]. */
  cell: readonly string[];
  repeats: number;
  beats: readonly VtgBeat[];
}

export function readName(code: string): NameReading {
  const match = /^([1-8])-([AEI])([AEI])$/.exec(code);
  if (!match) throw new Error(`Not an Eight Step code: ${code}`);
  const column = Number(match[1]);
  return {
    code,
    column,
    relationship: COLUMN_RELATIONSHIP[Math.floor((column - 1) / 2)]!,
    row: `${match[2]}${match[3]}`,
    capping: ROW_FAMILY[match[2]!]!,
    continual: ROW_FAMILY[match[3]!]!,
  };
}

/**
 * The spin a hand makes on one beat, from the transcription's own mapping
 * (README: extension = pro 0 turns, inspin and outspin = pro 1 turn, antispin
 * = anti 1 turn). Inspin and outspin differ only in starting phase, and a
 * continuous run alternates that phase beat to beat, so a single beat cannot
 * tell them apart. Gage's rows name inspin and never outspin, so a pro beat
 * with a turn reads as inspin; the topic test holds every such beat to a row
 * that names inspin.
 */
export function readHand(motion: EightStepMotion): HandReading {
  const { motionType, turns } = motion;
  const spin: SpinFamily | null =
    motionType === "anti" && turns === 1
      ? "antispin"
      : motionType === "pro" && turns === 0
        ? "extension"
        : motionType === "pro" && turns === 1
          ? "inspin"
          : null;
  if (!spin) {
    throw new Error(`No VTG spin for ${motionType} with ${turns} turns`);
  }
  return { ratio: ratioLabel(turns), spin };
}

/** The shortest run of letters the word repeats. */
export function repeatingCell(letters: readonly string[]): string[] {
  for (let size = 1; size < letters.length; size++) {
    if (letters.length % size !== 0) continue;
    if (letters.every((letter, i) => letter === letters[i % size])) {
      return letters.slice(0, size);
    }
  }
  return [...letters];
}

export function readPattern(record: EightStepRecord): ThreeLevelsPattern {
  const letters = record.steps.map((step) => step.letter);
  const cell = repeatingCell(letters);
  const beats = record.steps.map((step, i): VtgBeat => {
    const canon = TYPE1_ROTATION[step.letter];
    if (!canon) throw new Error(`${step.letter} is not a Type 1 letter`);
    return {
      beat: i + 1,
      letter: step.letter,
      group: VTG_GROUP_LABEL[canon.vtgGroup]!,
      hybrid: canon.rotationPattern === "hybrid",
      blue: readHand(step.motions.left),
      red: readHand(step.motions.right),
    };
  });
  return {
    name: readName(record.metadata.cell),
    word: record.word,
    cell,
    repeats: letters.length / cell.length,
    beats,
  };
}

function motion(hand: HandSide, m: EightStepMotion) {
  return createMotionData({
    motionType: m.motionType as MotionType,
    rotationDirection: m.rotationDirection as RotationDirection,
    startLocation: m.startLocation as GridLocation,
    endLocation: m.endLocation as GridLocation,
    turns: m.turns,
    startOrientation: m.startOrientation as Orientation,
    endOrientation: m.endOrientation as Orientation,
    hand,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
}

/**
 * A record as a Guide strip: the start pose (stepNumber 0) and its twelve
 * beats, ready for stripToSequence and the inline player.
 */
export function threeLevelsStrip(record: EightStepRecord): StepData[] {
  const code = record.metadata.cell;
  const start = record.startPlacement;
  const placement = start.gridPlacement as GridPlacement;
  return [
    createStepData({
      id: `eight-step-${code}-start`,
      stepNumber: 0,
      letter: null,
      startPlacement: placement,
      endPlacement: placement,
      gridMode: GridMode.DIAMOND,
      motions: {
        left: motion(HandSide.LEFT, start.motions.left),
        right: motion(HandSide.RIGHT, start.motions.right),
      },
    }),
    ...record.steps.map((step) =>
      createStepData({
        id: `eight-step-${code}-${step.stepNumber}`,
        stepNumber: step.stepNumber,
        letter: step.letter as Letter,
        startPlacement: step.startPlacement as GridPlacement,
        endPlacement: step.endPlacement as GridPlacement,
        gridMode: GridMode.DIAMOND,
        motions: {
          left: motion(HandSide.LEFT, step.motions.left),
          right: motion(HandSide.RIGHT, step.motions.right),
        },
      })
    ),
  ];
}
