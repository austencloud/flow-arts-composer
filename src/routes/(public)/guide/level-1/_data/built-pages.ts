/**
 * Built body-page components, keyed by manifest id (see guide-manifest.ts).
 * SHARED by both the print route (/print) and the book route (/book) so a page,
 * once rebuilt, shows identically in both. Any manifest id NOT in here renders a
 * numbered placeholder. Add an entry as each body page is rebuilt page-by-page.
 */
import type { Component } from "svelte";
import TheGridPage from "../_pages/TheGridPage.svelte";
import HandPlacementsPage from "../_pages/HandPlacementsPage.svelte";
import HandMotionsPage from "../_pages/HandMotionsPage.svelte";
import Type1AlphaBetaPage from "../_pages/Type1AlphaBetaPage.svelte";
import GammaPage from "../_pages/GammaPage.svelte";
import Type2ShiftsPage from "../_pages/Type2ShiftsPage.svelte";
import Type3CrossShiftsPage from "../_pages/Type3CrossShiftsPage.svelte";
import Type456Page from "../_pages/Type456Page.svelte";
import StaffPlacementsPage from "../_pages/StaffPlacementsPage.svelte";
import StaffMotionsPage from "../_pages/StaffMotionsPage.svelte";
import NegativeSpacePage from "../_pages/NegativeSpacePage.svelte";
import BaseLettersPage from "../_pages/BaseLettersPage.svelte";
import AlphaBetaWordsPage from "../_pages/AlphaBetaWordsPage.svelte";
import CompoundLettersPage from "../_pages/CompoundLettersPage.svelte";
import GammaLettersPage from "../_pages/GammaLettersPage.svelte";
import GammaWordsPage from "../_pages/GammaWordsPage.svelte";
import Type2ShiftLettersPage from "../_pages/Type2ShiftLettersPage.svelte";
import Type3CrossShiftLettersPage from "../_pages/Type3CrossShiftLettersPage.svelte";
import Type456LettersPage from "../_pages/Type456LettersPage.svelte";
import WordsPage from "../_pages/WordsPage.svelte";
import LoopsPage from "../_pages/LoopsPage.svelte";
import ReversalsPage from "../_pages/ReversalsPage.svelte";
import ExamplesPage from "../_pages/ExamplesPage.svelte";
import Type1LoopsPage from "../_pages/Type1LoopsPage.svelte";
import HybridReversalsPage from "../_pages/HybridReversalsPage.svelte";
import MixedWordsPage from "../_pages/MixedWordsPage.svelte";
import GammaLoopsPage from "../_pages/GammaLoopsPage.svelte";
import Type2LoopsPage from "../_pages/Type2LoopsPage.svelte";
import SixteenCountPage from "../_pages/SixteenCountPage.svelte";
import EightLetterWordsPage from "../_pages/EightLetterWordsPage.svelte";
import PropReversalLoopsPage from "../_pages/PropReversalLoopsPage.svelte";
import FullReversalLoopsPage from "../_pages/FullReversalLoopsPage.svelte";
import GuideCodexPage from "../_pages/GuideCodexPage.svelte";
import GuideCodexPage2 from "../_pages/GuideCodexPage2.svelte";

export const BUILT: Record<string, Component> = {
  "the-grid": TheGridPage,
  "hand-placements": HandPlacementsPage,
  "hand-motions": HandMotionsPage,
  "hm-type1": Type1AlphaBetaPage,
  "hm-gamma": GammaPage,
  "hm-type2": Type2ShiftsPage,
  "hm-type34": Type3CrossShiftsPage,
  "hm-type56": Type456Page,
  "staff-placements": StaffPlacementsPage,
  "staff-motions": StaffMotionsPage,
  "negative-space": NegativeSpacePage,
  "base-letters": BaseLettersPage,
  "lt1-abc-ghi": AlphaBetaWordsPage,
  "lt1-dj-ek-fl": CompoundLettersPage,
  "lt1-mp-nq-or-stuv": GammaLettersPage,
  "lt1-gamma-words": GammaWordsPage,
  "lt2-wxyz": Type2ShiftLettersPage,
  "lt3-dash-letters": Type3CrossShiftLettersPage,
  "lt456-phi-psi-lambda": Type456LettersPage,
  "words": WordsPage,
  "permutations": LoopsPage,
  "reversals": ReversalsPage,
  "examples-abc": ExamplesPage,
  "examples-cccc": HybridReversalsPage,
  "examples-acac": MixedWordsPage,
  "misc-permutations": Type1LoopsPage,
  "gamma-loops": GammaLoopsPage,
  "type2-loops": Type2LoopsPage,
  "sixteen-count": SixteenCountPage,
  "eight-letter-words": EightLetterWordsPage,
  "prop-reversal-loops": PropReversalLoopsPage,
  "full-reversal-loops": FullReversalLoopsPage,
  "codex": GuideCodexPage,
  "codex-2": GuideCodexPage2,
};
