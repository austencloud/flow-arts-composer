/**
 * The Fuse preview's turns are Regenerates: one hand gets a new path from
 * Fuse's own path maker while the other keeps its own, red first, then blue.
 * The kept hand must show the very steps it showed before, and a new pair
 * fuses at Fuse's own length. The paths here come from Fuse's real maker,
 * fed the demo's own motions with a fixed seed.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DEMO_SEQUENCE,
  DEMO_STEP_START,
} from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import {
  FIRST_FUSE_SWAP,
  fuseFrames,
  nextFuseSwap,
} from "#lib/features/create/shared/components/method-previews/method-preview-fuse.js";
import {
  FUSE_PREVIEW_LENGTH,
  demoFusePair,
  swapFuseHand,
  type FusePathMaker,
  type FusePreviewPair,
} from "#lib/features/create/shared/components/method-previews/method-preview-fuse-swap.js";
import {
  DEFAULT_SOLO_LOOP_RECIPE,
  generateSoloLoop,
} from "#lib/features/fuse/services/solo-loop-generator.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

const DEMO_MOTIONS = DEMO_SEQUENCE.steps.flatMap((step) => [
  step.motions.left!,
  step.motions.right!,
]);

/** One of Fuse's own eight-step paths, the same for the same seed. */
async function fusePath(seed: number): Promise<SoloPropData> {
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const generated = await generateSoloLoop(
    FUSE_PREVIEW_LENGTH,
    DEFAULT_SOLO_LOOP_RECIPE,
    random,
    undefined,
    async () => DEMO_MOTIONS
  );
  return generated.solo;
}

/** A maker that hands out `paths` in order and names no letters. */
function makerOf(...paths: SoloPropData[]) {
  return {
    newPath: vi.fn(async () => paths.shift()!),
    deriveLetters: vi.fn(async (sequence: SequenceData) => sequence),
  } satisfies FusePathMaker;
}

/** What a hand does in one step, whatever else its record carries. */
function move(motion: MotionData | SoloPropStepData | undefined) {
  if (!motion) return undefined;
  const {
    motionType,
    startLocation,
    endLocation,
    rotationDirection,
    turns,
    startOrientation,
    endOrientation,
  } = motion;
  return {
    motionType,
    startLocation,
    endLocation,
    rotationDirection,
    turns,
    startOrientation,
    endOrientation,
  };
}

/** One hand's part of the steps shown, and the pose each leaves from. */
function handShown(pair: FusePreviewPair, hand: HandSide) {
  return pair.frames.map((frame) => ({
    step: move(frame.step.motions[hand]),
    from: move(frame.motionStartData.motions[hand]),
  }));
}

describe("Fuse preview Regenerate", () => {
  it("takes turns: red gets a new path first, then blue", () => {
    expect(FIRST_FUSE_SWAP).toBe("right");
    expect(nextFuseSwap("right")).toBe("left");
    expect(nextFuseSwap("left")).toBe("right");
  });

  it("rests first on the demo's own two hands", () => {
    const pair = demoFusePair();
    expect(pair.changed).toBeNull();
    expect(pair.frames).toEqual(
      fuseFrames(DEMO_SEQUENCE, 2, DEMO_STEP_START.fuse)
    );
  });

  it("gives red a new path and keeps blue's steps exactly", async () => {
    const path = await fusePath(7);
    const maker = makerOf(path);
    const before = demoFusePair();
    const after = await swapFuseHand(before, "right", maker);

    expect(maker.newPath).toHaveBeenCalledWith(FUSE_PREVIEW_LENGTH);
    expect(after.changed).toBe(HandSide.RIGHT);
    expect(after.blue).toBe(before.blue);
    expect(handShown(after, HandSide.LEFT)).toEqual(
      handShown(before, HandSide.LEFT)
    );
    const from = DEMO_STEP_START.fuse;
    expect(
      after.frames.map((frame) => move(frame.step.motions[HandSide.RIGHT]))
    ).toEqual(path.steps.slice(from, from + 2).map(move));
    expect(handShown(after, HandSide.RIGHT)).not.toEqual(
      handShown(before, HandSide.RIGHT)
    );
  });

  it("then gives blue a new path and keeps that red", async () => {
    const maker = makerOf(await fusePath(7), await fusePath(11));
    const first = await swapFuseHand(demoFusePair(), "right", maker);
    const second = await swapFuseHand(first, "left", maker);

    expect(second.changed).toBe(HandSide.LEFT);
    expect(second.red).toBe(first.red);
    expect(handShown(second, HandSide.RIGHT)).toEqual(
      handShown(first, HandSide.RIGHT)
    );
    expect(handShown(second, HandSide.LEFT)).not.toEqual(
      handShown(first, HandSide.LEFT)
    );
  });

  it("fuses at Fuse's length and plays the named steps from Fuse's place", async () => {
    const maker = makerOf(await fusePath(7));
    maker.deriveLetters.mockImplementation(async (sequence) => ({
      ...sequence,
      steps: sequence.steps.map((step, index) => ({
        ...step,
        letter: `L${index}` as Letter,
      })),
    }));
    const pair = await swapFuseHand(demoFusePair(), "right", maker);

    expect(maker.deriveLetters).toHaveBeenCalledTimes(1);
    expect(maker.deriveLetters.mock.calls[0]![0].steps).toHaveLength(
      FUSE_PREVIEW_LENGTH
    );
    const from = DEMO_STEP_START.fuse;
    expect(pair.frames.map((frame) => frame.stepIndex)).toEqual([
      from,
      from + 1,
    ]);
    expect(pair.frames.map((frame) => frame.step.letter)).toEqual([
      `L${from}`,
      `L${from + 1}`,
    ]);
    expect(pair.frames[0]!.motionStartData.letter).toBe(`L${from - 1}`);
  });

  it("refuses a path that cannot fuse to Fuse's length", async () => {
    const path = await fusePath(7);
    const short: SoloPropData = {
      ...path,
      steps: path.steps.slice(0, 6),
      length: 6,
      handPath: {
        ...path.handPath,
        locations: path.handPath.locations.slice(0, 7),
      },
    };
    await expect(
      swapFuseHand(demoFusePair(), "right", makerOf(short))
    ).rejects.toThrow(/6 steps instead of 8/);
  });
});
