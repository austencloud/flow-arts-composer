/**
 * The deterministic seed corpus for the LOOP parity audit.
 *
 * Coverage axes (the product is enumerated in full):
 *   - grid mode:        diamond, box
 *   - seed length:      1, 2, 3 canonical steps (+ the start-position step)
 *   - per-hand turns:   0/0, 1/1, 0/1 (asymmetric), 0.5/0.5 (half turns)
 *   - start orientations: in/in, out/in, clock/counter
 *
 * Within each cell the first `SEEDS_PER_CELL` canonical chains that the LOOP
 * type actually admits are used. Chain enumeration is CSV-ordered and
 * breadth-first across root rows, so the corpus is byte-stable across runs and
 * machines — no RNG, no clock, no set-iteration order.
 *
 * Everything the corpus produces is a real pictograph from
 * `static/data/pictographs/*.csv`; nothing is synthesised.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

import {
  buildChains,
  buildSeed,
  describeSeed,
  type CsvGridMode,
  type PictographRow,
} from "./canonical-fixtures";

export const SEEDS_PER_CELL = 4;

export const GRID_MODES: readonly CsvGridMode[] = ["diamond", "box"];
export const SEED_LENGTHS: readonly number[] = [1, 2, 3];

export const TURN_PROFILES = [
  { label: "0/0", turns: { left: 0, right: 0 } },
  { label: "1/1", turns: { left: 1, right: 1 } },
  { label: "0/1", turns: { left: 0, right: 1 } },
  { label: "0.5/0.5", turns: { left: 0.5, right: 0.5 } },
] as const;

export const ORIENTATION_PROFILES = [
  {
    label: "in/in",
    startOrientations: { left: Orientation.IN, right: Orientation.IN },
  },
  {
    label: "out/in",
    startOrientations: { left: Orientation.OUT, right: Orientation.IN },
  },
  {
    label: "clock/counter",
    startOrientations: { left: Orientation.CLOCK, right: Orientation.COUNTER },
  },
] as const;

export interface CorpusSeed {
  readonly steps: StepData[];
  readonly gridMode: CsvGridMode;
  readonly seedLength: number;
  readonly turnLabel: string;
  readonly orientationLabel: string;
  readonly label: string;
}

const chainCache = new Map<string, PictographRow[][]>();

function chainsFor(gridMode: CsvGridMode, length: number): PictographRow[][] {
  const key = `${gridMode}:${length}`;
  const cached = chainCache.get(key);
  if (cached) return cached;
  const chains = buildChains(gridMode, length);
  chainCache.set(key, chains);
  return chains;
}

/**
 * Iterate the whole corpus lazily. `accept` decides which seeds a given LOOP
 * type can actually use (the app executors validate their start/end position
 * pair and throw otherwise), and only accepted seeds count toward the
 * per-cell budget — so a restrictive LOOP type still gets `SEEDS_PER_CELL`
 * real samples per cell rather than four rejections.
 */
export function* corpus(
  accept: (seed: StepData[]) => boolean
): Generator<CorpusSeed> {
  for (const gridMode of GRID_MODES) {
    for (const seedLength of SEED_LENGTHS) {
      const chains = chainsFor(gridMode, seedLength);
      for (const turn of TURN_PROFILES) {
        for (const ori of ORIENTATION_PROFILES) {
          let taken = 0;
          for (const chain of chains) {
            if (taken >= SEEDS_PER_CELL) break;
            const steps = buildSeed(chain, gridMode, {
              turns: turn.turns,
              startOrientations: ori.startOrientations,
            });
            if (!accept(steps)) continue;
            taken++;
            yield {
              steps,
              gridMode,
              seedLength,
              turnLabel: turn.label,
              orientationLabel: ori.label,
              label: `${gridMode} len${seedLength} turns=${turn.label} ori=${ori.label} ${describeSeed(steps)}`,
            };
          }
        }
      }
    }
  }
}
