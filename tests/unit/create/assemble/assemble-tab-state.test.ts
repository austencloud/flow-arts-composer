import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssembleTabState } from "$lib/features/create/shared/state/assemble-tab-state.svelte";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
  SkewDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

vi.mock("$lib/shared/gamification/get-prop-unlock-manager", () => ({
  getPropUnlockManager: () => ({ recordCreation: vi.fn() }),
}));

vi.mock("$lib/shared/pictograph/shared/services/motion-query-handler", () => ({
  motionQueryHandler: {
    findLetterByMotionConfiguration: vi.fn(async () => Letter.A),
  },
}));

const states: ReturnType<typeof createAssembleTabState>[] = [];
const sequenceRepository = {} as SequenceRepository;

function makeBlueSequence(): SequenceData {
  const left = createMotionData({
    hand: HandSide.LEFT,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.CLOCK,
    gridMode: GridMode.DIAMOND,
    pathShape: "concave",
    isVisible: true,
  });
  const startBlue = createMotionData({
    ...left,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    endLocation: left.startLocation,
    endOrientation: left.startOrientation,
    turns: 0,
  });
  const startPlacement = createStartPlacementData({
    id: "assemble-start",
    gridMode: GridMode.DIAMOND,
    motions: { [HandSide.LEFT]: startBlue },
  });

  return {
    id: "assemble-sequence",
    name: "Assemble Sequence",
    word: "",
    steps: [
      createStepData({
        id: "assemble-step-1",
        motions: { [HandSide.LEFT]: left },
        stepNumber: 1,
        duration: 2,
      }),
    ],
    startPlacement,
    startingPlacement: startPlacement,
    thumbnails: [],
    gridMode: GridMode.DIAMOND,
    isFavorite: false,
    isCircular: false,
    metadata: {},
    tags: [],
  };
}

function makeTwoStepBlueSequence(): SequenceData {
  const sequence = makeBlueSequence();
  const first = sequence.steps[0]!;
  const secondBlue = createMotionData({
    ...first.motions.left,
    startLocation: GridLocation.EAST,
    endLocation: GridLocation.SOUTH,
    startOrientation: first.motions.left.endOrientation,
    endOrientation: Orientation.OUT,
  });
  return {
    ...sequence,
    steps: [
      first,
      createStepData({
        id: "assemble-step-2",
        motions: { [HandSide.LEFT]: secondBlue },
        stepNumber: 2,
        duration: 7,
      }),
    ],
  };
}

afterEach(() => {
  for (const state of states.splice(0)) state.destroy();
});

