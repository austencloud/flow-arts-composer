import { afterEach, describe, expect, it, vi } from "vitest";
import { createCreateModuleState } from "$lib/features/create/shared/state/create-module-state.svelte";
import { createAssembleTabState } from "$lib/features/create/shared/state/assemble-tab-state.svelte";
import { executeClearSequenceWorkflow } from "$lib/shared/create/utils/clear-sequence-workflow";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

vi.mock("$lib/shared/navigation/state/navigation-state.svelte", () => ({
  navigationState: {
    activeTab: "assemble",
    currentSection: "assemble",
    setCurrentSection: vi.fn(),
  },
}));

vi.mock("$lib/shared/gamification/get-prop-unlock-manager", () => ({
  getPropUnlockManager: () => ({ recordCreation: vi.fn() }),
}));

vi.mock("$lib/shared/pictograph/shared/services/motion-query-handler", () => ({
  motionQueryHandler: {
    findLetterByMotionConfiguration: vi.fn(async () => Letter.A),
  },
}));

const sequenceRepository = {} as SequenceRepository;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tabStates: ReturnType<typeof createAssembleTabState>[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const state of tabStates.splice(0)) state.destroy();
});

describe("Clear on the Assemble tab", () => {
  it("brings back both hands and the document with one Undo", async () => {
    const moduleState = createCreateModuleState(sequenceRepository);
    const tabState = createAssembleTabState(sequenceRepository);
    tabStates.push(tabState);
    moduleState.assembleTabState = tabState;
    const builder = tabState.assembleBuilderState;
    const sequenceState = tabState.sequenceState!;

    builder.handlePointClick(GridLocation.NORTH);
    builder.handlePointClick(GridLocation.EAST);
    await vi.waitFor(() => expect(builder.phase).toBe("building"));
    builder.switchToHand(HandSide.RIGHT);
    builder.handlePointClick(GridLocation.SOUTH);
    builder.handlePointClick(GridLocation.WEST);
    await vi.waitFor(() => {
      expect(builder.rightSteps).toHaveLength(1);
      expect(sequenceState.currentSequence?.steps[0]?.letter).toBe(Letter.A);
    });

    const built = {
      leftSteps: clone(builder.leftSteps),
      rightSteps: clone(builder.rightSteps),
      startPoses: clone(builder.startPoses),
      sequence: clone(sequenceState.currentSequence),
    };
    const lastBuildAction = builder.undoLabel;
    expect(built.leftSteps).toHaveLength(1);
    expect(built.rightSteps).toHaveLength(1);

    vi.useFakeTimers();
    const clearing = executeClearSequenceWorkflow({
      CreateModuleState: moduleState,
      constructTabState: null,
      panelState: {
        stopWorkspacePlayback: vi.fn(),
        closeAllPanels: vi.fn(),
      } as never,
    });
    await vi.advanceTimersByTimeAsync(300);
    await clearing;

    expect(sequenceState.currentSequence).toBeNull();
    expect(builder.leftSteps).toHaveLength(0);
    expect(builder.rightSteps).toHaveLength(0);
    expect(moduleState.canUndo).toBe(true);
    expect(builder.undoLabel).toBe("Clear sequence");

    expect(moduleState.undo()).toBe(true);

    expect(builder.leftSteps).toEqual(built.leftSteps);
    expect(builder.rightSteps).toEqual(built.rightSteps);
    expect(builder.startPoses).toEqual(built.startPoses);
    expect(sequenceState.currentSequence).toEqual(built.sequence);
    // The clear is one history entry: the next Undo reaches the build, not a
    // second copy of the clear.
    expect(builder.undoLabel).toBe(lastBuildAction);

    expect(moduleState.redo()).toBe(true);
    expect(sequenceState.currentSequence).toBeNull();
    expect(builder.leftSteps).toHaveLength(0);
    expect(builder.rightSteps).toHaveLength(0);
  });
});
