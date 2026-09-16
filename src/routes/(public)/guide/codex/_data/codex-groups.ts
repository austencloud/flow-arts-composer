// Declarative structure for the printable Double-Staff Codex sheets.
//
// Cell pictograph data comes from the same dataset the in-app guide Codex uses
// (`guide/level-1/_data/letters.json`, keyed `"A-0"`). Transition labels
// (α→α, Γ→β…) are DERIVED from each pictograph's start/end placement so a box's
// header can never drift from the letters rendered inside it. Box arrangement,
// OPEN/CLOSE tags, and Greek names are design choices matched to the reference
// artboards (`1.1 - Base Letters - Double Staff`).

import lettersData from "../../level-1/_data/letters.json";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

const pictographs = (
  lettersData as unknown as { pictographs: Record<string, PictographData> }
).pictographs;

const PLACEMENT_GLYPH: Record<string, string> = { alpha: "α", beta: "β", gamma: "γ" };

function placementBase(p: unknown): string {
  const s = String(p ?? "");
  return PLACEMENT_GLYPH[s.replace(/[0-9]/g, "")] ?? s;
}

/** "α→α" derived from the pictograph's own start/end placement. */
export function transitionFor(id: string): string {
  const d = pictographs[id];
  if (!d?.startPlacement || !d?.endPlacement) return "";
  return `${placementBase(d.startPlacement)}→${placementBase(d.endPlacement)}`;
}

/** Wrap raw letters.json motions through createMotionData so that
 *  arrowPlacementData and propPlacementData are filled with valid defaults.
 *  Without this, pictograph-preparer's `if (!motion.propPlacementData) return`
 *  guard skips every prop and arrow, leaving grid-only pictographs.
 *
 *  The codex is the base-letter reference, which is canonically 0 turns -
 *  letters.json happens to bake in 1 turn, so we normalize to 0 here. This is
 *  the single 0-turns baseline every codex surface shares (this reader page,
 *  the /guide/codex print route, the poster, and Choreo Card codex printing) so
 *  the printable and interactive artifacts are identical; the interactive
 *  reader layers its own live turn state on top.
 *
 *  Zeroing is a plain field set (not the heavy canonical apply-turns service):
 *  this module is imported by prerendered routes and the whole app's codex
 *  surfaces, so it must stay dependency-light - pulling the create-services
 *  graph in here wedges the SSR module graph. `createMotionData` recomputes end
 *  orientation from turns=0, and the pictograph-preparer re-keys placement to
 *  the turn-0 lookups at render time, so a base radial letter resolves cleanly. */
export function codexData(id: string): PictographData | null {
  const d = pictographs[id];
  if (!d) return null;
  const { left, right } = d.motions;
  if (!left || !right) return d;
  return {
    ...d,
    motions: {
      left: createMotionData({ ...left, turns: 0 }),
      right: createMotionData({ ...right, turns: 0 }),
    },
  };
}

export type CellMode = "OPEN" | "CLOSE";

export interface CodexCellDef {
  id: string;
  label: string;
  name?: string; // Greek/placement name shown under the letter (Sigma, Alpha…)
  top?: string; // per-cell transition header (Type 4/5/6)
}

export interface CodexBoxDef {
  header?: string; // shared box transition header (Type 1/2/3)
  mode?: CellMode; // OPEN / CLOSE tag
  full?: boolean; // span both columns, centered (S-T-U-V row, Types 4/5/6)
  cells: CodexCellDef[];
}

export interface TypeSeg {
  t: string;
  c: string;
}

export interface CodexTypeDef {
  n: number;
  word: string; // plain leading word, e.g. "Static"
  segs: TypeSeg[]; // colored emphasis segments
  boxes: CodexBoxDef[];
  divider?: boolean; // hairline rule above this type
}

export interface CodexSheetDef {
  title?: string;
  types: CodexTypeDef[];
}

// Type-name accent colors (matched to the reference artboards).
const TEAL = "#22b8cf";
const GREEN = "#2f9e44";
const PURPLE = "#7048b6";
const ORANGE = "#e8590c";

/** Grouped box: one shared header derived from the first cell's transition. */
function gbox(cells: CodexCellDef[], mode?: CellMode, full?: boolean): CodexBoxDef {
  return { header: transitionFor(cells[0]!.id), mode, full, cells };
}

/** Same grouped box, no header - the OG sheet labels a repeated transition
 *  (γ→γ) only on the row's first box and leaves the rest unlabeled. */
function gboxUnlabeled(cells: CodexCellDef[], mode?: CellMode, full?: boolean): CodexBoxDef {
  return { mode, full, cells };
}