describe("Assemble tab document synchronization", () => {
  it("keeps sequence-editor metadata and rehydrates core motion edits", async () => {
    const tabState = createAssembleTabState(sequenceRepository);
    states.push(tabState);
    const sequenceState = tabState.sequenceState!;
    const initial = makeBlueSequence();

    sequenceState.setCurrentSequence(initial);
    expect(tabState.assembleBuilderState.leftSteps).toHaveLength(1);
    expect(tabState.assembleBuilderState.leftSteps[0]?.endLocation).toBe(
      GridLocation.EAST
    );

    const editedBlue = {
      ...initial.steps[0]!.motions.left,
      endLocation: GridLocation.SOUTH,
      endOrientation: Orientation.OUT,
    };
    const editedStep = {
      ...initial.steps[0]!,
      duration: 3,
      motions: { ...initial.steps[0]!.motions, left: editedBlue },
    };
    sequenceState.setCurrentSequence({ ...initial, steps: [editedStep] });

    expect(tabState.assembleBuilderState.leftSteps[0]?.endLocation).toBe(
      GridLocation.SOUTH
    );
    await Promise.resolve();
    expect(sequenceState.currentSequence?.steps[0]?.duration).toBe(3);
    expect(
      sequenceState.currentSequence?.steps[0]?.motions.left.pathShape
    ).toBe("concave");
    await Promise.resolve();
    expect(tabState.assembleBuilderState.canUndo).toBe(true);

    expect(tabState.undo()).toBe(true);
    expect(sequenceState.currentSequence?.steps[0]?.duration).toBe(2);
    expect(sequenceState.animationState.historyTransition).toEqual(
      expect.objectContaining({ direction: "undo", kind: "content" })
    );
    expect(tabState.assembleBuilderState.leftSteps[0]?.endLocation).toBe(
      GridLocation.EAST
    );

    expect(tabState.redo()).toBe(true);
    expect(sequenceState.currentSequence?.steps[0]?.duration).toBe(3);
    expect(sequenceState.animationState.historyTransition).toEqual(
      expect.objectContaining({ direction: "redo", kind: "content" })
    );
    expect(tabState.assembleBuilderState.leftSteps[0]?.endLocation).toBe(
      GridLocation.SOUTH
    );

    tabState.assembleBuilderState.handlePointClick(GridLocation.WEST);
    tabState.assembleBuilderState.handlePointClick(GridLocation.SOUTH);
    await vi.waitFor(() => {
      expect(
        sequenceState.currentSequence?.steps[0]?.motions.right.isVisible
      ).toBe(true);
    });
    await vi.waitFor(() => {
      expect(sequenceState.currentSequence?.steps[0]?.letter).toBe(Letter.A);
    });
    expect(tabState.assembleBuilderState.activeHand).toBe(HandSide.RIGHT);
    expect(sequenceState.currentSequence?.steps[0]?.duration).toBe(3);
    expect(
      sequenceState.currentSequence?.steps[0]?.motions.left.pathShape
    ).toBe("concave");
  });

  it("regenerates route-derived metadata after a path edit", async () => {
    const tabState = createAssembleTabState(sequenceRepository);
    states.push(tabState);
    const sequenceState = tabState.sequenceState!;
    const initial = makeBlueSequence();
    const initialStep = initial.steps[0]!;
    const markedBlue = createMotionData({
      ...initialStep.motions.left,
      arrowLocation: GridLocation.SOUTHWEST,
      segment: { t0: 0, t1: 0.5 },
      skewSteps: 2,
      skewDir: SkewDirection.PLUS,
    });
    const markedStep = {
      ...initialStep,
      motions: { ...initialStep.motions, left: markedBlue },
    };
    sequenceState.setCurrentSequence({ ...initial, steps: [markedStep] });

    sequenceState.setCurrentSequence({
      ...initial,
      steps: [
        {
          ...markedStep,
          motions: {
            ...markedStep.motions,
            left: {
              ...markedBlue,
              endLocation: GridLocation.SOUTH,
              endOrientation: Orientation.OUT,
            },
          },
        },
      ],
    });

    tabState.assembleBuilderState.handlePointClick(GridLocation.WEST);
    tabState.assembleBuilderState.handlePointClick(GridLocation.SOUTH);

    await vi.waitFor(() => {
      expect(
        sequenceState.currentSequence?.steps[0]?.motions.right.isVisible
      ).toBe(true);
    });
    const rebuilt = sequenceState.currentSequence?.steps[0]?.motions.left;
    expect(rebuilt?.arrowLocation).toBe(GridLocation.EAST);
    expect(rebuilt?.segment).toBeUndefined();
    expect(rebuilt?.skewSteps).toBeNull();
    expect(rebuilt?.skewDir).toBeNull();
    expect(rebuilt?.pathShape).toBe("concave");
  });

  it("hydrates persisted progress before the builder can publish an empty document", async () => {
    const saved = makeBlueSequence();
    const persister = {
      initialize: vi.fn(async () => undefined),
      loadCurrentState: vi.fn(async () => ({
        currentSequence: saved,
        selectedStartPlacement: saved.startPlacement ?? null,
        hasStartPlacement: true,
        activeBuildSection: "assemble" as const,
      })),
      saveCurrentState: vi.fn(async () => undefined),
    } as unknown as SequencePersister;
    const tabState = createAssembleTabState(sequenceRepository, persister);
    states.push(tabState);

    await tabState.initializeAssembleTab();

    expect(tabState.sequenceState?.currentSequence?.id).toBe(saved.id);
    expect(tabState.sequenceState?.currentSequence?.steps).toHaveLength(1);
    expect(tabState.assembleBuilderState.leftSteps).toHaveLength(1);
    expect(tabState.assembleBuilderState.leftSteps[0]?.endLocation).toBe(
      GridLocation.EAST
    );
  });

  it("keeps an editor deletion deleted and rebuilds from the remaining start pose", () => {
    const tabState = createAssembleTabState(sequenceRepository);
    states.push(tabState);
    const sequenceState = tabState.sequenceState!;
    const initial = makeBlueSequence();

    sequenceState.setCurrentSequence(initial);
    sequenceState.removeStep(0);

    expect(sequenceState.currentSequence?.steps).toHaveLength(0);
    expect(tabState.assembleBuilderState.leftSteps).toHaveLength(0);
    expect(tabState.assembleBuilderState.phase).toBe("placing");

    tabState.assembleBuilderState.handlePointClick(GridLocation.SOUTH);
    expect(sequenceState.currentSequence?.steps).toHaveLength(1);
    expect(
      sequenceState.currentSequence?.steps[0]?.motions.left.startLocation
    ).toBe(GridLocation.NORTH);
    expect(
      sequenceState.currentSequence?.steps[0]?.motions.left.endLocation
    ).toBe(GridLocation.SOUTH);
  });

  it("carries step metadata through builder deletion, undo, and redo", () => {
    const tabState = createAssembleTabState(sequenceRepository);
    states.push(tabState);
    const sequenceState = tabState.sequenceState!;
    sequenceState.setCurrentSequence(makeTwoStepBlueSequence());

    tabState.assembleBuilderState.deleteStepAt(0);

    expect(sequenceState.currentSequence?.steps).toHaveLength(1);
    expect(sequenceState.currentSequence?.steps[0]?.duration).toBe(7);

    tabState.assembleBuilderState.undoStep();
    expect(
      sequenceState.currentSequence?.steps.map((step) => step.duration)
    ).toEqual([2, 7]);

    tabState.assembleBuilderState.redoStep();
    expect(sequenceState.currentSequence?.steps).toHaveLength(1);
    expect(sequenceState.currentSequence?.steps[0]?.duration).toBe(7);
  });

  it("keeps grid focus stable when an editor changes metadata only", async () => {
    const tabState = createAssembleTabState(sequenceRepository);
    states.push(tabState);
    const sequenceState = tabState.sequenceState!;
    const initial = makeBlueSequence();
    sequenceState.setCurrentSequence(initial);
    tabState.assembleBuilderState.selectStep(0);

    sequenceState.setCurrentSequence({
      ...initial,
      steps: [{ ...initial.steps[0]!, duration: 9 }],
    });
    await Promise.resolve();

    expect(tabState.assembleBuilderState.activeHand).toBe(HandSide.RIGHT);
    expect(tabState.assembleBuilderState.selectedStepIndex).toBe(0);
    expect(tabState.assembleBuilderState.phase).toBe("idle");
    expect(tabState.assembleBuilderState.undoLabel).toBe("Edit sequence");
  });

  it("groups a synchronous workspace batch into one history entry", async () => {
    const tabState = createAssembleTabState(sequenceRepository);
    states.push(tabState);
    const sequenceState = tabState.sequenceState!;
    const initial = makeBlueSequence();
    sequenceState.setCurrentSequence(initial);

    tabState.assembleBuilderState.beginExternalEdit("Batch Edit");
    sequenceState.setCurrentSequence({
      ...initial,
      steps: [{ ...initial.steps[0]!, duration: 4 }],
    });
    sequenceState.setCurrentSequence({
      ...initial,
      steps: [{ ...initial.steps[0]!, duration: 6 }],
    });
    await Promise.resolve();

    expect(tabState.assembleBuilderState.undoLabel).toBe("Batch Edit");
    expect(tabState.undo()).toBe(true);
    expect(sequenceState.currentSequence?.steps[0]?.duration).toBe(2);
    expect(tabState.assembleBuilderState.canUndo).toBe(false);
  });
});
