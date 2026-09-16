import { describe, expect, it, vi } from "vitest";
import { createAssembleState } from "$lib/features/assemble-lab/state/assemble-state.svelte";
import { dispatchAssembleKeyboardAction } from "$lib/features/assemble-lab/services/assemble-keyboard-dispatcher";
import { resolveMotionType } from "$lib/features/assemble-lab/services/builder-step-converter";
import { calculateBuilderEndOrientation } from "$lib/features/assemble-lab/services/builder-motion-geometry";
import {
  calculateMotionType,
  calculateRotationDirection,
} from "$lib/features/create/assemble/services/hand-path-motion-calculator";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  HandMotionType,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

describe("Assemble state invariants", () => {
  async function addMotion(
    state: ReturnType<typeof createAssembleState>,
    destination: GridLocation
  ): Promise<void> {
    state.handlePointClick(destination);
    await vi.waitFor(() => expect(state.phase).toBe("building"));
  }

  it("does not complete until both hands have matching non-empty paths", async () => {
    const state = createAssembleState();

    state.finishHand();
    expect(state.phase).toBe("idle");

    state.handlePointClick(GridLocation.NORTH);
    state.handlePointClick(GridLocation.EAST);
    await vi.waitFor(() => expect(state.phase).toBe("building"));

    state.finishHand();
    expect(state.phase).toBe("building");
  });

  it("does not dispatch the keyboard finish action while completion is invalid", () => {
    const state = createAssembleState();
    const finish = vi.spyOn(state, "finishHand");

    dispatchAssembleKeyboardAction(state, { type: "finish" });

    expect(finish).not.toHaveBeenCalled();
    expect(state.phase).toBe("idle");
  });

  it("ignores hand switches while a motion animation is unresolved", async () => {
    let finishAnimation!: () => void;
    const state = createAssembleState();
    state.setAnimationCallback(
      () =>
        new Promise<void>((resolve) => {
          finishAnimation = resolve;
        })
    );

    state.handlePointClick(GridLocation.NORTH);
    state.handlePointClick(GridLocation.EAST);
    expect(state.phase).toBe("animating");

    state.switchToHand(HandSide.RIGHT);
    expect(state.activeHand).toBe(HandSide.LEFT);

    finishAnimation();
    await vi.waitFor(() => expect(state.phase).toBe("building"));
  });

  it("applies turn and rotation settings to the first motion", async () => {
    const state = createAssembleState();

    state.handlePointClick(GridLocation.NORTH);
    state.setRotationDirection(RotationDirection.COUNTER_CLOCKWISE);
    state.setTurnCount(1.5);
    state.handlePointClick(GridLocation.EAST);

    await vi.waitFor(() => expect(state.leftSteps).toHaveLength(1));
    expect(state.leftSteps[0]?.rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );
    expect(state.leftSteps[0]?.turnCount).toBe(1.5);
  });

  it("derives anti, float, and hash motion types from the canonical builder converter", () => {
    const baseStep = {
      startPlacement: GridLocation.NORTH,
      endPlacement: GridLocation.EAST,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
      turnCount: 0,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
    };

    expect(resolveMotionType(baseStep, GridMode.DIAMOND)).toBe(MotionType.ANTI);
    expect(
      resolveMotionType({ ...baseStep, turnCount: -0.5 }, GridMode.DIAMOND)
    ).toBe(MotionType.FLOAT);
    expect(
      resolveMotionType(
        {
          ...baseStep,
          startPlacement: GridLocation.CENTER,
          endPlacement: GridLocation.EAST,
        },
        GridMode.DIAMOND
      )
    ).toBe(MotionType.DASH);
  });

  it("round-trips hash orientation through the shared animation geometry", () => {
    const atCenter = calculateBuilderEndOrientation(
      Orientation.IN,
      GridLocation.NORTH,
      GridLocation.CENTER,
      RotationDirection.CLOCKWISE,
      0
    );
    expect(atCenter).toBe(Orientation.CENTER_S);

    expect(
      calculateBuilderEndOrientation(
        atCenter,
        GridLocation.CENTER,
        GridLocation.NORTH,
        RotationDirection.CLOCKWISE,
        0
      )
    ).toBe(Orientation.IN);
  });

  it("uses the clockwise eight-point ring for skewed motion", () => {
    expect(
      calculateMotionType(
        GridLocation.NORTH,
        GridLocation.NORTHEAST,
        GridMode.SKEWED
      )
    ).toBe(HandMotionType.SHIFT);
    expect(
      calculateRotationDirection(
        GridLocation.NORTH,
        GridLocation.EAST,
        GridMode.SKEWED
      )
    ).toBe(RotationDirection.CLOCKWISE);
    expect(
      calculateRotationDirection(
        GridLocation.NORTH,
        GridLocation.NORTHWEST,
        GridMode.SKEWED
      )
    ).toBe(RotationDirection.COUNTER_CLOCKWISE);
    expect(
      calculateMotionType(
        GridLocation.NORTH,
        GridLocation.SOUTH,
        GridMode.SKEWED
      )
    ).toBe(HandMotionType.DASH);
  });

  it("restores a red-only starting pose without changing hands", () => {
    const state = createAssembleState();

    state.hydrateFromSequence({
      leftSteps: [],
      rightSteps: [],
      gridMode: GridMode.DIAMOND,
      startPoses: {
        [HandSide.RIGHT]: {
          location: GridLocation.WEST,
          orientation: Orientation.OUT,
        },
      },
    });

    expect(state.activeHand).toBe(HandSide.RIGHT);
    expect(state.phase).toBe("placing");
    expect(state.currentPosition).toBe(GridLocation.WEST);
    expect(state.currentOrientation).toBe(Orientation.OUT);
  });

  it("keeps each hand's uncommitted starting pose while switching", () => {
    const state = createAssembleState();

    state.handlePointClick(GridLocation.NORTH);
    state.switchToHand(HandSide.RIGHT);
    state.handlePointClick(GridLocation.WEST);
    state.switchToHand(HandSide.LEFT);

    expect(state.currentPosition).toBe(GridLocation.NORTH);
    expect(state.startPoses[HandSide.LEFT]?.location).toBe(
      GridLocation.NORTH
    );
    expect(state.startPoses[HandSide.RIGHT]?.location).toBe(GridLocation.WEST);
  });

  it("builds one hand before the other hand has a starting pose", async () => {
    const state = createAssembleState();

    state.handlePointClick(GridLocation.NORTH);
    await addMotion(state, GridLocation.EAST);

    expect(state.leftSteps).toHaveLength(1);
    expect(state.startPoses[HandSide.RIGHT]).toBeUndefined();

    state.switchToHand(HandSide.RIGHT);
    expect(state.phase).toBe("idle");
    expect(state.currentPosition).toBeNull();

    state.handlePointClick(GridLocation.WEST);
    expect(state.phase).toBe("placing");
    expect(state.startPoses[HandSide.RIGHT]?.location).toBe(GridLocation.WEST);
    expect(state.leftSteps).toHaveLength(1);
  });

  it("sets both starting poses as one reversible document action", () => {
    const onDocumentChange = vi.fn();
    const state = createAssembleState({ onDocumentChange });

    state.setStartPoses({
      [HandSide.LEFT]: {
        location: GridLocation.NORTH,
        orientation: Orientation.OUT,
      },
      [HandSide.RIGHT]: {
        location: GridLocation.WEST,
        orientation: Orientation.CLOCK,
      },
    });

    expect(state.startPoses).toEqual({
      [HandSide.LEFT]: {
        location: GridLocation.NORTH,
        orientation: Orientation.OUT,
      },
      [HandSide.RIGHT]: {
        location: GridLocation.WEST,
        orientation: Orientation.CLOCK,
      },
    });
    expect(state.phase).toBe("placing");
    expect(state.activeHand).toBe(HandSide.LEFT);
    expect(state.currentPosition).toBe(GridLocation.NORTH);
    expect(state.undoLabel).toBe("Set start position");
    expect(onDocumentChange).toHaveBeenCalledTimes(1);

    expect(state.undoStep()).toBe(true);
    expect(state.startPoses).toEqual({});
    expect(state.phase).toBe("idle");
    expect(state.historyTransition?.direction).toBe("undo");
    expect([...(state.historyTransition?.consequences ?? [])]).toEqual(
      expect.arrayContaining(["phase", "start-poses", "cursor"])
    );
    expect(state.historyTransitionEpoch).toBe(1);

    expect(state.redoStep()).toBe(true);
    expect(state.startPoses[HandSide.RIGHT]?.location).toBe(GridLocation.WEST);
    expect(state.historyTransition?.direction).toBe("redo");
    expect(state.historyTransitionEpoch).toBe(2);
  });

  it("restores a starting pose removed by a grid change", () => {
    const state = createAssembleState();
    state.handlePointClick(GridLocation.NORTH);

    state.setGridMode(GridMode.BOX);
    expect(state.startPoses[HandSide.LEFT]).toBeUndefined();
    expect(state.gridMode).toBe(GridMode.BOX);
    expect(state.undoLabel).toBe("Change grid");

    state.undoStep();
    expect(state.gridMode).toBe(GridMode.DIAMOND);
    expect(state.historyTransition?.affectsGrid).toBe(true);
    expect(state.startPoses[HandSide.LEFT]?.location).toBe(
      GridLocation.NORTH
    );
  });

  it("undoes and redoes the latest document action across hand switches", async () => {
    const state = createAssembleState();
    state.handlePointClick(GridLocation.NORTH);
    await addMotion(state, GridLocation.EAST);
    state.switchToHand(HandSide.RIGHT);
    state.handlePointClick(GridLocation.WEST);
    await addMotion(state, GridLocation.SOUTH);

    expect(state.rightSteps).toHaveLength(1);
    expect(state.undoLabel).toBe("Add Right step 1");
    expect(state.undoStep()).toBe(true);
    expect(state.rightSteps).toHaveLength(0);
    expect(state.currentPosition).toBe(GridLocation.WEST);
    expect(state.canRedo).toBe(true);

    expect(state.redoStep()).toBe(true);
    expect(state.rightSteps).toHaveLength(1);
    expect(state.currentPosition).toBe(GridLocation.SOUTH);
  });

  it("deletes one paired step and reconnects the remaining paths", async () => {
    const state = createAssembleState();
    state.handlePointClick(GridLocation.NORTH);
    await addMotion(state, GridLocation.EAST);
    await addMotion(state, GridLocation.SOUTH);
    state.switchToHand(HandSide.RIGHT);
    state.handlePointClick(GridLocation.WEST);
    await addMotion(state, GridLocation.SOUTH);
    await addMotion(state, GridLocation.EAST);

    state.deleteStepAt(0);

    expect(state.leftSteps).toHaveLength(1);
    expect(state.rightSteps).toHaveLength(1);
    expect(state.leftSteps[0]?.startPlacement).toBe(GridLocation.NORTH);
    expect(state.leftSteps[0]?.endPlacement).toBe(GridLocation.SOUTH);
    expect(state.rightSteps[0]?.startPlacement).toBe(GridLocation.WEST);
    expect(state.rightSteps[0]?.endPlacement).toBe(GridLocation.EAST);

    state.undoStep();
    expect(state.leftSteps).toHaveLength(2);
    expect(state.rightSteps).toHaveLength(2);
  });

  it("replaces one hand's destination and reflows its downstream motion", async () => {
    const state = createAssembleState();
    state.handlePointClick(GridLocation.NORTH);
    await addMotion(state, GridLocation.EAST);
    await addMotion(state, GridLocation.SOUTH);
    state.selectStep(0);
    state.beginReplaceSelectedStep();

    state.handlePointClick(GridLocation.WEST);

    expect(state.leftSteps[0]?.endPlacement).toBe(GridLocation.WEST);
    expect(state.leftSteps[1]?.startPlacement).toBe(GridLocation.WEST);
    expect(state.leftSteps[1]?.startOrientation).toBe(
      state.leftSteps[0]?.endOrientation
    );
    expect(state.stepEditMode).toBeNull();
  });

  it("reorders both hands as one timeline action", async () => {
    const state = createAssembleState();
    state.handlePointClick(GridLocation.NORTH);
    await addMotion(state, GridLocation.EAST);
    await addMotion(state, GridLocation.SOUTH);
    state.switchToHand(HandSide.RIGHT);
    state.handlePointClick(GridLocation.WEST);
    await addMotion(state, GridLocation.SOUTH);
    await addMotion(state, GridLocation.EAST);

    state.moveStep(1, 0);

    expect(state.leftSteps.map((step) => step.endPlacement)).toEqual([
      GridLocation.SOUTH,
      GridLocation.EAST,
    ]);
    expect(state.rightSteps.map((step) => step.endPlacement)).toEqual([
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);
    expect(state.leftSteps[1]?.startPlacement).toBe(
      state.leftSteps[0]?.endPlacement
    );
    expect(state.rightSteps[1]?.startOrientation).toBe(
      state.rightSteps[0]?.endOrientation
    );
    expect(state.selectedStepIndex).toBe(0);

    state.undoStep();
    expect(state.leftSteps.map((step) => step.endPlacement)).toEqual([
      GridLocation.EAST,
      GridLocation.SOUTH,
    ]);
  });
});
