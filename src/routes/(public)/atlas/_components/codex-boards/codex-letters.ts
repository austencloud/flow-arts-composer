// Lookup tables derived from the canonical codex structure.
//
// codex-groups.ts owns the sheets, the boxes and the derived transitions. This
// module only flattens them into "given a letter id, what do I say about it",
// which every board and the inspector need for labels and captions. It adds no
// facts of its own.

import {
  SHEET1,
  SHEET2,
  transitionFor,
  type CodexBoxDef,
  type CodexCellDef,
  type CodexTypeDef,
} from "../../../codex/_data/codex-groups";

export interface CodexLetterInfo {
  id: string;
  label: string;
  name?: string;
  typeNumber: number;
  typeName: string;
  /** The type's own accent from the printed sheets. */
  typeColor: string;
  transition: string;
}

export const CODEX_TYPES: CodexTypeDef[] = [...SHEET1.types, ...SHEET2.types];

export function typeName(type: CodexTypeDef): string {
  return `${type.word}${type.segs.map((s) => s.t).join("")}`;
}

/** The trailing motion is the compact accent used by cells and inspectors. */
export function typeColor(type: CodexTypeDef): string {
  return type.segs.at(-1)?.c ?? "currentColor";
}

export const CODEX_LETTERS = new Map<string, CodexLetterInfo>();
export const CODEX_CELLS_BY_LABEL = new Map<string, CodexCellDef>();
for (const type of CODEX_TYPES) {
  for (const box of type.boxes) {
    for (const cell of box.cells) {
      if (CODEX_LETTERS.has(cell.id)) continue;
      CODEX_CELLS_BY_LABEL.set(cell.label, cell);
      CODEX_LETTERS.set(cell.id, {
        id: cell.id,
        label: cell.label,
        name: cell.name,
        typeNumber: type.n,
        typeName: typeName(type),
        typeColor: typeColor(type),
        transition: transitionFor(cell.id),
      });
    }
  }
}

export const CODEX_BY_LABEL = new Map(
  [...CODEX_LETTERS.values()].map((info) => [info.label, info])
);

/** Every box in sheet order, tagged with the type it belongs to. The flat
 *  boards (Atlas, Wall) flow these; the Sheets board never needs it because
 *  CodexSheet already owns that arrangement. */
export interface TaggedBox {
  box: CodexBoxDef;
  type: CodexTypeDef;
  key: string;
}

/** A printed box is one of two things: a GROUP that shares one transition (one
 *  header over A-B-C), or a STRIP whose cells each carry their own - the Type
 *  4/5/6 rows, where Φ, Ψ and Λ are three unrelated transitions that happen to
 *  sit side by side on the page.
 *
 *  On paper the strip's shared walls are the sheet's geometry and the reader
 *  takes them as such. On a flat board they read as a group, so three separate
 *  labels appear to caption one connected thing - and they attach differently
 *  than every label in Types 1-3, which sits over a box that IS one transition.
 *  Splitting a strip into one box per cell gives the whole board a single
 *  grammar: one box, one transition, one rule. The sheets board and print are
 *  untouched - they render CodexSheet, not this list. */
function splitStrip(tagged: TaggedBox): TaggedBox[] {
  if (!tagged.box.cells.some((cell) => cell.top)) return [tagged];
  return tagged.box.cells.map((cell, i) => {
    const { top, ...body } = cell;
    return {
      type: tagged.type,
      key: `${tagged.key}-${i}`,
      // Flat boards put every transition in the same reserved box header. The
      // printable sheet still receives the untouched per-cell caption above.
      box: { header: top, cells: [body] },
    };
  });
}

export const CODEX_BOXES: TaggedBox[] = CODEX_TYPES.flatMap((type) =>
  type.boxes.flatMap((box, i) =>
    splitStrip({ box, type, key: `${type.n}-${i}` })
  )
);

export function cellCount(box: CodexBoxDef): number {
  return box.cells.length;
}

/** One type and the boxes that belong to it, for boards that keep the sheet's
 *  organisation by type instead of flowing all 47 as one run. */
export interface CodexTypeBand {
  type: CodexTypeDef;
  boxes: TaggedBox[];
  cells: number;
}

export const CODEX_TYPE_BANDS: CodexTypeBand[] = CODEX_TYPES.map((type) => {
  const boxes = CODEX_BOXES.filter((b) => b.type === type);
  return {
    type,
    boxes,
    cells: boxes.reduce((n, b) => n + cellCount(b.box), 0),
  };
});

/** Types 1-3 carry 8 or more letters each, so each earns a full-width band.
 *  Types 4-6 carry three apiece - a full-width row for three cells is most of
 *  a band spent on nothing, so those three share one row. */
export const MAJOR_TYPE_BANDS = CODEX_TYPE_BANDS.filter((b) => b.cells >= 8);
export const MINOR_TYPE_BANDS = CODEX_TYPE_BANDS.filter((b) => b.cells < 8);
