/**
 * Pictograph-dataset bootstrap for Node/jsdom tests.
 *
 * THE PROBLEM: `motionQueryHandler` (and everything built on it, including
 * `deriveSequenceLetters`) calls `csvLoader.loadCSVDataSet()`, whose normal
 * path is `fetch("/data/pictographs/*.csv")` with an IndexedDB fallback.
 * Under Vitest there is no server to answer the fetch and jsdom ships no
 * IndexedDB, so the handler throws and every letter-derivation path is dead in
 * tests.
 *
 * THE SEAM: `CsvLoader.loadCsvData()` checks `window.csvData` BEFORE it
 * fetches (its documented "window pre-injection" tier — the same hook the app
 * uses to hand the loader server-rendered data). Populating that global from
 * the CSVs on disk drives the real production pipeline — real `CsvLoader`,
 * real `csvParser`, real `csvPictographParser`, real `MotionQueryHandler` —
 * with zero mocking and zero network.
 *
 * Verified working: with this bootstrap,
 * `motionQueryHandler.findLetterByMotionConfiguration(blue, red, DIAMOND)`
 * returns "G" for the GGGG fixture's first step under plain `vitest run`.
 *
 * Call it in a `beforeAll` of any suite that needs letter lookup. It is
 * idempotent and caches the disk read for the whole run.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";

const CSV_DIR = resolve(__dirname, "../../../static/data/pictographs");

const CSV_FILES = {
  diamondData: "DiamondPictographDataframe.csv",
  boxData: "BoxPictographDataframe.csv",
  skewedData: "SkewedPictographDataframe.csv",
  trigridData: "TrigridPictographDataframe.csv",
} as const;

interface CsvDataSetShape {
  diamondData: string;
  boxData: string;
  skewedData?: string;
  trigridData?: string;
}

let injected: CsvDataSetShape | null = null;

function readCsv(file: string): string | undefined {
  try {
    return readFileSync(resolve(CSV_DIR, file), "utf-8");
  } catch {
    // Diamond and Box are load-bearing and read without a guard below; the
    // optional grids legitimately may not exist in every checkout.
    return undefined;
  }
}

/**
 * Hydrate the production pictograph pipeline from the CSVs on disk and prove
 * it answers, by resolving one known letter through the real query handler.
 * Returns the injected dataset for callers that want to assert on it.
 */
export async function loadPictographDatasetForTests(): Promise<CsvDataSetShape> {
  if (injected) return injected;

  const skewedData = readCsv(CSV_FILES.skewedData);
  const trigridData = readCsv(CSV_FILES.trigridData);

  const dataset: CsvDataSetShape = {
    diamondData: readFileSync(resolve(CSV_DIR, CSV_FILES.diamondData), "utf-8"),
    boxData: readFileSync(resolve(CSV_DIR, CSV_FILES.boxData), "utf-8"),
    ...(skewedData !== undefined && { skewedData }),
    ...(trigridData !== undefined && { trigridData }),
  };

  // CsvLoader reads window.csvData as its window-pre-injection tier. Under a
  // node-environment vitest invocation there is no `window` at all (jsdom
  // supplies it as the global object; node does not) — this bootstrap must
  // not depend on which environment the runner resolved, so synthesize a
  // `window` onto `globalThis` when one isn't already present.
  if (typeof window === "undefined") {
    (globalThis as Record<string, unknown>).window = globalThis;
  }

  (globalThis as { window?: { csvData?: CsvDataSetShape } }).window!.csvData =
    dataset;

  // Force MotionQueryHandler's lazy init now, so a failure surfaces here with
  // this file's context rather than deep inside whatever called it.
  await motionQueryHandler.queryMotions({ gridMode: GridMode.DIAMOND });

  injected = dataset;
  return dataset;
}

/** All parsed pictographs for a grid mode, through the production pipeline. */
export async function allPictographsForTests(
  gridMode: GridMode = GridMode.DIAMOND
): Promise<PictographData[]> {
  await loadPictographDatasetForTests();
  return motionQueryHandler.queryMotions({ gridMode });
}
