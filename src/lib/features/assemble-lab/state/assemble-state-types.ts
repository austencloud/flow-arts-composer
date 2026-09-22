import type {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type {
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { BuilderPose } from "../services/builder-path-editor";
import type {
  AssembleHistoryDirection,
  AssembleHistoryTransition,
} from "../services/assemble-history-transition-planner";

export type BuilderPhase =
  | "idle"
  | "placing"
  | "building"
  | "animating"
  | "complete";

export interface BuilderStep {
  readonly startLocation: GridLocation;
  readonly endLocation: GridLocation;
  readonly rotationDirection: RotationDirection;
  readonly turnCount: number;
  readonly startOrientation: Orientation;
  readonly endOrientation: Orientation;
}

export type BuilderStartPose = BuilderPose;
export type BuilderStepEditMode = "replace";
export type AssembleDocumentChange =
  | { readonly type: "delete-step"; readonly index: number }
  | {
      readonly type: "move-step";
      readonly fromIndex: number;
      readonly toIndex: number;
    };

export interface AssembleStateHydration {
  readonly leftSteps: readonly BuilderStep[];
  readonly rightSteps: readonly BuilderStep[];
  readonly gridMode: GridMode;
  readonly startPoses: Partial<Record<HandSide, BuilderStartPose>>;
}

export interface AssembleStateOptions {
  onDocumentChange?: (change?: AssembleDocumentChange) => void;
  captureDocument?: () => unknown;
  restoreDocument?: (document: unknown) => void;
  onHistoryTransition?: (
    direction: AssembleHistoryDirection,
    label: string,
    from: AssembleSnapshot,
    to: AssembleSnapshot
  ) => void;
}

export interface AssembleState {
  readonly phase: BuilderPhase;
  readonly activeHand: HandSide;
  readonly gridMode: GridMode;
  readonly leftSteps: BuilderStep[];
  readonly rightSteps: BuilderStep[];
  readonly startPoses: Partial<Record<HandSide, BuilderStartPose>>;
  readonly currentPosition: GridLocation | null;
  readonly currentOrientation: Orientation;
  readonly rotationDirection: RotationDirection;
  readonly turnCount: number;
  readonly showOrientationArrow: boolean;
  readonly arrowOrientation: Orientation;
  readonly activeSteps: BuilderStep[];
  readonly stepCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  readonly historyTransition: AssembleHistoryTransition | null;
  readonly historyTransitionEpoch: number;
  readonly canFinishHand: boolean;
  readonly showCenter: boolean;
  readonly canChangeGridMode: boolean;
  readonly keyboardMode: boolean;
  readonly selectedStepIndex: number | null;
  readonly stepEditMode: BuilderStepEditMode | null;
  readonly canReorderSteps: boolean;
  readonly canReplaceSelectedStep: boolean;
  readonly candidateStartLocation: GridLocation | null;
  readonly candidateStartOrientation: Orientation;
  readonly candidateRotationDirection: RotationDirection;
  readonly candidateTurnCount: number;

  handlePointClick(location: GridLocation): void;
  finishHand(): void;
  undoStep(): boolean;
  redoStep(): boolean;
  clearHistory(): void;
  selectStep(index: number | null): void;
  deleteStepAt(index: number): void;
  deleteSelectedStep(): void;
  moveStep(fromIndex: number, toIndex: number): void;
  moveSelectedStep(direction: -1 | 1): void;
  beginReplaceSelectedStep(): void;
  cancelStepEdit(): void;
  beginExternalEdit(label: string): void;
  hydrateFromExternalSequence(
    snapshot: AssembleStateHydration,
    previousDocument: unknown,
    label?: string
  ): void;
  hydrateFromSequence(snapshot: AssembleStateHydration): void;
  reset(): void;
  setStartPoses(poses: Record<HandSide, BuilderStartPose>): void;
  setRotationDirection(dir: RotationDirection): void;
  setTurnCount(turns: number): void;
  setOrientation(ori: Orientation): void;
  setGridMode(mode: GridMode): void;
  setShowCenter(show: boolean): void;
  switchToHand(hand: HandSide): void;
  toggleKeyboardMode(): void;
  setAnimationCallback(
    cb: (step: BuilderStep, durationMs?: number) => Promise<void>
  ): () => void;
}

export interface AssembleSnapshot {
  readonly phase: Exclude<BuilderPhase, "animating">;
  readonly activeHand: HandSide;
  readonly gridMode: GridMode;
  readonly showCenter: boolean;
  readonly startPoses: Partial<Record<HandSide, BuilderStartPose>>;
  readonly leftSteps: BuilderStep[];
  readonly rightSteps: BuilderStep[];
  readonly currentPosition: GridLocation | null;
  readonly currentOrientation: Orientation;
  readonly rotationDirection: RotationDirection;
  readonly turnCount: number;
  readonly selectedStepIndex: number | null;
  readonly stepEditMode: BuilderStepEditMode | null;
  readonly document: unknown;
}
