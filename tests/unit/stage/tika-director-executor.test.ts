import { describe, expect, it, vi } from "vitest";
import { createStageChoreographyState } from "#lib/features/stage/state/stage-choreography-state.svelte.js";
import { generatePresetPositions } from "#lib/features/stage/state/formation-presets.js";
import {
  executeTikaDirectorPlan,
  type TikaDirectorExecutionContext,
} from "#lib/features/stage/services/tika-director-executor.js";
import type { TikaDirectorResponse } from "#lib/features/stage/domain/tika-director.js";

type ApplyPlan = Extract<TikaDirectorResponse, { kind: "apply" }>;

function plan(actions: ApplyPlan["actions"]): ApplyPlan {
  return { kind: "apply", summary: "test", actions };
}

function harness(requestBeat = 0) {
  const stageState = createStageChoreographyState();
  const viewer = {
    applyPerformerAppearanceAssignments: vi.fn(() => true),
    performerManager: { cancelFormationTransition: vi.fn() },
    undo: vi.fn(),
  };
  const context: TikaDirectorExecutionContext = {
    stageState,
    viewer,
    requestBeat,
    selectedFormationId: null,
    seedKey: "scene:test",
    sequencePicks: [],
  };
  return { stageState, viewer, context };
}

function spots(
  stageState: ReturnType<typeof createStageChoreographyState>,
  index: number
) {
  return JSON.parse(
    JSON.stringify(stageState.choreography.formations[index]!.spots)
  ) as Record<string, { x: number; z: number }>;
}

describe("TIKA Director plan executor", () => {
  it("arranges the active set in a shape without adding a set", () => {
    const { stageState, viewer, context } = harness(0);
    const before = spots(stageState, 0);
    const setCount = stageState.choreography.formations.length;

    // The default first set is already a line, so a circle proves the change.
    const undo = executeTikaDirectorPlan(
      plan([{ type: "arrange-formation", shape: "circle" }]),
      context
    );

    const { performers, stageWidth, stageDepth, formations } =
      stageState.choreography;
    expect(formations).toHaveLength(setCount);
    expect(formations[0]!.presetId).toBe("circle");
    const expected = generatePresetPositions(
      "circle",
      performers.length,
      stageWidth,
      stageDepth
    );
    performers.forEach((performer, index) => {
      expect(formations[0]!.spots[performer.id]).toMatchObject({
        x: expected[index]!.x,
        z: expected[index]!.z,
      });
    });
    expect(
      viewer.performerManager.cancelFormationTransition
    ).toHaveBeenCalledTimes(1);

    expect(undo).toBeTypeOf("function");
    undo!();
    expect(spots(stageState, 0)).toEqual(before);
    expect(viewer.undo).not.toHaveBeenCalled();
    stageState.destroy();
  });

  it("reshapes the destination while the cast is walking into it", () => {
    const { stageState, context } = harness(12);
    stageState.applyFormationTransition("circle", 8, undefined, 8);
    const destination = stageState.choreography.formations.find(
      (formation) => formation.atBeat === 16
    )!;
    const start = stageState.choreography.formations.find(
      (formation) => formation.atBeat === 8
    )!;
    const startBefore = JSON.parse(JSON.stringify(start.spots));

    executeTikaDirectorPlan(
      plan([{ type: "arrange-formation", shape: "v-shape" }]),
      context
    );

    expect(destination.presetId).toBe("v-shape");
    expect(destination.transitionBeats).toBe(8);
    expect(start.spots).toEqual(startBefore);
    stageState.destroy();
  });

  it("applies a shape then a spacing tweak and undoes both together", () => {
    const { stageState, context } = harness(0);
    const before = spots(stageState, 0);

    const undo = executeTikaDirectorPlan(
      plan([
        { type: "arrange-formation", shape: "circle" },
        { type: "arrange-formation", spacing: "wider" },
      ]),
      context
    );

    const set = stageState.choreography.formations[0]!;
    expect(set.presetId).toBe("custom");
    const circle = generatePresetPositions(
      "circle",
      stageState.choreography.performers.length,
      stageState.choreography.stageWidth,
      stageState.choreography.stageDepth
    );
    const centerX = circle.reduce((sum, p) => sum + p.x, 0) / circle.length;
    stageState.choreography.performers.forEach((performer, index) => {
      expect(set.spots[performer.id]!.x).toBeCloseTo(
        centerX + (circle[index]!.x - centerX) * 1.15,
        6
      );
    });

    undo!();
    expect(spots(stageState, 0)).toEqual(before);
    expect(stageState.canUndo).toBe(false);
    stageState.destroy();
  });

  it("shifts left toward negative x and clamps at the floor edge", () => {
    const { stageState, context } = harness(0);
    const before = spots(stageState, 0);

    executeTikaDirectorPlan(
      plan([{ type: "arrange-formation", shift: "left" }]),
      context
    );

    for (const [id, spot] of Object.entries(before)) {
      expect(stageState.choreography.formations[0]!.spots[id]!.x).toBeCloseTo(
        Math.max(0, spot.x - 1),
        6
      );
    }
    stageState.destroy();
  });

  it("still authors a timed move for formation-transition", () => {
    const { stageState, context } = harness(8);

    const undo = executeTikaDirectorPlan(
      plan([
        {
          type: "formation-transition",
          endFormation: "circle",
          durationBeats: 8,
        },
      ]),
      context
    );

    const destination = stageState.choreography.formations.find(
      (formation) => formation.atBeat === 16
    );
    expect(destination).toMatchObject({
      presetId: "circle",
      transitionBeats: 8,
    });
    undo!();
    expect(
      stageState.choreography.formations.find((f) => f.atBeat === 16)
    ).toBeUndefined();
    stageState.destroy();
  });

  it("applies appearance once and undoes through the viewer", () => {
    const { stageState, viewer, context } = harness(0);
    const before = spots(stageState, 0);

    const undo = executeTikaDirectorPlan(
      plan([{ type: "assign-distinct-props" }]),
      context
    );

    expect(viewer.applyPerformerAppearanceAssignments).toHaveBeenCalledTimes(1);
    expect(spots(stageState, 0)).toEqual(before);
    undo!();
    expect(viewer.undo).toHaveBeenCalledTimes(1);
    stageState.destroy();
  });

  it("refuses competing moves and arrange-plus-move plans", () => {
    const { stageState, context } = harness(0);
    const move = {
      type: "formation-transition" as const,
      endFormation: "circle" as const,
      durationBeats: 4,
    };
    expect(() => executeTikaDirectorPlan(plan([move, move]), context)).toThrow(
      /competing formation moves/
    );
    expect(() =>
      executeTikaDirectorPlan(
        plan([{ type: "arrange-formation", shape: "line" }, move]),
        context
      )
    ).toThrow(/same set/);
    expect(stageState.canUndo).toBe(false);
    stageState.destroy();
  });
});
