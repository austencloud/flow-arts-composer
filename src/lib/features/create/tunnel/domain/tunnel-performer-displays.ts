import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
import { shiftStartPlacement } from "#lib/shared/create/services/sequence-transforms.js";
import { copyOpsLabel } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { BuiltTunnelLayer } from "#lib/shared/sequence-viewer/tunnel/tunnel-layer-builder.js";

export interface TunnelPerformerDisplay {
  sequence: SequenceData | null;
  stageTransformLabel: string | null;
  generatedInstanceCount: number;
  stageArms: number[];
  /**
   * How many steps the card's step 1 sits after the stage sequence's step 1.
   * The playhead reports beats in stage order, so the active-beat border
   * subtracts this before it lands on a card cell.
   */
  cardStepOffset: number;
}

type DisplayLayer = Pick<
  BuiltTunnelLayer,
  | "performerId"
  | "arm"
  | "sequence"
  | "formationOps"
  | "ops"
  | "stepOffset"
  | "speed"
>;

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
 * Stagger counts too. A performer who starts two steps later in the loop
 * dances base step 3 when Performer 1 dances step 1, so their card begins
 * there. `stepOffsetFor` returns the same offset the stage samples with
 * (relationship stagger plus any formation stagger on that arm); without it the
 * layer's own `stepOffset` is used.
 *
 * A performer who appears more than once shows their first appearance. That is
 * the same appearance whose playhead moves the card's active-beat border.
 */
export function resolveTunnelPerformerDisplays(
  layers: readonly DisplayLayer[],
  stepOffsetFor: (layer: DisplayLayer) => number = (layer) => layer.stepOffset
): Record<string, TunnelPerformerDisplay> {
  const displays: Record<string, TunnelPerformerDisplay> = {};
  for (const layer of layers) {
    const current = displays[layer.performerId];
    const first = current
      ? null
      : phaseShiftedCard(layer.sequence, stepOffsetFor(layer), layer.ops);
    displays[layer.performerId] = {
      sequence: current ? current.sequence : first!.sequence,
      stageTransformLabel:
        current?.stageTransformLabel ??
        (layer.formationOps.length ? copyOpsLabel(layer.formationOps) : null),
      generatedInstanceCount: (current?.generatedInstanceCount ?? 0) + 1,
      stageArms: [...(current?.stageArms ?? []), layer.arm],
      cardStepOffset: current ? current.cardStepOffset : first!.offset,
    };
  }
  return displays;
}

/** Map a playhead beat index (stage order) onto the performer card's cells. */
export function tunnelCardStepIndex(
  stageStepIndex: number,
  display: Pick<TunnelPerformerDisplay, "sequence" | "cardStepOffset"> | null
): number {
  const length = display?.sequence?.steps.length ?? 0;
  if (!display || length === 0 || display.cardStepOffset === 0) {
    return stageStepIndex;
  }
  return (
    (((stageStepIndex - display.cardStepOffset) % length) + length) % length
  );
}

function phaseShiftedCard(
  sequence: SequenceData,
  rawOffset: number,
  ops: DisplayLayer["ops"]
): { sequence: SequenceData; offset: number } {
  const length = sequence.steps.length;
  const offset =
    length > 0 ? ((Math.round(rawOffset) % length) + length) % length : 0;
  const rewound = ops.some((op) => op.kind === "rewind");
  if (offset === 0 && !rewound) return { sequence, offset: 0 };

  // A tunnel loops every sequence, so the step after the last is step 1 again
  // even when the source was not written as circular. Shift it as a loop, then
  // keep its own circular flag for the LOOP badge and metadata rail.
  const shifted =
    offset === 0
      ? sequence
      : {
          ...shiftStartPlacement({ ...sequence, isCircular: true }, offset + 1),
          isCircular: sequence.isCircular,
        };

  // The stored word describes the base step order. Re-read it from the steps
  // the card now shows; the base's intended word and display name no longer
  // spell this order.
  const {
    intendedWord: _intendedWord,
    displayName: _displayName,
    ...rest
  } = shifted;
  return {
    sequence: { ...rest, word: deriveWord(shifted) },
    offset,
  };
}
