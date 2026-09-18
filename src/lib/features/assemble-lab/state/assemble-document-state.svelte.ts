import {
  GridMode,
  type GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  BuilderPhase,
  BuilderStartPose,
  BuilderStep,
  BuilderStepEditMode,
} from "./assemble-state-types";

export interface AssembleDocumentState {
  phase: BuilderPhase;
  activeHand: HandSide;
  gridMode: GridMode;
  showCenter: boolean;
  keyboardMode: boolean;
  leftSteps: BuilderStep[];
  rightSteps: BuilderStep[];
  startPoses: Partial<Record<HandSide, BuilderStartPose>>;
  currentPosition: GridLocation | null;
  currentOrientation: Orientation;
  rotationDirection: RotationDirection;
  turnCount: number;
  selectedStepIndex: number | null;
  stepEditMode: BuilderStepEditMode | null;
  showOrientationArrow: boolean;
  arrowOrientation: Orientation;
  readonly activeSteps: BuilderStep[];
  readonly stepCount: number;
  readonly canFinishHand: boolean;
  readonly canChangeGridMode: boolean;
  readonly canReorderSteps: boolean;
  readonly canReplaceSelectedStep: boolean;
  readonly candidateStartLocation: GridLocation | null;
  readonly candidateStartOrientation: Orientation;
  readonly candidateRotationDirection: RotationDirection;
  readonly candidateTurnCount: number;

  poseForHand(hand: HandSide): BuilderStartPose | null;
  syncActiveCursor(): void;
}

export function cloneBuilderSteps(
  steps: readonly BuilderStep[]
): BuilderStep[] {
  return steps.map((step) => ({ ...step }));
}

export function cloneStartPoses(
  poses: Partial<Record<HandSide, BuilderStartPose>>
): Partial<Record<HandSide, BuilderStartPose>> {
  const next: Partial<Record<HandSide, BuilderStartPose>> = {};
  const left = poses[HandSide.LEFT];
  const right = poses[HandSide.RIGHT];
  if (left) next[HandSide.LEFT] = { ...left };
  if (right) next[HandSide.RIGHT] = { ...right };
  return next;
}

export function handLabel(hand: HandSide): string {
  return hand === HandSide.LEFT ? "Left" : "Right";
}

