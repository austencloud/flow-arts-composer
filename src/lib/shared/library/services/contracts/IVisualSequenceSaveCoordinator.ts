import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SaveResult } from "$lib/shared/library/domain/library-contract-types";
import type { PresentationIntent } from "$lib/shared/foundation/domain/models/presentation-intent";

export type VisualSequencePathShape = "arc" | "linear" | "concave";

export interface VisualSequenceSaveIntent {
  leftPropType?: string | null;
  rightPropType?: string | null;
  catDogModeEnabled?: boolean | null;
  pathShape?: VisualSequencePathShape;
  /**
   * Visual look captured from the live scene. Object = record it, null = the
   * creator chose the default look, key absent or undefined = leave whatever
   * is saved.
   */
  presentation?: PresentationIntent | null;
}

export type VisualSequenceSaveOutcome =
  | {
      status: "saved";
      contentHash: string;
      sequence: SequenceData;
      result: SaveResult;
    }
  | {
      status: "already-saved";
      contentHash: string;
      sequence: SequenceData;
    }
  | {
      status: "failed";
      error: unknown;
    };

export interface IVisualSequenceSaveCoordinator {
  save(
    sequence: SequenceData,
    intent?: VisualSequenceSaveIntent
  ): Promise<VisualSequenceSaveOutcome>;
}
