import { SHEET1, SHEET2, type CodexSheetDef } from "../../../codex/_data/codex-groups";

// The Codex spans two printed pages (Types 1-2 on `codex`, Types 3-6 on
// `codex-2`). Each letter points at the page that actually renders it, so a
// scan / deep link lands on the right sheet.
export const GUIDE_CODEX_SLUG = "codex"; // page 1 - Types 1-2 (Double Staff)
export const GUIDE_CODEX_SLUG_2 = "codex-2"; // page 2 - Types 3-6
export const GUIDE_CODEX_SLUGS = [GUIDE_CODEX_SLUG, GUIDE_CODEX_SLUG_2] as const;

/** True for any manifest slug that renders a Codex sheet. */
export function isCodexSlug(slug: string): boolean {
  return (GUIDE_CODEX_SLUGS as readonly string[]).includes(slug);
}

export interface GuideContentTarget {
  /** Guide page slug (manifest id). */
  slug: string;
  /** Codex cell id to highlight/animate, when the content is a single letter. */
  cellKey?: string;
}

// Which sheet lives on which page - the single source that keeps the letter→slug
// map from ever drifting from the sheet a letter is actually rendered on.
const SHEET_SLUGS: [CodexSheetDef, string][] = [
  [SHEET1, GUIDE_CODEX_SLUG],
  [SHEET2, GUIDE_CODEX_SLUG_2],
];

// label ("A", "Σ", "W-") → { slug, cellKey: <codex id> }, built from the Codex
// sheets so this can never drift from the letters the codex renders.
// Enriched later per chapter by repointing specific labels to their chapter page.
const LABEL_TO_TARGET: Map<string, GuideContentTarget> = new Map(
  SHEET_SLUGS.flatMap(([sheet, slug]) =>
    sheet.types.flatMap((type) =>
      type.boxes.flatMap((box) =>
        box.cells.map((cell) => [cell.label, { slug, cellKey: cell.id }] as const)
      )
    )
  )
);

/** Guide destination for a single base letter (label as shown on cards/codex). */
export function guideTargetForLetter(label: string): GuideContentTarget | null {
  return LABEL_TO_TARGET.get(label) ?? null;
}
