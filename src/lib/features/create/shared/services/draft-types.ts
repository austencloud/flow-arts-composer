import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import type { ActiveCreateModule } from "#lib/shared/foundation/ui/ui-types.js";
import type { UndoHistoryEntry } from "./undo-manager.js";

export interface WorkspaceDraftState {
  currentSequence: SequenceData | null;
  selectedStartPlacement: StartPlacementData | null;
  hasStartPlacement: boolean;
  activeBuildSection: ActiveCreateModule;
}

export interface DraftHistory {
  undo: UndoHistoryEntry[];
  redo: UndoHistoryEntry[];
}

export interface DraftVersion {
  id: string;
  sessionId: string;
  mode: ActiveCreateModule;
  savedAt: number;
  workspace: WorkspaceDraftState;
  history?: DraftHistory;
}

export interface DraftStatus {
  status: "idle" | "saving" | "saved" | "error" | "recovery" | "conflict";
  savedAt: number | null;
  error: string | null;
  candidates: DraftVersion[];
  sessionId: string;
}
