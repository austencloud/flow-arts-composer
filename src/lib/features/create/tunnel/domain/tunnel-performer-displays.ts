import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { copyOpsLabel } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { BuiltTunnelLayer } from "#lib/shared/sequence-viewer/tunnel/tunnel-layer-builder.js";

export interface TunnelPerformerDisplay {
  sequence: SequenceData | null;
  stageTransformLabel: string | null;
  generatedInstanceCount: number;
  stageArms: number[];
}

/**
 * What each authored performer's choreo card shows, built from the rendered
 * tunnel layers.
 *
 * The card's pictographs are the beats the performer actually dances on stage:
 * their pairing recipe plus the rotation or reflection of the formation
 * position they stand in. Without the formation part, a partner standing at
 * the 180° position looked like an exact copy of Performer 1 while the canvas
 * showed them turned around.
 *
 * A performer who appears more than once shows their first appearance. That is
 * the same appearance whose playhead moves the card's active-beat border, so a
 * staggered performer keeps the beat order and the border lands on the beat
 * they are dancing.
 */
export function resolveTunnelPerformerDisplays(
  layers: readonly Pick<
    BuiltTunnelLayer,
    "performerId" | "arm" | "sequence" | "formationOps"
  >[]
): Record<string, TunnelPerformerDisplay> {
  const displays: Record<string, TunnelPerformerDisplay> = {};
  for (const layer of layers) {
    const current = displays[layer.performerId];
    displays[layer.performerId] = {
      sequence: current?.sequence ?? layer.sequence,
      stageTransformLabel:
        current?.stageTransformLabel ??
        (layer.formationOps.length ? copyOpsLabel(layer.formationOps) : null),
      generatedInstanceCount: (current?.generatedInstanceCount ?? 0) + 1,
      stageArms: [...(current?.stageArms ?? []), layer.arm],
    };
  }
  return displays;
}
