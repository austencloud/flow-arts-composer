import type { GridJoin } from "@tka/tka-types";
import type { Letter } from "./letter";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export interface StepPairingData {
  readonly letter: Letter | null;
  readonly leftReversal: boolean;
  readonly rightReversal: boolean;
  readonly startPlacement: GridPlacement | null;
  readonly endPlacement: GridPlacement | null;
  /** The step's own grid join; absent follows the sequence, null is one grid. */
  readonly conjoined?: GridJoin | null;
  // Duration is NOT stored here - derived from solo prop steps
  // Blue's duration is authoritative when combining
}