export function createAssembleDocumentState(): AssembleDocumentState {
  let phase = $state<BuilderPhase>("idle");
  let activeHand = $state<HandSide>(HandSide.LEFT);
  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let showCenter = $state(false);
  let keyboardMode = $state(false);
  let leftSteps = $state<BuilderStep[]>([]);
  let rightSteps = $state<BuilderStep[]>([]);
  let startPoses = $state<Partial<Record<HandSide, BuilderStartPose>>>({});
  let currentPosition = $state<GridLocation | null>(null);
  let currentOrientation = $state<Orientation>(Orientation.IN);
  let rotationDirection = $state<RotationDirection>(
    RotationDirection.CLOCKWISE
  );
  let turnCount = $state(0);
  let selectedStepIndex = $state<number | null>(null);
  let stepEditMode = $state<BuilderStepEditMode | null>(null);
  let showOrientationArrow = $state(false);
  let arrowOrientation = $state<Orientation>(Orientation.IN);

  const activeSteps = $derived(
    activeHand === HandSide.LEFT ? leftSteps : rightSteps
  );
  const stepCount = $derived(leftSteps.length + rightSteps.length);
  const canFinishHand = $derived(
    (phase === "building" || phase === "animating") &&
      leftSteps.length > 0 &&
      rightSteps.length > 0 &&
      leftSteps.length === rightSteps.length
  );
  const canChangeGridMode = $derived(
    leftSteps.length === 0 && rightSteps.length === 0
  );
  const canReorderSteps = $derived(
    leftSteps.length > 1 && leftSteps.length === rightSteps.length
  );
  const canReplaceSelectedStep = $derived(
    selectedStepIndex !== null &&
      selectedStepIndex >= 0 &&
      selectedStepIndex < activeSteps.length &&
      phase !== "animating" &&
      phase !== "complete"
  );
  const candidateStartLocation = $derived.by(() => {
    if (stepEditMode === "replace" && selectedStepIndex !== null) {
      return activeSteps[selectedStepIndex]?.startLocation ?? null;
    }
    return currentPosition;
  });
  const candidateStartOrientation = $derived.by(() => {
    if (stepEditMode === "replace" && selectedStepIndex !== null) {
      return (
        activeSteps[selectedStepIndex]?.startOrientation ?? currentOrientation
      );
    }
    return currentOrientation;
  });
  const candidateRotationDirection = $derived.by(() => {
    if (stepEditMode === "replace" && selectedStepIndex !== null) {
      return (
        activeSteps[selectedStepIndex]?.rotationDirection ?? rotationDirection
      );
    }
    return rotationDirection;
  });
  const candidateTurnCount = $derived.by(() => {
    if (stepEditMode === "replace" && selectedStepIndex !== null) {
      return activeSteps[selectedStepIndex]?.turnCount ?? turnCount;
    }
    return turnCount;
  });

  function poseForHand(hand: HandSide): BuilderStartPose | null {
    const pose = startPoses[hand];
    if (pose) return pose;
    const steps = hand === HandSide.LEFT ? leftSteps : rightSteps;
    const first = steps[0];
    return first
      ? {
          location: first.startLocation,
          orientation: first.startOrientation,
        }
      : null;
  }

  function syncActiveCursor(): void {
    const steps = activeHand === HandSide.LEFT ? leftSteps : rightSteps;
    const last = steps[steps.length - 1];
    if (last) {
      currentPosition = last.endLocation;
      currentOrientation = last.endOrientation;
      phase = "building";
      return;
    }

    const pose = poseForHand(activeHand);
    if (pose) {
      currentPosition = pose.location;
      currentOrientation = pose.orientation;
      phase = "placing";
      return;
    }

    currentPosition = null;
    currentOrientation = Orientation.IN;
    phase = "idle";
  }

  return {
    get phase() {
      return phase;
    },
    set phase(value) {
      phase = value;
    },
    get activeHand() {
      return activeHand;
    },
    set activeHand(value) {
      activeHand = value;
    },
    get gridMode() {
      return gridMode;
    },
    set gridMode(value) {
      gridMode = value;
    },
    get showCenter() {
      return showCenter;
    },
    set showCenter(value) {
      showCenter = value;
    },
    get keyboardMode() {
      return keyboardMode;
    },
    set keyboardMode(value) {
      keyboardMode = value;
    },
    get leftSteps() {
      return leftSteps;
    },
    set leftSteps(value) {
      leftSteps = value;
    },
    get rightSteps() {
      return rightSteps;
    },
    set rightSteps(value) {
      rightSteps = value;
    },
    get startPoses() {
      return startPoses;
    },
    set startPoses(value) {
      startPoses = value;
    },
    get currentPosition() {
      return currentPosition;
    },
    set currentPosition(value) {
      currentPosition = value;
    },
    get currentOrientation() {
      return currentOrientation;
    },
    set currentOrientation(value) {
      currentOrientation = value;
    },
    get rotationDirection() {
      return rotationDirection;
    },
    set rotationDirection(value) {
      rotationDirection = value;
    },
    get turnCount() {
      return turnCount;
    },
    set turnCount(value) {
      turnCount = value;
    },
    get selectedStepIndex() {
      return selectedStepIndex;
    },
    set selectedStepIndex(value) {
      selectedStepIndex = value;
    },
    get stepEditMode() {
      return stepEditMode;
    },
    set stepEditMode(value) {
      stepEditMode = value;
    },
    get showOrientationArrow() {
      return showOrientationArrow;
    },
    set showOrientationArrow(value) {
      showOrientationArrow = value;
    },
    get arrowOrientation() {
      return arrowOrientation;
    },
    set arrowOrientation(value) {
      arrowOrientation = value;
    },
    get activeSteps() {
      return activeSteps;
    },
    get stepCount() {
      return stepCount;
    },
    get canFinishHand() {
      return canFinishHand;
    },
    get canChangeGridMode() {
      return canChangeGridMode;
    },
    get canReorderSteps() {
      return canReorderSteps;
    },
    get canReplaceSelectedStep() {
      return canReplaceSelectedStep;
    },
    get candidateStartLocation() {
      return candidateStartLocation;
    },
    get candidateStartOrientation() {
      return candidateStartOrientation;
    },
    get candidateRotationDirection() {
      return candidateRotationDirection;
    },
    get candidateTurnCount() {
      return candidateTurnCount;
    },
    poseForHand,
    syncActiveCursor,
  };
}
