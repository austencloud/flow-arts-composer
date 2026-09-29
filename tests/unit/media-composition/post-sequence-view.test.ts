import { flushSync } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { mirrorSequence } from "$lib/shared/create/services/sequence-transformer";
import { createPostSequenceViewHarness } from "./post-sequence-view-harness.svelte";

function sequence(id: string): SequenceData {
  return { id, name: id, word: "AB", steps: [] } as unknown as SequenceData;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
}

describe("post sequence view", () => {
  it("reflects east to west at start and end without swapping the two hand identities", async () => {
    const left = createMotionData({
      hand: HandSide.LEFT,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.NORTH,
      rotationDirection: RotationDirection.CLOCKWISE,
    });
    const right = createMotionData({
      hand: HandSide.RIGHT,
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.EAST,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    });
    const source = {
      ...sequence("blue-north-red-east"),
      startPlacement: createStartPlacementData({
        motions: { [HandSide.LEFT]: left, [HandSide.RIGHT]: right },
      }),
      steps: [
        createStepData({
          stepNumber: 1,
          motions: { [HandSide.LEFT]: left, [HandSide.RIGHT]: right },
        }),
      ],
    };
    const mirrored = await mirrorSequence(source);
    expect(mirrored.startPlacement?.motions[HandSide.LEFT]?.startLocation).toBe(
      GridLocation.NORTH
    );
    expect(
      mirrored.startPlacement?.motions[HandSide.RIGHT]?.startLocation
    ).toBe(GridLocation.WEST);
    expect(mirrored.steps[0]?.motions[HandSide.LEFT]?.endLocation).toBe(
      GridLocation.NORTH
    );
    expect(mirrored.steps[0]?.motions[HandSide.RIGHT]?.endLocation).toBe(
      GridLocation.WEST
    );
    expect(mirrored.steps[0]?.motions[HandSide.LEFT]?.hand).toBe(HandSide.LEFT);
    expect(mirrored.steps[0]?.motions[HandSide.RIGHT]?.hand).toBe(
      HandSide.RIGHT
    );
    expect(mirrored.steps[0]?.motions[HandSide.LEFT]?.rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );
    expect(mirrored.steps[0]?.motions[HandSide.RIGHT]?.rotationDirection).toBe(
      RotationDirection.CLOCKWISE
    );
  });

  it("reflects the labeled sequence once and keeps its hand assignment", async () => {
    const original = sequence("original");
    const labeled = sequence("labeled");
    const reflected = sequence("reflected");
    const label = vi.fn(async () => labeled);
    const mirror = vi.fn(async () => reflected);
    const harness = createPostSequenceViewHarness(original, label, mirror);
    flushSync();
    await settle();
    expect(harness.view.sequence).toBe(labeled);
    expect(harness.view.labeling).toBe("mirror-me");

    harness.setMirrored(true);
    flushSync();
    expect(harness.view.pending).toBe(true);
    await settle();
    expect(mirror).toHaveBeenCalledExactlyOnceWith(labeled);
    expect(harness.view.sequence).toBe(reflected);
    expect(harness.view.labeling).toBe("mirror-me");
    expect(harness.view.pending).toBe(false);

    harness.setMirrored(false);
    flushSync();
    expect(harness.view.sequence).toBe(labeled);
    harness.setMirrored(true);
    flushSync();
    await settle();
    expect(harness.view.sequence).toBe(reflected);
    expect(mirror).toHaveBeenCalledTimes(1);
    harness.dispose();
  });

  it("does not reuse another sequence's reflected notation", async () => {
    const first = sequence("first");
    const second = sequence("second");
    const reflectedFirst = sequence("reflected-first");
    const reflectedSecond = sequence("reflected-second");
    const label = vi.fn(async (source: SequenceData) => source);
    const mirror = vi.fn(async (source: SequenceData) =>
      source === first ? reflectedFirst : reflectedSecond
    );
    const harness = createPostSequenceViewHarness(first, label, mirror);
    harness.setMirrored(true);
    flushSync();
    await settle();
    expect(harness.view.sequence).toBe(reflectedFirst);

    harness.setSource(second);
    flushSync();
    expect(harness.view.sequence).not.toBe(reflectedFirst);
    await settle();
    expect(harness.view.sequence).toBe(reflectedSecond);
    expect(mirror).toHaveBeenCalledTimes(2);
    harness.dispose();
  });

  it("reports a failed reflection so export cannot treat source notation as mirrored", async () => {
    const original = sequence("source");
    const harness = createPostSequenceViewHarness(
      original,
      async (source) => source,
      async () => {
        throw new Error("Mirror lookup failed");
      }
    );
    harness.setMirrored(true);
    flushSync();
    expect(harness.view.pending).toBe(true);
    const previous = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await settle();
      expect(harness.view.pending).toBe(false);
      expect(harness.view.error).toBe("Mirror lookup failed");
      harness.setMirrored(false);
      flushSync();
      expect(harness.view.error).toBeNull();
    } finally {
      previous.mockRestore();
      harness.dispose();
    }
  });
});
