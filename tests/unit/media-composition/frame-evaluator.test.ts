import { describe, expect, it } from "vitest";
import { POST_STUDIO_PRESETS } from "$lib/shared/media-composition/domain/post-studio-presets";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import type { SequenceTimeMap } from "$lib/shared/media-composition/domain/sequence-time-map";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const performancePreset = POST_STUDIO_PRESETS.find(
  (preset) => preset.id === "performance-breakdown"
)!;

const timeMap: SequenceTimeMap = {
  schemaVersion: 1,
  id: "mapped-performance",
  sequenceRef: { sequenceId: "sequence", contentHash: "revision" },
  mediaSourceId: "performance-video",
  anchors: [
    { mediaTimeSeconds: 0, sequencePosition: 0 },
    { mediaTimeSeconds: 2, sequencePosition: 1 },
    { mediaTimeSeconds: 5, sequencePosition: 3 },
    { mediaTimeSeconds: 10, sequencePosition: 5 },
  ],
  source: "manual",
  positionConvention: "engine",
  boundaryPolicy: "clamp",
  updatedAt: 1,
};

const variableDurationSteps = [
  { duration: 0.5 },
  { duration: 1.5 },
  { duration: 1 },
  { duration: 2 },
] as unknown as StepData[];

function layerAt(seconds: number, clipId: string) {
  return evaluatePresetFrame(performancePreset, 10, seconds).find(
    (layer) => layer.clipId === clipId
  );
}