/** Per-cell box: each cell carries its own derived transition header. */
function cbox(cells: CodexCellDef[], full?: boolean): CodexBoxDef {
  return { full, cells: cells.map((c) => ({ ...c, top: transitionFor(c.id) })) };
}

/** Static box (Type 6): the placement never changes, so each cell's header is
 *  the single placement glyph ("α"), not a degenerate "α→α" transition -
 *  matching the original guide sheet. */
function sbox(cells: CodexCellDef[], full?: boolean): CodexBoxDef {
  return {
    full,
    cells: cells.map((c) => ({ ...c, top: transitionFor(c.id).split("→")[0] ?? "" })),
  };
}

const c = (id: string, label: string, name?: string): CodexCellDef => ({ id, label, name });

export const SHEET1: CodexSheetDef = {
  title: "Double Staff",
  types: [
    {
      n: 1,
      word: "Type 1: ",
      segs: [
        { t: "Dual", c: TEAL },
        { t: "-Shift", c: PURPLE },
      ],
      boxes: [
        gbox([c("A-0", "A"), c("B-0", "B"), c("C-0", "C")]),
        gbox([c("D-0", "D"), c("E-0", "E"), c("F-0", "F")]),
        gbox([c("G-0", "G"), c("H-0", "H"), c("I-0", "I")]),
        gbox([c("J-0", "J"), c("K-0", "K"), c("L-0", "L")]),
        gbox([c("M-0", "M"), c("N-0", "N"), c("O-0", "O")]),
        // OG parity: γ→γ is labeled once (on M/N/O); the same-transition P/Q/R
        // box and the full-width S-V box carry no label.
        gboxUnlabeled([c("P-0", "P"), c("Q-0", "Q"), c("R-0", "R")]),
        gboxUnlabeled([c("S-0", "S"), c("T-0", "T"), c("U-0", "U"), c("V-0", "V")], undefined, true),
      ],
    },
    {
      n: 2,
      word: "Type 2: ",
      segs: [{ t: "Shift", c: PURPLE }],
      divider: true,
      boxes: [
        gbox([c("W-0", "W"), c("X-0", "X")], "OPEN"),
        gbox([c("Y-0", "Y"), c("Z-0", "Z")], "CLOSE"),
        gbox([c("Σ-0", "Σ", "Sigma"), c("Δ-0", "Δ", "Delta")], "CLOSE"),
        gbox([c("Θ-0", "Θ", "Theta"), c("Ω-0", "Ω", "Omega")], "OPEN"),
      ],
    },
  ],
};

export const SHEET2: CodexSheetDef = {
  types: [
    {
      n: 3,
      word: "Type 3: ",
      segs: [
        { t: "Cross", c: GREEN },
        { t: "-Shift", c: PURPLE },
      ],
      boxes: [
        gbox([c("W--0", "W-"), c("X--0", "X-")]),
        gbox([c("Y--0", "Y-"), c("Z--0", "Z-")]),
        // The printed guide put Σ-/Δ- left under an α→γ caption, which the
        // dataframe contradicts (Σ-/Δ- are β→γ; Θ-/Ω- are α→γ). Decision
        // 2026-08-23: keep the guide's FAMILY placement (Σ-/Δ- left, Θ-/Ω-
        // right) and let the derived captions carry the data-true transitions.
        gbox([c("Σ--0", "Σ-"), c("Δ--0", "Δ-")]),
        gbox([c("Θ--0", "Θ-"), c("Ω--0", "Ω-")]),
      ],
    },
    {
      n: 4,
      word: "Type 4: ",
      segs: [{ t: "Dash", c: GREEN }],
      divider: true,
      boxes: [cbox([c("Φ-0", "Φ"), c("Ψ-0", "Ψ"), c("Λ-0", "Λ")], true)],
    },
    {
      n: 5,
      word: "Type 5: ",
      segs: [
        { t: "Dual", c: TEAL },
        { t: "-Dash", c: GREEN },
      ],
      divider: true,
      boxes: [cbox([c("Φ--0", "Φ-"), c("Ψ--0", "Ψ-"), c("Λ--0", "Λ-")], true)],
    },
    {
      n: 6,
      word: "Type 6: ",
      segs: [{ t: "Static", c: ORANGE }],
      divider: true,
      boxes: [
        sbox(
          [c("α-0", "α", "Alpha"), c("β-0", "β", "Beta"), c("γ-0", "γ", "Gamma")],
          true,
        ),
      ],
    },
  ],
};

export const SHEETS: CodexSheetDef[] = [SHEET1, SHEET2];
