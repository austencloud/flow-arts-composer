/**
 * The single-source content model for a Level-1 guide page. ONE `GuideBlock[]`
 * per migrated page is rendered by BOTH frames: SheetFrame positions each block
 * at its `sheet` pt hint (print-faithful), FlowFrame ignores the hint and stacks
 * blocks in reading order (mobile, crawlable). Spec:
 * docs/superpowers/specs/2026-07-14-guide-reflow-single-source-design.md.
 *
 * pt = the proof PDF's own points; the sheet is 612pt × 792pt (8.5×11in), and
 * SheetFrame multiplies by S = 816/612 to reach the 816×1056px on-screen sheet.
 */
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/**
 * Flow-view render hints for a pictograph / pictographGroup. FlowFrame reads these
 * to render each figure the way its source _pages component does (prop family +
 * which system adornments to show). SheetFrame ignores them - the sheet uses its
 * own print flags. Every field is optional and defaults to FlowFrame's prior
 * hardcoded behavior (HAND props, TKA glyph on, every other layer off), so
 * existing pages (hand-placements) are unchanged.
 */
export type PictographRender = {
  /** Prop family. HAND (default) for position/motion pages, STAFF for letter/word/LOOP pages. */
  propType?: PropType;
  /** Bottom-left TKA letter glyph. Default true (letter/word pages want it; letterless positions show nothing). */
  showTKA?: boolean;
  /** Top-centre start→end PlacementGlyph. Default false. */
  showPlacements?: boolean;
  /** Bottom-right elemental glyph, derived from the motions. Default false. */
  showElemental?: boolean;
  /** Prop-reversal dots (leftReversal/rightReversal). Default false; the LOOP/reversal pages set it true. */
  showReversals?: boolean;
  /** Non-radial grid points. Default false. */
  showNonRadialPoints?: boolean;
};

/**
 * One curated example in a showcase pool: its word, a semantic loop label
 * ("Mirrored", "Rotated 180°", …), the example-specific prose, and the built
 * pictograph strip (start box + steps). Entry 0 is the slot's original print
 * example; entries 1..N come from the example-pool adapter. The type lives here
 * (the content-model hub) so the adapter and SequenceShowcase share it without
 * a runtime dependency on either. Spec:
 * docs/superpowers/specs/2026-07-16-guide-example-pools-design.md.
 */
export type PoolEntry = {
  word: string;
  loopLabel: string;
  proseHtml: string;
  items: PictographData[];
};

/** A block's position on the print sheet, in PDF points. Only SheetFrame reads it. */
export type PtHint = {
  x: number;
  y: number;
  /** Width in pt (text wrap / element width). Optional - full-width prose omits it. */
  w?: number;
  /** Height in pt (drives font-size for text runs on the sheet). */
  h?: number;
  /** Font size in pt for prose/heading runs (sheet only; flow uses editorial sizing). */
  fontSize?: number;
  /** Line height in pt for multi-line prose runs (sheet only). */
  lineHeight?: number;
  /** Horizontal alignment on the sheet; defaults to "center". */
  align?: "left" | "center" | "right";
};

/** Grid geometry for a pictograph group on the sheet (e.g. the 16 positions). */
export type SheetGrid = {
  /** Left x of each column, in pt. */
  cols: number[];
  /** Top y of each row, in pt. */
  rows: number[];
  /** Square cell size in pt. */
  cell: number;
  /** Row index per item, parallel to `items`. */
  rowFor: number[];
};

export type GuideFlowArea =
  | "grid-overview"
  | "grid-hands"
  | "grid-points"
  | "grid-combination"
  | "grid-explorer"
  | "grid-closing";

