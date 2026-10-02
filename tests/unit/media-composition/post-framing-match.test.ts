import { describe, expect, it } from "vitest";
import type { PostVideoItem } from "$lib/shared/media-composition/domain/post-project";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import { NOW, project, take, video } from "./post-project-fixtures";

const BAND = {
  x: 0,
  y: 0,
  width: 1,
  height: 0.5,
  rotation: 0,
  crop: { left: 0, top: 0.18, right: 1, bottom: 0.68 },
};
const CLOSE = {
  x: -0.39,
  y: -0.36,
  width: 1.8,
  height: 1.8,
  rotation: 0,
  crop: { left: 0, top: 0, right: 1, bottom: 1 },
};

const CLOSER = { ...CLOSE, x: -1, y: -1, width: 3, height: 3 };

/** A fast cut in the top band crossfading into a closer slow cut. */
function seam(sameRecording: boolean, zooming = false) {
  const recording = take("a");
  const slow = sameRecording ? { ...take("b"), ref: recording.ref } : take("b");
  return project(
    [
      video("fast", {
        start: 0,
        pinnedStart: true,
        sourceGeometry: BAND,
        transitionOut: { duration: 1, type: "crossfade", incomingId: "slow" },
      } as Partial<PostVideoItem>),
      video("slow", {
        takeId: "b",
        start: 9,
        sourceIn: 40,
        sourceOut: 52,
        pinnedStart: true,
        sourceGeometry: CLOSE,
        ...(zooming
          ? {
              keyframes: {
                sourceGeometry: [
                  { t: 40, value: CLOSER, easing: [0, 0, 1, 1] },
                  { t: 44, value: CLOSE, easing: [0, 0, 1, 1] },
                ],
              },
            }
          : {}),
      } as Partial<PostVideoItem>),
    ],
    [],
    [recording, slow]
  );
}

function geometryAt(
  sameRecording: boolean,
  time: number,
  zooming = false,
  regionId = "fast"
) {
  const compiled = compilePostProject(seam(sameRecording, zooming), {
    now: NOW,
  })!;
  return evaluatePresetFrame(
    compiled.preset,
    compiled.durationSeconds,
    time
  ).find((layer) => layer.regionId === regionId)!.sourceGeometry!;
}

describe("crossfade framing match", () => {
  it("reframes a cut onto the next cut of the same recording", () => {
    expect(geometryAt(true, 8.5)).toEqual(BAND);
    for (const [key, value] of Object.entries(CLOSE)) {
      if (key === "crop") continue;
      expect(geometryAt(true, 10)[key as "x"]).toBeCloseTo(value as number, 6);
    }
    expect(geometryAt(true, 10).crop.top).toBeCloseTo(0, 6);
    expect(geometryAt(true, 10).crop.bottom).toBeCloseTo(1, 6);
  });

  it("never stretches the picture on the way", () => {
    for (let time = 9.05; time < 10; time += 0.05) {
      const { width, height, crop } = geometryAt(true, time);
      const across = width / (crop.right - crop.left);
      const down = height / (crop.bottom - crop.top);
      expect(across / down).toBeCloseTo(1, 2);
    }
    expect(geometryAt(true, 9.5).height).toBeGreaterThan(BAND.height);
    expect(geometryAt(true, 9.5).height).toBeLessThan(CLOSE.height);
  });

  it("lands on a moving framing where the next cut is by then", () => {
    const landed = geometryAt(true, 10, true);
    const incoming = geometryAt(true, 10, true, "slow");
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(landed[key]).toBeCloseTo(incoming[key], 6);
    }
    expect(incoming.width).toBeLessThan(CLOSER.width);
    expect(incoming.width).toBeGreaterThan(CLOSE.width);
  });

  it("leaves a crossfade between different recordings alone", () => {
    expect(geometryAt(false, 9.5)).toEqual(BAND);
    expect(geometryAt(false, 10)).toEqual(BAND);
  });
});
