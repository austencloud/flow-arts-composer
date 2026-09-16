/**
 * Single-source content per migrated guide page, keyed by manifest id (mirrors
 * built-pages.ts). FlowFrame + the crawlable routes look up a page's GuideBlock[]
 * here; the reader's flow toggle only reflows slugs present in this map.
 *
 * Every Level-1 topic is registered EXCEPT codex / codex-2: those are wide
 * reference tables (the full letter matrix). Their sheet-fallback already crawls
 * richly (30+ describePictograph labels each via CodexCell), and a 1-column
 * mobile reflow of a table would be strictly worse - so they intentionally stay
 * sheet-only. Every other page reflows.
 */
import type { GuideBlock } from "./guide-content-blocks";
import { theGridContent } from "./content/the-grid.content";
import { handPlacementsContent } from "./content/hand-placements.content";
import { handMotionsContent } from "./content/hand-motions.content";
import { hmType1Content } from "./content/hm-type1.content";
import { hmGammaContent } from "./content/hm-gamma.content";
import { hmType2Content } from "./content/hm-type2.content";
import { hmType34Content } from "./content/hm-type34.content";
import { hmType56Content } from "./content/hm-type56.content";
import { staffPlacementsContent } from "./content/staff-placements.content";
import { staffMotionsContent } from "./content/staff-motions.content";
import { negativeSpaceContent } from "./content/negative-space.content";
import { baseLettersContent } from "./content/base-letters.content";
import { lt1AbcGhiContent } from "./content/lt1-abc-ghi.content";
import { lt1DjEkFlContent } from "./content/lt1-dj-ek-fl.content";
import { lt1MpNqOrStuvContent } from "./content/lt1-mp-nq-or-stuv.content";
import { lt1GammaWordsContent } from "./content/lt1-gamma-words.content";
import { lt2WxyzContent } from "./content/lt2-wxyz.content";
import { lt3DashLettersContent } from "./content/lt3-dash-letters.content";
import { lt456PhiPsiLambdaContent } from "./content/lt456-phi-psi-lambda.content";
import { wordsContent } from "./content/words.content";
import { permutationsContent } from "./content/permutations.content";
import { reversalsContent } from "./content/reversals.content";
import { examplesAbcContent } from "./content/examples-abc.content";
import { examplesCcccContent } from "./content/examples-cccc.content";
import { examplesAcacContent } from "./content/examples-acac.content";
import { miscPermutationsContent } from "./content/misc-permutations.content";
import { gammaLoopsContent } from "./content/gamma-loops.content";
import { type2LoopsContent } from "./content/type2-loops.content";
import { sixteenCountContent } from "./content/sixteen-count.content";
import { eightLetterWordsContent } from "./content/eight-letter-words.content";
import { propReversalLoopsContent } from "./content/prop-reversal-loops.content";
import { fullReversalLoopsContent } from "./content/full-reversal-loops.content";

export const GUIDE_CONTENT: Record<string, GuideBlock[]> = {
  // ── 1.0 Placements / Motions ──
  "the-grid": theGridContent,
  "hand-placements": handPlacementsContent,
  "hand-motions": handMotionsContent,
  "hm-type1": hmType1Content,
  "hm-gamma": hmGammaContent,
  "hm-type2": hmType2Content,
  "hm-type34": hmType34Content,
  "hm-type56": hmType56Content,
  "staff-placements": staffPlacementsContent,
  "staff-motions": staffMotionsContent,
  "negative-space": negativeSpaceContent,
  // ── 1.1 Letters (codex / codex-2 stay sheet-only - see header) ──
  "base-letters": baseLettersContent,
  "lt1-abc-ghi": lt1AbcGhiContent,
  "lt1-dj-ek-fl": lt1DjEkFlContent,
  "lt1-mp-nq-or-stuv": lt1MpNqOrStuvContent,
  "lt1-gamma-words": lt1GammaWordsContent,
  "lt2-wxyz": lt2WxyzContent,
  "lt3-dash-letters": lt3DashLettersContent,
  "lt456-phi-psi-lambda": lt456PhiPsiLambdaContent,
  // ── 1.2 Words ──
  words: wordsContent,
  permutations: permutationsContent,
  reversals: reversalsContent,
  "examples-abc": examplesAbcContent,
  "examples-cccc": examplesCcccContent,
  "examples-acac": examplesAcacContent,
  "misc-permutations": miscPermutationsContent,
  "gamma-loops": gammaLoopsContent,
  "type2-loops": type2LoopsContent,
  "sixteen-count": sixteenCountContent,
  "eight-letter-words": eightLetterWordsContent,
  "prop-reversal-loops": propReversalLoopsContent,
  "full-reversal-loops": fullReversalLoopsContent,
};

/** Whether a manifest id has a reflowable single-source content array. */
export function hasReflowContent(id: string): boolean {
  return id in GUIDE_CONTENT;
}