describe("evaluatePresetFrame", () => {
  it("keeps the card visible through the full project", () => {
    expect(layerAt(0, "card")?.opacity).toBe(1);
    expect(layerAt(5, "card")?.opacity).toBe(1);
    expect(layerAt(10, "card")?.opacity).toBe(1);
  });

  it("shows only the performance before the overlap", () => {
    expect(layerAt(4, "performance")?.opacity).toBe(1);
    expect(layerAt(4, "performance-animation")).toBeUndefined();
  });

  it("crossfades performance and animation at the midpoint", () => {
    expect(layerAt(5, "performance")?.opacity).toBeCloseTo(0.5);
    expect(layerAt(5, "performance-animation")?.opacity).toBeCloseTo(0.5);
    expect(layerAt(5, "performance")?.sourceTimeSeconds).toBeCloseTo(5);
    expect(layerAt(5, "performance-animation")?.sourceTimeSeconds).toBeCloseTo(
      5
    );
  });

  it("shows only the animation after the overlap", () => {
    expect(layerAt(6, "performance")).toBeUndefined();
    expect(layerAt(6, "performance-animation")?.opacity).toBe(1);
  });

  it("resolves one fractional sequence position for every aligned layer", () => {
    const layers = evaluatePresetFrame(performancePreset, 10, 5, {
      timeMap,
      steps: variableDurationSteps,
      startPlacementDuration: 1,
    });

    // Engine position 3 is move 2 landed: the frame belongs to the move that
    // just finished, so the card names move 2 while the square sits at 3.
    expect(layers).toHaveLength(3);
    for (const layer of layers) {
      expect(layer.sequencePosition).toBe(3);
      expect(layer.animationTimeSeconds).toBe(3);
      expect(layer.displayedBeatNumber).toBe(2);
    }
  });

  it("holds the completed pose for the whole beat in step mode", () => {
    // The studio's clock cannot dwell the way the animation engine's step mode
    // does — the video and music underneath keep running — so step here means
    // the position floors to the beat it is inside.
    const [layer] = evaluatePresetFrame(
      { ...performancePreset, animationPlaybackMode: "step" },
      10,
      4,
      { timeMap, steps: variableDurationSteps, startPlacementDuration: 1 }
    );
    const [continuous] = evaluatePresetFrame(performancePreset, 10, 4, {
      timeMap,
      steps: variableDurationSteps,
      startPlacementDuration: 1,
    });

    expect(continuous?.sequencePosition).toBeGreaterThan(1);
    expect(continuous?.sequencePosition).not.toBe(
      Math.floor(continuous!.sequencePosition!)
    );
    expect(layer?.sequencePosition).toBe(
      Math.floor(continuous!.sequencePosition!)
    );
  });

  it("advances the animation from tapped arrivals while the card marks the landed pose", () => {
    const arrivalMap: SequenceTimeMap = {
      ...timeMap,
      positionConvention: "arrival",
    };
    const layer = evaluatePresetFrame(performancePreset, 10, 5, {
      timeMap: arrivalMap,
      steps: variableDurationSteps,
      startPlacementDuration: 1,
    })[0];

    expect(layer?.sequencePosition).toBe(4);
    expect(layer?.carouselPosition).toBe(3);
    expect(layer?.displayedBeatNumber).toBe(3);
    expect(layer?.animationTimeSeconds).toBe(4);
    const opening = evaluatePresetFrame(performancePreset, 10, 0, {
      timeMap: arrivalMap,
      steps: variableDurationSteps,
      startPlacementDuration: 1,
    })[0];
    expect(opening?.carouselPosition).toBe(0);
  });

  it("folds a multi-pass take back into one cycle of the sequence", () => {
    // Two passes over the same four steps: the opening pose at zero, then
    // eight landings, and one sequence of four on screen.
    const twoPassMap: SequenceTimeMap = {
      ...timeMap,
      anchors: [
        { mediaTimeSeconds: 0, sequencePosition: 0 },
        { mediaTimeSeconds: 1, sequencePosition: 1 },
        { mediaTimeSeconds: 2, sequencePosition: 2 },
        { mediaTimeSeconds: 3, sequencePosition: 3 },
        { mediaTimeSeconds: 4, sequencePosition: 4 },
        { mediaTimeSeconds: 5, sequencePosition: 5 },
        { mediaTimeSeconds: 6, sequencePosition: 6 },
        { mediaTimeSeconds: 7, sequencePosition: 7 },
        { mediaTimeSeconds: 8, sequencePosition: 8 },
      ],
    };
    const frameAt = (seconds: number) =>
      evaluatePresetFrame(performancePreset, 10, seconds, {
        timeMap: twoPassMap,
        steps: variableDurationSteps,
        startPlacementDuration: 1,
      })[0];
    const positionAt = (seconds: number) => frameAt(seconds)?.sequencePosition;

    // The opening pose is move 1 about to begin.
    expect(positionAt(0)).toBe(1);
    expect(positionAt(1)).toBe(1);
    expect(positionAt(4)).toBe(4);
    // The landing that closes pass 1 is move 4 finished, still pass 1; pass
    // 2's first move starts just after it.
    expect(positionAt(5)).toBe(5);
    expect(frameAt(5)?.sequencePassIndex).toBe(0);
    expect(positionAt(6.5)).toBeCloseTo(2.5, 5);
    expect(frameAt(6.5)?.sequencePassIndex).toBe(1);
    // It holds past the last anchor.
    expect(positionAt(8)).toBe(4);
    expect(positionAt(9.5)).toBe(4);
    expect(frameAt(4)?.sequencePassIndex).toBe(0);
  });

  it("keeps the square, the carousel and the pass on one move across a pass boundary", () => {
    const eight = Array.from({ length: 8 }, () => ({
      duration: 1,
    })) as unknown as StepData[];
    const arrivalMap: SequenceTimeMap = {
      ...timeMap,
      positionConvention: "arrival",
      anchors: [
        { mediaTimeSeconds: 0, sequencePosition: 0 },
        { mediaTimeSeconds: 20, sequencePosition: 20 },
      ],
    };
    const preset = {
      ...performancePreset,
      clips: performancePreset.clips.map((clip) =>
        clip.id === "performance"
          ? { ...clip, end: { unit: "seconds" as const, value: 20 } }
          : clip
      ),
    };
    const at = (seconds: number) =>
      evaluatePresetFrame(preset, 20, seconds, {
        timeMap: arrivalMap,
        steps: eight,
        startPlacementDuration: 1,
      }).find((layer) => layer.clipId === "performance")!;

    expect(at(7.5)).toMatchObject({
      sequencePosition: 8.5,
      displayedBeatNumber: 8,
      sequencePassIndex: 0,
    });
    expect(at(8)).toMatchObject({
      sequencePosition: 9,
      displayedBeatNumber: 8,
      sequencePassIndex: 0,
      carouselPosition: 8,
    });
    expect(at(8.5)).toMatchObject({
      sequencePosition: 1.5,
      displayedBeatNumber: 1,
      sequencePassIndex: 1,
      carouselPosition: 8.5,
    });
    expect(at(16.5)).toMatchObject({
      sequencePosition: 1.5,
      displayedBeatNumber: 1,
      sequencePassIndex: 2,
    });
  });

  it("reads a take's clock at the clip's own source time", () => {
    const steps = Array.from({ length: 8 }, () => ({
      duration: 1,
    })) as unknown as StepData[];
    // A slowed act: twenty post seconds over ten seconds of the take, with a
    // square over the same footage. The take's clock says media second s is
    // arrival s.
    const slowed = {
      ...performancePreset,
      clips: performancePreset.clips
        .filter((clip) => clip.kind === "visual")
        .map((clip) => ({
          ...clip,
          start: { unit: "seconds" as const, value: 0 },
          end: { unit: "seconds" as const, value: 20 },
          sourceIn: { unit: "seconds" as const, value: 0 },
          sourceOut: { unit: "seconds" as const, value: 10 },
          fadeInSeconds: undefined,
          fadeOutSeconds: undefined,
          timeMapRole: "take:slow",
        })),
      transitions: [],
    };
    const layers = evaluatePresetFrame(
      slowed,
      20,
      10,
      {
        steps,
        startPlacementDuration: 1,
        clocks: { "take:slow": { positionAt: (seconds) => seconds } },
      },
      { "take:slow": 1.5 }
    );
    const mapped = layers.filter((layer) => layer.sequenceFrame);
    expect(mapped.length).toBeGreaterThan(1);
    for (const layer of mapped) {
      // Post second 10 is take second 5, plus the take's 1.5 s trim.
      expect(layer.sequenceFrame!.arrival).toBeCloseTo(6.5, 9);
      expect(layer.displayedBeatNumber).toBe(7);
    }
  });

  it("rejects an invalid project duration", () => {
    expect(() => evaluatePresetFrame(performancePreset, 0, 0)).toThrow(
      RangeError
    );
  });
});
