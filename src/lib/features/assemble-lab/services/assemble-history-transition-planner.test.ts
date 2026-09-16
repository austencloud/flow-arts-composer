import { describe, expect, it } from "vitest";
import {
  createAssembleHistoryTransition,
  type AssembleHistoryConsequence,
} from "./assemble-history-transition-planner";
import type { AssembleSnapshot } from "../state/assemble-state-types";

function snapshot(overrides: Partial<AssembleSnapshot> = {}): AssembleSnapshot {
  return {
    phase: "building",
    activeHand: "left",
    gridMode: "diamond",
    showCenter: false,
    startPoses: {},
    leftSteps: [],
    rightSteps: [],
    currentPosition: null,
    currentOrientation: "in",
    rotationDirection: "noRotation",
    turnCount: 0,
    selectedStepIndex: null,
    stepEditMode: null,
    document: null,
    ...overrides,
  } as AssembleSnapshot;
}

describe("createAssembleHistoryTransition", () => {
  it("identifies every control and builder consequence", () => {
    const from = snapshot();
    const to = snapshot({
      phase: "complete",
      activeHand: "right",
      gridMode: "box",
      showCenter: true,
      startPoses: { left: { location: "n", orientation: "in" } },
      leftSteps: [
        {
          startPlacement: "n",
          endPlacement: "e",
          rotationDirection: "cw",
          turnCount: 1,
          startOrientation: "in",
          endOrientation: "out",
        },
      ],
      currentPosition: "e",
      currentOrientation: "out",
      rotationDirection: "cw",
      turnCount: 1,
      selectedStepIndex: 0,
      stepEditMode: "replace",
      document: { id: "after" },
    });

    const plan = createAssembleHistoryTransition(
      "redo",
      "Build motion",
      from,
      to
    );
    const expected: AssembleHistoryConsequence[] = [
      "phase",
      "active-hand",
      "grid",
      "start-poses",
      "path",
      "cursor",
      "orientation",
      "rotation",
      "turn-count",
      "selection",
      "edit-mode",
      "document",
    ];

    expect(plan.direction).toBe("redo");
    expect(plan.label).toBe("Build motion");
    expect(plan.consequences).toEqual(new Set(expected));
    expect(plan.affectsBuilderPath).toBe(true);
    expect(plan.affectsControls).toBe(true);
    expect(plan.affectsGrid).toBe(true);
  });

  it("does not report structurally equal cloned values", () => {
    const from = snapshot({ document: { steps: [1, 2] } });
    const to = snapshot({ document: { steps: [1, 2] } });

    const plan = createAssembleHistoryTransition("undo", "No change", from, to);

    expect(plan.consequences.size).toBe(0);
    expect(plan.affectsBuilderPath).toBe(false);
    expect(plan.affectsControls).toBe(false);
    expect(plan.affectsGrid).toBe(false);
  });
});
