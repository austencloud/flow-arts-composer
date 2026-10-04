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
import type { PostSequenceTransforms } from "$lib/shared/media-composition/domain/post-sequence-actions";
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

  it("runs the post's presses after the hand labeling and before the whole-post mirror", async () => {
    const tag = (name: string) => async (source: SequenceData) =>
      sequence(`${source.id}>${name}`);
    const transforms: PostSequenceTransforms = {
      mirror: tag("mirror"),
      flip: tag("flip"),
      rotate: async (source, quarterTurns) =>
        sequence(`${source.id}>r${quarterTurns}`),
      swap: (source) => sequence(`${source.id}>swap`),
    };
    const harness = createPostSequenceViewHarness(
      sequence("s"),
      tag("labeled"),
      tag("post-mirror"),
      transforms
    );
    flushSync();
    await settle();
    expect(harness.view.sequence.id).toBe("s>labeled");

    harness.setActions(["swap", "rotate-right"]);
    flushSync();
    expect(harness.view.pending).toBe(true);
    await settle();
    expect(harness.view.sequence.id).toBe("s>labeled>swap>r1");
    expect(harness.view.pending).toBe(false);

    harness.setMirrored(true);
    flushSync();
    await settle();
    expect(harness.view.sequence.id).toBe("s>labeled>swap>r1>post-mirror");

    harness.setMirrored(false);
    harness.setActions([]);
    flushSync();
    expect(harness.view.sequence.id).toBe("s>labeled");
    expect(harness.view.pending).toBe(false);
    harness.dispose();
  });

  it("keeps the previous drawing up while a new press is prepared", async () => {
    let release!: (value: SequenceData) => void;
    const flipped = new Promise<SequenceData>((resolve) => {
      release = resolve;
    });
    const transforms: PostSequenceTransforms = {
      mirror: async (source) => sequence(`${source.id}>mirror`),
      flip: () => flipped,
      rotate: async (source) => source,
      swap: (source) => source,
    };
    const harness = createPostSequenceViewHarness(
      sequence("s"),
      async (source) => source,
      async (source) => source,
      transforms
    );
    harness.setActions(["mirror"]);
    flushSync();
    await settle();
    expect(harness.view.sequence.id).toBe("s>mirror");

    harness.setActions(["mirror", "flip"]);
    flushSync();
    await settle();
    expect(harness.view.pending).toBe(true);
    expect(harness.view.sequence.id).toBe("s>mirror");

    release(sequence("s>mirror>flip"));
    await settle();
    expect(harness.view.pending).toBe(false);
    expect(harness.view.sequence.id).toBe("s>mirror>flip");
    harness.dispose();
  });
});
