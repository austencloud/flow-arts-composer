/**
 * Real Pictograph Loader for Tests
 *
 * Uses the ACTUAL production CSV-parsing pipeline (`csvParser` +
 * `csvPictographParser`) to load valid pictographs straight from the CSV
 * dataframes on disk. This ensures tests use the same row -> PictographData
 * transformation as production, without needing a browser `fetch()` (the
 * production `CsvLoader` fetches `/data/pictographs/*.csv` over HTTP, which
 * has no server to answer it under Vitest's jsdom/node environment — reading
 * the file directly is the Node-safe equivalent of the same static asset).
 *
 * CRITICAL: Never create fake/hardcoded pictographs in tests!
 * Always use this loader to get real, validated data.
 *
 * (2026-07-14: rewritten — the previous version imported a DI container
 * (`ILetterQueryHandler`, `CsvLoader` at
 * `services/implementations/data/CsvLoader`) that no longer exists anywhere
 * in the codebase; the file was dead code with zero call sites and had never
 * actually been exercised. This version uses the real, current singletons.)
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { csvParser } from "#lib/shared/foundation/services/implementations/data/csv-parser.js";
import {
  csvPictographParser,
  type CSVRow,
} from "#lib/shared/pictograph/shared/services/csv-pictograph-parser.js";

const CSV_FILES: Partial<Record<GridMode, string>> = {
  [GridMode.DIAMOND]: "../../static/data/pictographs/DiamondPictographDataframe.csv",
  [GridMode.BOX]: "../../static/data/pictographs/BoxPictographDataframe.csv",
  [GridMode.SKEWED]: "../../static/data/pictographs/SkewedPictographDataframe.csv",
  [GridMode.TRIGRID]: "../../static/data/pictographs/TrigridPictographDataframe.csv",
};

// Module-level cache: parsed CSV rows are read from disk once per grid mode,
// then re-used for every subsequent lookup in the same test run.
const rowCache = new Map<GridMode, CSVRow[]>();

function loadRowsForGridMode(gridMode: GridMode): CSVRow[] {
  const cached = rowCache.get(gridMode);
  if (cached) return cached;

  const relativePath = CSV_FILES[gridMode];
  if (!relativePath) {
    throw new Error(`No CSV dataframe registered for grid mode: ${gridMode}`);
  }

  const csvPath = resolve(__dirname, relativePath);
  const csvText = readFileSync(csvPath, "utf-8");
  const { rows } = csvParser.parseCSV(csvText);

  const asCsvRows = rows as unknown as CSVRow[];
  rowCache.set(gridMode, asCsvRows);
  return asCsvRows;
}

/**
 * Get ALL valid pictographs for a letter (including variants) via the real
 * production CSV -> PictographData pipeline.
 */
export async function getAllLetterVariants(
  letter: Letter,
  gridMode: GridMode = GridMode.DIAMOND
): Promise<PictographData[]> {
  const rows = loadRowsForGridMode(gridMode);
  return rows
    .filter((row) => row.letter === letter)
    .map((row) => csvPictographParser.parseCSVRowToPictograph(row, gridMode));
}

/**
 * Get a single (first) valid pictograph for a letter.
 */
export async function getValidPictograph(
  letter: Letter,
  gridMode: GridMode = GridMode.DIAMOND
): Promise<PictographData | null> {
  const variants = await getAllLetterVariants(letter, gridMode);
  return variants[0] ?? null;
}

/**
 * Get sample pictographs (A, B, C, D, E) for quick testing.
 */
export async function getValidSamplePictographs(
  gridMode: GridMode = GridMode.DIAMOND
): Promise<PictographData[]> {
  const letters = [Letter.A, Letter.B, Letter.C, Letter.D, Letter.E];
  const pictographs: PictographData[] = [];
  for (const letter of letters) {
    const picto = await getValidPictograph(letter, gridMode);
    if (picto) pictographs.push(picto);
  }
  return pictographs;
}

/**
 * Reset the module-level row cache (useful for test isolation across grid
 * modes, or if a test wants to force a fresh disk read).
 */
export function resetPictographLoaderCache(): void {
  rowCache.clear();
}