type GuideBlockContent =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; sheet?: PtHint }
  | { kind: "prose"; html: string; sheet?: PtHint }
  | {
      kind: "glyphImage";
      src: string;
      alt: string;
      heightPt: number;
      sheet?: PtHint;
    }
  | { kind: "rule"; sheet: PtHint }
  | {
      kind: "pictograph";
      data: PictographData;
      caption?: string;
      render?: PictographRender;
      sheet?: PtHint;
    }
  | {
      kind: "pictographGroup";
      /** Real pictographs, in reading order. */
      items: PictographData[];
      /** Optional per-group caption for the flow list. */
      caption?: string;
      /** Sheet grid geometry (SheetFrame lays the items out with this). */
      grid?: SheetGrid;
      /** Flow layout: responsive column count for FlowFrame's grid mode. */
      flowCols?: number;
      /**
       * Flow layout mode. "strip" = one horizontal, left-to-right sequence row
       * (scrolls on narrow screens) - the faithful mobile form of the sheet's
       * step strips, for groups that ARE a sequence (start → steps). "grid"
       * (default when omitted) = the wrap grid, for galleries of independent
       * pictographs. Set "strip" per-group where the source page draws a strip.
       */
      layout?: "strip" | "grid";
      /**
       * Optional labels rendered above each strip cell (parallel to `items`),
       * e.g. ["Start", "1", "2", "3", "4"]. Strip mode only; omit to let the
       * baked-in letter glyphs identify each step.
       */
      stepLabels?: string[];
      /**
       * Render this sequence as a SequenceShowcase: a banner (square live
       * animation beside the section's text) with the steps unrolled as one
       * full-width strip beneath. For groups that are a genuine sequence/word/
       * LOOP. The strip + text prerender (crawlable); only the animation is
       * client-rendered. A lone card absorbs its section text into the banner;
       * consecutive cards stack as showcases with their own word + caption.
       * Galleries of independent letters/positions leave this off.
       * Spec: docs/superpowers/specs/2026-07-16-sequence-showcase-design.md.
       */
      card?: boolean;
      /**
       * Refreshable example pool. When present, the showcase seeds the strip +
       * animation from `entries[0]` (the original print example, which
       * prerenders) and lets the reader cycle to `entries[1..N]` (client-side on
       * demand). Each entry carries its own example-specific prose. Only set on
       * `card: true` groups whose example is an arbitrary instance of a pattern.
       * Spec: docs/superpowers/specs/2026-07-16-guide-example-pools-design.md.
       */
      pool?: { entries: PoolEntry[] };
      /**
       * Playable strip when it differs from the DISPLAY `items`. Some motion
       * breakdowns show more frames than the animation needs - e.g. a
       * start/end/combined triptych (staff-motions) or a start/halfway/end/
       * combined quad (a Cross-Shift breakdown): only the start pose and the
       * combined full-motion step are a real playable pair, the intermediate
       * frames are poses with no `stepNumber` of their own. When present, the
       * canvas plays `stripToSequence(sequenceItems)` while the strip still
       * renders `items` unchanged. Omit when `items` already form a playable
       * sequence (a normal Start+steps strip) - the common case.
       */
      sequenceItems?: PictographData[];
      /** Flow render hints (prop family + which system adornments to show). */
      render?: PictographRender;
      sheet?: PtHint;
    }
  | {
      /** A grid diagram (diamond / box / combined 8-point) as a standalone figure -
       *  the canonical GridSvg on a white square, points-only. Flow-only (The Grid
       *  page); the sheet renders its own hand-authored diagram. */
      kind: "gridFigure";
      mode: "diamond" | "box" | "merged";
      caption?: string;
    }
  | {
      /**
       * A compact, inspectable grid-mode comparison for the web reference.
       * FlowFrame delegates the visuals to the canonical GridSvg owner. The
       * authored print page keeps its measured three-figure composition.
       */
      kind: "gridExplorer";
      modes: {
        mode: "diamond" | "box" | "merged";
        label: string;
        ariaLabel: string;
      }[];
      initialMode: "diamond" | "box" | "merged";
    }
  | {
      /** Bespoke print artifact (flattened raster / measured vector). Sheet renders
       *  `sheetHtml`; flow renders the semantic `flow` fallback. */
      kind: "printOnly";
      sheetHtml: string;
      flow: GuideBlock[];
      sheet: PtHint;
    };

export type GuideBlock = GuideBlockContent & {
  /** Optional semantic placement used by a named FlowFrame composition. */
  flowArea?: GuideFlowArea;
};

/** Concatenated human-readable text of a page's prose + headings - the drift-guard
 *  input. Strips HTML tags so `<strong>`/`<span>` markup doesn't affect equality. */
export function blockProseText(blocks: GuideBlock[]): string {
  const strip = (html: string) =>
    html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "heading") out.push(strip(b.text));
    else if (b.kind === "prose") out.push(strip(b.html));
    else if (b.kind === "printOnly") out.push(blockProseText(b.flow));
  }
  return out.filter(Boolean).join(" ");
}
