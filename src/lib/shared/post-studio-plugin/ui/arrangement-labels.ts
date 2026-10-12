import type { TunnelLayerConfig } from "#lib/shared/animation-engine/domain/compose-types.js";
import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";

/** A layer's words: the sequence's word, else its name, else "Sequence". */
export function arrangementLayerName(layer: TunnelLayerConfig): string {
  return layer.sequence.word || layer.sequence.name || "Sequence";
}

/** A cell's words for a lane or a menu: its layers' words joined with "+". */
export function arrangementCellLabel(cell: ArrangementCell): string {
  return cell.layers.map(arrangementLayerName).join(" + ");
}
