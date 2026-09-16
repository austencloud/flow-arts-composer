/**
 * Level 1 guide - body page manifest. The SINGLE SOURCE OF TRUTH for the
 * printable guide's page order, page numbers, and Table of Contents.
 *
 * One entry = one physical body page. Page number = (index + 1): the first body
 * page (The Grid) is page 1. Front matter (cover, drink water, support, read me,
 * TOC) is intentionally NOT in here - it prints unnumbered, ahead of page 1.
 *
 * Editing this array updates everything downstream at once: the generated TOC
 * (`GuideTOC.svelte`), each page's recto/verso footer number, and the page
 * order in the print route. Add / remove / reorder here, never hand-number a
 * page or a TOC row.
 *
 * Seeded 1 entry = 1 reserved page from the rebuild's intended pagination (see
 * docs/superpowers/specs/2026-06-22-guide-page-numbering-toc-design.md and the
 * rebuild tracker). As real pages split or merge during the page-by-page
 * conversion, add/remove entries - numbers re-derive automatically.
 */

import type { Snippet } from "svelte";

/**
 * Metadata GuideDocument hands each page to the route's wrapper snippet. The
 * route decides the frame (stacked GuidePage for print, scaled flip page for
 * the book); GuideDocument supplies the title, number, full-bleed flag, and the
 * page's content snippet.
 */
export type GuidePageMeta = {
  /** cover | drink | support | readme | toc | body. */
  kind: string;
  title?: string;
  pageNumber?: number;
  fullBleed?: boolean;
  label?: string;
  content: Snippet;
  /**
   * This page has a single-source reflow view (GUIDE_CONTENT). The reader's flow
   * frame renders it full-width + unscaled instead of inside the scaled 8.5×11
   * sheet. Sheet/print hosts ignore this.
   */
  reflowable?: boolean;
};

export type GuideGroup = "1.0" | "1.1" | "1.2";

export type GuidePageEntry = {
  /** Stable slug. Matches the built-page registry key in the print route. */
  id: string;
  /** TOC label (and placeholder heading until the page is built). */
  title: string;
  /** 0 = section row (TOC main), 1 = indented sub-entry. */
  level: 0 | 1;
  /** TOC section grouping + heading. */
  group: GuideGroup;
  /**
   * The built page paints its own header(s) - GuidePage suppresses the single
   * manifest title. For multi-section pages (e.g. Type 4/5/6, three calligraphic
   * titles). The `title` above still drives the TOC row + dev label.
   */
  selfTitled?: boolean;
};

export const GROUP_TITLES: Record<GuideGroup, string> = {
  "1.0": "Positions / Motions",
  "1.1": "Letters",
  "1.2": "Words",
};

