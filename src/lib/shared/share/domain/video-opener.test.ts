import { describe, expect, it } from "vitest";
import {
  fitOpenerImage,
  isVideoOpener,
  openerAddsHold,
  openerCoverOffsetMs,
  openerFrameCount,
} from "./video-opener";

describe("video opener hold", () => {
  it("prepends nothing for the first beat the export already opens on", () => {
    expect(openerAddsHold("first-beat")).toBe(false);
    expect(
      openerFrameCount({ opener: "first-beat", fps: 60, secondsPerBeat: 1 })
    ).toBe(0);
  });

  it("holds the chosen image for one beat at the export speed", () => {
    expect(
      openerFrameCount({ opener: "this-frame", fps: 60, secondsPerBeat: 1 })
    ).toBe(60);
    expect(
      openerFrameCount({ opener: "mandala", fps: 30, secondsPerBeat: 0.5 })
    ).toBe(15);
  });

  it("rounds a partial frame up so the hold is never shorter than a beat", () => {
    expect(
      openerFrameCount({ opener: "mandala", fps: 30, secondsPerBeat: 1 / 3 })
    ).toBe(10);
    expect(
      openerFrameCount({ opener: "mandala", fps: 60, secondsPerBeat: 0.41 })
    ).toBe(25);
  });

  it("refuses a hold it cannot express in frames", () => {
    expect(
      openerFrameCount({ opener: "this-frame", fps: 0, secondsPerBeat: 1 })
    ).toBe(0);
    expect(
      openerFrameCount({
        opener: "this-frame",
        fps: 60,
        secondsPerBeat: Number.POSITIVE_INFINITY,
      })
    ).toBe(0);
  });
});

describe("opener image placement", () => {
  it("centers a square capture inside a portrait frame", () => {
    expect(
      fitOpenerImage({
        imageWidth: 960,
        imageHeight: 960,
        frameWidth: 1080,
        frameHeight: 1920,
      })
    ).toEqual({ x: 0, y: 420, width: 1080, height: 1080 });
  });

  it("letterboxes a wide capture inside a square frame", () => {
    expect(
      fitOpenerImage({
        imageWidth: 1920,
        imageHeight: 1080,
        frameWidth: 1080,
        frameHeight: 1080,
      })
    ).toEqual({ x: 0, y: 236, width: 1080, height: 608 });
  });

  it("fills the frame when the image has no size", () => {
    expect(
      fitOpenerImage({
        imageWidth: 0,
        imageHeight: 0,
        frameWidth: 1080,
        frameHeight: 1080,
      })
    ).toEqual({ x: 0, y: 0, width: 1080, height: 1080 });
  });
});

describe("opener identity", () => {
  it("accepts only the three choices", () => {
    expect(isVideoOpener("first-beat")).toBe(true);
    expect(isVideoOpener("mandala")).toBe(true);
    expect(isVideoOpener("scrubber")).toBe(false);
    expect(isVideoOpener(undefined)).toBe(false);
  });

  it("points the cover at time zero", () => {
    expect(openerCoverOffsetMs()).toBe(0);
  });
});
