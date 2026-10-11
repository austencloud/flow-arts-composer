import type { GuideBlock } from "../guide-content-blocks";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { STAFF_CELLS_BY_KIND } from "#lib/shared/guide-topics/staff-placements-topic.js";

// 12 staff pictographs: 3 placements × 4 thumb-orientation columns, from the
// shared topic record (copied verbatim from _pages/StaffPlacementsPage.svelte).
const rowCells = (kind: keyof typeof STAFF_CELLS_BY_KIND) => [
  ...STAFF_CELLS_BY_KIND[kind],
];

/** STAFF props (TKA letter glyph stays on - the default) - matching StaffPlacementsPage's PICTO_FLAGS. */
const RENDER = { propType: PropType.STAFF } as const;

// Row glyph height, copied from StaffPlacementsPage.svelte's GLYPH_H.
const GLYPH_H = 26;

// Verbatim prose lifted from _pages/StaffPlacementsPage.svelte (Austen's words - never AI-written).
export const staffPlacementsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Staff Placements" },
  {
    kind: "prose",
    html:
      "When writing sequences with staves, it helps to mark the thumb end with a line.<br>" +
      "The performer can use it to keep track of rotations and check their position on every step.<br>" +
      "It also encourages negative space/body turns instead of finger spinning.",
  },
  { kind: "prose", html: "In the following examples, an end is always at the center point." },
  { kind: "prose", html: "Practice each placement below, paying attention to the thumb orientation." },
  {
    kind: "prose",
    html:
      'Thumbs: in out <span class="cB">(out</span>/<span class="cR">in)</span> <span class="cB">(in</span>/<span class="cR">out)</span>',
  },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/α.svg", alt: "Alpha (α)", heightPt: GLYPH_H },
  { kind: "heading", level: 2, text: "Alpha" },
  { kind: "pictographGroup", items: rowCells("alpha"), flowCols: 4, render: RENDER },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/β.svg", alt: "Beta (β)", heightPt: GLYPH_H },
  { kind: "heading", level: 2, text: "Beta" },
  { kind: "pictographGroup", items: rowCells("beta"), flowCols: 4, render: RENDER },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/γ.svg", alt: "Gamma (γ)", heightPt: GLYPH_H },
  { kind: "heading", level: 2, text: "Gamma" },
  { kind: "pictographGroup", items: rowCells("gamma"), flowCols: 4, render: RENDER },

  {
    kind: "prose",
    html:
      "Many of the pictographs in this guide are depicted with no thumb ends<br>" +
      "when categorizing. It is usually noted only during sequences.",
  },
  {
    kind: "prose",
    html:
      "Most sequences in this guide start with thumbs in for consistency.<br>" +
      "It’s equally valid to start any sequence from a different thumb orientation.",
  },
];