export const GUIDE_BODY_PAGES: GuidePageEntry[] = [
  // ── 1.0 Placements / Motions (p1–p10) ──────────────────────────────────
  { id: "the-grid", title: "The Grid", level: 0, group: "1.0" },
  { id: "hand-placements", title: "Hand Placements", level: 0, group: "1.0" },
  { id: "hand-motions", title: "Hand Motions", level: 0, group: "1.0" },
  { id: "hm-type1", title: "Type 1 Dual-Shifts - Alpha, Beta", level: 1, group: "1.0" },
  { id: "hm-gamma", title: "Gamma - Quarter-Opp, Quarter-Same", level: 1, group: "1.0" },
  { id: "hm-type2", title: "Type 2 - Shifts", level: 1, group: "1.0" },
  { id: "hm-type34", title: "Type 3 - Cross-Shifts", level: 1, group: "1.0" },
  { id: "hm-type56", title: "Type 4/5/6 - Dash, Dual-Dash, Static", level: 1, group: "1.0", selfTitled: true },
  { id: "staff-placements", title: "Staff Placements", level: 0, group: "1.0" },
  { id: "staff-motions", title: "Staff Motions", level: 0, group: "1.0" },
  { id: "negative-space", title: "Negative Space / Body Turns", level: 0, group: "1.0" },

  // ── 1.1 Letters (p11–p29) ─────────────────────────────────────────────
  { id: "base-letters", title: "Base Letters", level: 0, group: "1.1" },
  // Guide/Codex merge (2026-07-10): the 7 broken/static catalog entries
  // (bl-double-staff, bl-double-staff-36, bl-clubs, bl-buugeng, bl-triads,
  // bl-fans, bl-mini-hoops) are replaced by ONE interactive codex page. In the
  // reader it renders the live Codex explorer (letter picker + variations +
  // prop switch); on /print and /book (which share this same manifest + BUILT
  // registry) GuideCodexPage itself branches on getGuidePrintMode() to render
  // the faithful static Double-Staff sheets instead - see GuideCodexPage.svelte.
  // The Codex spans two letter-sized pages - Types 1-2 (Double Staff) on `codex`,
  // Types 3-6 on `codex-2` - one printed sheet each (see CodexPageBody.svelte).
  { id: "codex", title: "Codex", level: 0, group: "1.1" },
  { id: "codex-2", title: "Codex (cont.)", level: 1, group: "1.1" },
  // (letters-type1 removed 2026-07-09 - base-letters carries the Type 1 head.)
  { id: "lt1-abc-ghi", title: "Alpha/Beta Words", level: 1, group: "1.1" },
  { id: "lt1-dj-ek-fl", title: "Compound Letters", level: 1, group: "1.1" },
  { id: "lt1-mp-nq-or-stuv", title: "Gamma Letters", level: 1, group: "1.1" },
  // Old p26 (Gamma Words) - added during the 2026-07-09 autonomous run.
  { id: "lt1-gamma-words", title: "Gamma Words", level: 1, group: "1.1" },
  // Old p27 is ONE page (letters + words) - the empty letters-type2 section row
  // was removed 2026-07-09; lt2-wxyz carries the whole Type 2 chapter page.
  { id: "lt2-wxyz", title: "Type 2 - Shift", level: 0, group: "1.1", selfTitled: true },
  // Old p28 is ONE page - the empty letters-type3 section row was removed
  // 2026-07-09; lt3-dash-letters carries the whole Type 3 chapter page.
  { id: "lt3-dash-letters", title: "Type 3 - Cross-Shift", level: 0, group: "1.1", selfTitled: true },
  // Old p29 is ONE page covering Types 4/5/6 - the empty letters-type456 row
  // and the two seeded splits (-dash, -abg) were removed 2026-07-09.
  { id: "lt456-phi-psi-lambda", title: "Type 4/5/6 - Φ, Ψ, Λ", level: 0, group: "1.1", selfTitled: true },

  // ── 1.2 Words (p30–p34) ───────────────────────────────────────────────
  { id: "words", title: "Words", level: 0, group: "1.2" },
  // "CAPs" in the old guide - retitled to the app's LOOP terminology.
  { id: "permutations", title: "LOOPs", level: 0, group: "1.2" },
  { id: "reversals", title: "Reversals", level: 0, group: "1.2" },
  { id: "examples-abc", title: "Examples", level: 0, group: "1.2" },
  // Old p35 "Guide pt. 2" - CCCC hybrid reversal variants.
  { id: "examples-cccc", title: "Hybrid Reversals - CCCC", level: 1, group: "1.2" },
  // Old p36 "Guide pt. 3" - mixing hybrids with non-hybrids.
  { id: "examples-acac", title: "Mixed Words - ACAC, BCBC", level: 1, group: "1.2" },
  // "Type 1 CAPs" in the old guide - retitled to the app's LOOP terminology.
  { id: "misc-permutations", title: "Type 1 LOOPs", level: 0, group: "1.2" },
  // Old p38 "Type 1 Gamma Permutations" - SOTR, VPUQ, MVNU Rotated LOOPs.
  { id: "gamma-loops", title: "Gamma LOOPs", level: 1, group: "1.2" },
  // Old p39 "Type 2 CAPs" - BΣTX, EΔUZ, OYHΘ Rotated LOOPs.
  { id: "type2-loops", title: "Type 2 LOOPs", level: 0, group: "1.2" },
  // Old p40 - GΘOZ, EΔQY repeated ×4 into 16-count sequences.
  { id: "sixteen-count", title: "16-Count Sequences", level: 0, group: "1.2" },
  // Old p41 - IIΩXKEΣY, CΣNZIΘVW repeated twice.
  { id: "eight-letter-words", title: "8-Letter Words", level: 0, group: "1.2" },
  // Old p42 "Prop-reversal CAPs" - EΣQY, TWKΘ, BΔMX.
  { id: "prop-reversal-loops", title: "Prop-Reversal LOOPs", level: 0, group: "1.2" },
  // Old p43 "Full-reversal CAPs" - CCKE, FLII, DAK.
  { id: "full-reversal-loops", title: "Full-Reversal LOOPs", level: 0, group: "1.2" },
];

/** 1-based page number of an entry id, or undefined if not in the manifest. */
export function pageNumberOf(id: string): number | undefined {
  const i = GUIDE_BODY_PAGES.findIndex((e) => e.id === id);
  return i === -1 ? undefined : i + 1;
}

/** The body entries grouped in manifest order, for TOC rendering. */
export function bodyPagesByGroup(): { group: GuideGroup; entries: { entry: GuidePageEntry; page: number }[] }[] {
  const out: { group: GuideGroup; entries: { entry: GuidePageEntry; page: number }[] }[] = [];
  GUIDE_BODY_PAGES.forEach((entry, i) => {
    let bucket = out.find((b) => b.group === entry.group);
    if (!bucket) {
      bucket = { group: entry.group, entries: [] };
      out.push(bucket);
    }
    bucket.entries.push({ entry, page: i + 1 });
  });
  return out;
}
