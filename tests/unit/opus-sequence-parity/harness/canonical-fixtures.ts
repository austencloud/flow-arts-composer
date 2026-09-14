/**
 * Canonical seed fixtures for the app-vs-engine LOOP parity audit.
 *
 * Every seed is built from the repository's canonical pictograph dataframes
 * (`static/data/pictographs/*.csv`) — the same files the engine's own
 * integration tests and the app's variation provider read. Nothing here
 * invents a motion pair: a seed step is always a real CSV row, and chains are
 * only formed where one row's `endPosition` equals the next row's
 * `startPosition`.
 *
 * Orientations are propagated with the app's canonical orientation calculator
 * so that BOTH execution paths receive byte-identical input. (The engine's
 * copy of that calculator is proven equivalent by
 * `orientation-calculator-parity.test.ts`, so the choice of propagator cannot
 * bias the differential result.)
 *
 * The `blue → left` / `red → right` column mapping matches
 * `packages/sequence-engine/tests/integration/loop-grid-mode-start.test.ts`
 * and `@tka/tka-types`' HandSide doc comment ("canonical TKA presentation
 * renders the left hand blue and the right hand red").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
  type GridPosition,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  updateEndOrientations,
  updateStartOrientations,
} from "$lib/shared/pictograph/prop/services/orientation-calculator";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../../..");
const CSV_DIR = path.join(REPO_ROOT, "static/data/pictographs");

export type CsvGridMode = "diamond" | "box";

export interface PictographRow {
  readonly letter: string;
  readonly startPosition: string;
  readonly endPosition: string;
  readonly left: RawMotion;
  readonly right: RawMotion;
}

interface RawMotion {
  readonly motionType: string;
  readonly rotationDirection: string;
  readonly startLocation: string;
  readonly endLocation: string;
}

const CSV_FILE: Record<CsvGridMode, string> = {
  diamond: "DiamondPictographDataframe.csv",
  box: "BoxPictographDataframe.csv",
};

const rowCache = new Map<CsvGridMode, PictographRow[]>();

/** Load and parse a canonical pictograph dataframe. Cached per grid mode. */
export function loadPictographRows(gridMode: CsvGridMode): PictographRow[] {
  const cached = rowCache.get(gridMode);
  if (cached) return cached;

  const text = readFileSync(path.join(CSV_DIR, CSV_FILE[gridMode]), "utf8");
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0]!.split(",");
  const idx = (name: string) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Missing CSV column "${name}" in ${gridMode}`);
    return i;
  };

  const cols = {
    letter: idx("letter"),
    startPosition: idx("startPosition"),
    endPosition: idx("endPosition"),
    blueMotionType: idx("blueMotionType"),
    blueRotationDirection: idx("blueRotationDirection"),
    blueStartLocation: idx("blueStartLocation"),
    blueEndLocation: idx("blueEndLocation"),
    redMotionType: idx("redMotionType"),
    redRotationDirection: idx("redRotationDirection"),
    redStartLocation: idx("redStartLocation"),
    redEndLocation: idx("redEndLocation"),
  };

  const rows = lines
    .slice(1)
    .map((line) => line.split(","))
    .filter((c) => c.length === headers.length && c[cols.blueMotionType])
    .map(
      (c): PictographRow => ({
        letter: c[cols.letter]!,
        startPosition: c[cols.startPosition]!,
        endPosition: c[cols.endPosition]!,
        left: {
          motionType: c[cols.blueMotionType]!,
          rotationDirection: c[cols.blueRotationDirection]!,
          startLocation: c[cols.blueStartLocation]!,
          endLocation: c[cols.blueEndLocation]!,
        },
        right: {
          motionType: c[cols.redMotionType]!,
          rotationDirection: c[cols.redRotationDirection]!,
          startLocation: c[cols.redStartLocation]!,
          endLocation: c[cols.redEndLocation]!,
        },
      })
    );

  rowCache.set(gridMode, rows);
  return rows;
}

/**
 * Deterministic chains of `length` canonical rows, position-continuous.
 *
 * Rows are consumed in CSV order and chains are emitted in depth-first CSV
 * order, so the same call always yields the same list — no RNG, no date, no
 * set-iteration dependence.
 */
export function buildChains(
  gridMode: CsvGridMode,
  length: number,
  limit = 2000,
  perRoot = 2
): PictographRow[][] {
  const rows = loadPictographRows(gridMode);
  const byStart = new Map<string, PictographRow[]>();
  for (const row of rows) {
    const bucket = byStart.get(row.startPosition);
    if (bucket) bucket.push(row);
    else byStart.set(row.startPosition, [row]);
  }

  const out: PictographRow[][] = [];
  // `perRoot` keeps coverage broad: every canonical row gets to be a seed's
  // first step before any single row contributes a second continuation. A
  // plain depth-first cap would spend the whole budget inside one letter.
  const walk = (prefix: PictographRow[], fromRoot: PictographRow[][]) => {
    if (fromRoot.length >= perRoot) return;
    if (prefix.length === length) {
      fromRoot.push([...prefix]);
      return;
    }
    const last = prefix[prefix.length - 1]!;
    for (const next of byStart.get(last.endPosition) ?? []) {
      if (fromRoot.length >= perRoot) return;
      prefix.push(next);
      walk(prefix, fromRoot);
      prefix.pop();
    }
  };

  for (const row of rows) {
    if (out.length >= limit) break;
    const fromRoot: PictographRow[][] = [];
    walk([row], fromRoot);
    out.push(...fromRoot);
  }
  return out.slice(0, limit);
}

const RAW_MOTION_TYPE: Record<string, MotionType> = {
  pro: MotionType.PRO,
  anti: MotionType.ANTI,
  dash: MotionType.DASH,
  static: MotionType.STATIC,
  float: MotionType.FLOAT,
};

const RAW_ROTATION: Record<string, RotationDirection> = {
  cw: RotationDirection.CLOCKWISE,
  ccw: RotationDirection.COUNTER_CLOCKWISE,
  no_rot: RotationDirection.NO_ROTATION,
  norotation: RotationDirection.NO_ROTATION,
  "": RotationDirection.NO_ROTATION,
};

function rotationOf(raw: string): RotationDirection {
  const mapped = RAW_ROTATION[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  throw new Error(`Unrecognized canonical rotation direction "${raw}"`);
}

function motionTypeOf(raw: string): MotionType {
  const mapped = RAW_MOTION_TYPE[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  throw new Error(`Unrecognized canonical motion type "${raw}"`);
}

function motionFrom(
  raw: RawMotion,
  hand: HandSide,
  turns: number,
  gridMode: GridMode
) {
  return createMotionData({
    hand,
    gridMode,
    motionType: motionTypeOf(raw.motionType),
    rotationDirection: rotationOf(raw.rotationDirection),
    startLocation: raw.startLocation as GridLocation,
    endLocation: raw.endLocation as GridLocation,
    turns,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
  });
}

/** Start-position step: both hands static at the chain's opening locations. */
function startStep(
  first: PictographRow,
  gridMode: GridMode,
  startOrientations: { left: Orientation; right: Orientation }
): StepData {
  const staticAt = (loc: string, hand: HandSide, ori: Orientation) =>
    createMotionData({
      hand,
      gridMode,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      startLocation: loc as GridLocation,
      endLocation: loc as GridLocation,
      turns: 0,
      startOrientation: ori,
      endOrientation: ori,
    });

  return {
    id: "step-0",
    stepNumber: 0,
    duration: 1,
    letter: null,
    startPosition: first.startPosition as GridPosition,
    endPosition: first.startPosition as GridPosition,
    gridMode,
    motions: {
      left: staticAt(first.left.startLocation, HandSide.LEFT, startOrientations.left),
      right: staticAt(
        first.right.startLocation,
        HandSide.RIGHT,
        startOrientations.right
      ),
    },
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  } as StepData;
}

export interface SeedOptions {
  /** Per-hand turn counts applied to every seed step. Default 0/0. */
  readonly turns?: { readonly left: number; readonly right: number };
  /** Start-position orientations. Default in/in. */
  readonly startOrientations?: {
    readonly left: Orientation;
    readonly right: Orientation;
  };
}

/**
 * Materialize a canonical chain into a seed the executors accept:
 * `[startPositionStep, ...steps]`, orientations propagated forward.
 */
export function buildSeed(
  chain: PictographRow[],
  gridMode: CsvGridMode,
  options: SeedOptions = {}
): StepData[] {
  const mode = gridMode === "box" ? GridMode.BOX : GridMode.DIAMOND;
  const turns = options.turns ?? { left: 0, right: 0 };
  const startOrientations = options.startOrientations ?? {
    left: Orientation.IN,
    right: Orientation.IN,
  };

  const steps: StepData[] = [startStep(chain[0]!, mode, startOrientations)];

  chain.forEach((row, i) => {
    const raw: StepData = {
      id: `step-${i + 1}`,
      stepNumber: i + 1,
      duration: 1,
      letter: row.letter as Letter,
      startPosition: row.startPosition as GridPosition,
      endPosition: row.endPosition as GridPosition,
      gridMode: mode,
      motions: {
        left: motionFrom(row.left, HandSide.LEFT, turns.left, mode),
        right: motionFrom(row.right, HandSide.RIGHT, turns.right, mode),
      },
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    } as StepData;

    const withStart = updateStartOrientations(raw, steps[steps.length - 1]!);
    steps.push(updateEndOrientations(withStart));
  });

  return steps;
}

/** Structured deep clone — both executors mutate their input array in place. */
export function cloneSeed(seed: StepData[]): StepData[] {
  return seed.map((step) => ({
    ...step,
    motions: {
      left: { ...step.motions.left },
      right: { ...step.motions.right },
    },
  })) as StepData[];
}

/** Compact human-readable seed label used in failure output and the report. */
export function describeSeed(seed: StepData[]): string {
  const word = seed
    .slice(1)
    .map((s) => s.letter ?? "?")
    .join("");
  const first = seed[0]!;
  const last = seed[seed.length - 1]!;
  return `${word} ${first.startPosition}→${last.endPosition}`;
}
