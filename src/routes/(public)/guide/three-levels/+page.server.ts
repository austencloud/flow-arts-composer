/**
 * The page's patterns are read at build time from Gage's 72 transcribed
 * sequences, so only the eight records the page shows reach the browser.
 */
import records from "../../../../../docs/research/spiroanim/eightstep-72-sequences.json";
import {
  readPattern,
  THREE_LEVELS_PATTERNS,
  THREE_LEVELS_SAME_WORD_PAIR,
  type EightStepRecord,
} from "#lib/shared/guide-topics/three-levels-topic.js";
import type { PageServerLoad } from "./$types";

const all = records as unknown as EightStepRecord[];

function pick(code: string) {
  const record = all.find((r) => r.metadata.cell === code);
  if (!record) throw new Error(`Gage's chart has no ${code}`);
  return { record, pattern: readPattern(record) };
}

export const load: PageServerLoad = () => ({
  patterns: THREE_LEVELS_PATTERNS.map(pick),
  pair: THREE_LEVELS_SAME_WORD_PAIR.map(pick),
  chartSize: all.length,
  distinctWords: new Set(all.map((r) => r.word)).size,
});
