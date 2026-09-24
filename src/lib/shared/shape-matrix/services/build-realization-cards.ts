import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SVGPathData } from "$lib/shared/mandala/domain/mandala-types";
import type { ShapeMatrixTipPair } from "../domain/prop-pair";
import { loadDiamondEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
// prettier-ignore
import { bakeVariationFront, bakeVariationBack } from "$lib/features/lab/vtg-lab/services/resolve-rotation-style-matrices";
import { loadBaseIndex, resolveBase } from "./build-realization-sequence";
import { verifyAndCorrect } from "./verify-realization-parity";
import {
  MODE_ORDER,
  MODE_LABEL,
  type VtgMode,
} from "./shape-matrix-realizations";
import { type Flower } from "../domain/flower-signature";

/** The cell overlay loci a realization must reproduce, with each hand's tracked source. */
export interface CellOverlay {
  left: SVGPathData[];
  right: SVGPathData[];
  tips: ShapeMatrixTipPair;
}

// Staves hide orientation read on these single-hand flowers (both ends look
// alike); clubs have a single unambiguous tip, so the start-orientation of each
// realization is legible. Render the review cards with clubs on both hands.
const REVIEW_PROP = PropType.CLUB;

/** VTG mode → TnD family id (drives the card's elemental frame + tint). */
const FAMILY_BY_MODE: Record<VtgMode, string> = {
  SS: "split-same",
  TS: "tog-same",
  QS: "quarter-same",
  SO: "split-opp",
  TO: "tog-opp",
  QO: "quarter-opp",
};

export interface ModeCard {
  mode: VtgMode;
  modeLabel: string;
  /** The mode's base word, e.g. "FLFL" — surfaces both compound letters. */
  word: string;
  familyId: string;
  /** Elemental icon for this mode's family (water/earth/sun/fire/air/moon). */
  iconPath: string;
  /** Element name, e.g. "Fire" — pairs the mode label with its element. */
  element: string;
  /** Element accent color — tints the mode header. */
  accent: string;
  /** Sequence with the cell's turns + ori + grid applied — for the animation. */
  seq: SequenceData;
  /** Baked elemental deck-card front (PNG data URL), rendered with clubs. */
  frontUrl: string;
  /** Baked card back (PNG data URL), rendered with clubs. */
  backUrl: string;
  /** Realization's club mandala reproduces the cell overlay within tolerance. */
  matched: boolean;
  /** Worst per-hand loop distance to the overlay (px); 0 = exact parity. */
  maxDist: number;
}

/**
 * The six VTG-mode realizations of a cell, each as a real deck card. For every
 * mode (SS…QO) resolve the base word for the cell's style pair, then AUTO-CORRECT
 * the per-hand start orientation so the realization's club mandala reproduces the
 * cell overlay (the base word's grid anchors otherwise rotate a hand's locus —
 * `verify-realization-parity`). Bake the elemental card front/back with clubs and
 * carry the parity verdict so the UI flags any cell no orientation can match.
 * Shows the true base WORD (LFLF/FLFL, OROR/RORO …) so compound-letter pairs are
 * not collapsed. A mode whose base word or bake is missing is dropped, never
 * silently substituted.
 */
export async function buildModeCards(
  pair: { left: Flower; right: Flower },
  overlay: CellOverlay
): Promise<ModeCard[]> {
  const [idx, edges] = await Promise.all([loadBaseIndex(), loadDiamondEdges()]);

  const cards = await Promise.all(
    MODE_ORDER.map(async (mode): Promise<ModeCard | null> => {
      const base = resolveBase(
        idx,
        mode,
        pair.left.style === "float" ? "pro" : pair.left.style,
        pair.right.style === "float" ? "pro" : pair.right.style
      );
      if (!base) return null;
      const familyId = FAMILY_BY_MODE[mode];
      try {
        const parity = verifyAndCorrect(
          base,
          pair,
          overlay.left,
          overlay.right,
          edges,
          overlay.tips
        );
        const sequence = parity.sequence;
        const [frontUrl, backUrl] = await Promise.all([
          bakeVariationFront(sequence, familyId, REVIEW_PROP),
          bakeVariationBack(sequence, REVIEW_PROP),
        ]);
        const el = TND_BY_FAMILY[familyId];
        return {
          mode,
          modeLabel: MODE_LABEL[mode],
          word: (base.word ?? mode).toUpperCase(),
          familyId,
          iconPath: el?.iconPath ?? "",
          element: el?.name ?? "",
          accent: el?.accentColor ?? "#5fe0f2",
          seq: sequence,
          frontUrl,
          backUrl,
          matched: parity.matched,
          maxDist: Math.max(parity.leftDist, parity.rightDist),
        };
      } catch {
        return null;
      }
    })
  );
  return cards.filter((c): c is ModeCard => c !== null);
}
