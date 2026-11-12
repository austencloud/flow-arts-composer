import { describe, expect, it } from "vitest";

import {
  FilmRecordingError,
  explainEncoderSize,
  frameTimeSeconds,
  planFilmRecording,
} from "../../../src/routes/test/film-director/_lib/film-recording-plan";

// Three scenes: 0-8, 8-20, 20-26. Lengths chosen so scene starts are not
// multiples of a frame at either rate's float representation by accident.
const FILM = {
  id: "Three Act Test",
  durationSeconds: 26,
  scenes: [
    { id: "opening", startSeconds: 0, durationSeconds: 8 },
    { id: "middle", startSeconds: 8, durationSeconds: 12 },
    { id: "closing", startSeconds: 20, durationSeconds: 6 },
  ],
};

describe("planFilmRecording frame schedule", () => {
  it("renders the whole film at 60 by default, duration times fps frames", () => {
    const plan = planFilmRecording(FILM);
    expect(plan.fps).toBe(60);
    expect(plan.width).toBe(1920);
    expect(plan.height).toBe(1080);
    expect(plan.frameCount).toBe(26 * 60);
    expect(frameTimeSeconds(plan, 0)).toBe(0);
    // The last frame is one frame short of the end, never on it: the end
    // instant belongs to whatever comes after the film.
    expect(frameTimeSeconds(plan, plan.frameCount - 1)).toBeCloseTo(
      26 - 1 / 60,
      12
    );
  });

  it("computes each frame time from its index, so drift never accumulates", () => {
    const plan = planFilmRecording(FILM, { fps: 30 });
    let summed = 0;
    for (let index = 0; index < plan.frameCount; index++) {
      expect(frameTimeSeconds(plan, index)).toBe(index / 30);
      summed += 1 / 30;
    }
    // Summing the step is what this avoids: it drifts off the exact time.
    expect(summed).not.toBe(plan.frameCount / 30);
  });

  it("lands the first frame on --from and stops one frame before --to", () => {
    const plan = planFilmRecording(FILM, {
      fps: 60,
      fromSeconds: 4.5,
      toSeconds: 12.3,
    });
    expect(frameTimeSeconds(plan, 0)).toBe(4.5);
    // 7.8 seconds at 60 is 468 frames even though 7.8 * 60 is 467.99999...
    expect(plan.frameCount).toBe(468);
    const last = frameTimeSeconds(plan, plan.frameCount - 1);
    expect(last).toBeLessThan(12.3);
    expect(last).toBeCloseTo(12.3 - 1 / 60, 9);
  });

  it("waits on the first frame and on every frame that opens a new scene", () => {
    const plan = planFilmRecording(FILM, { fps: 30 });
    expect(plan.sceneWaits).toEqual([
      { frameIndex: 0, sceneIndex: 0, sceneId: "opening" },
      { frameIndex: 240, sceneIndex: 1, sceneId: "middle" },
      { frameIndex: 600, sceneIndex: 2, sceneId: "closing" },
    ]);
    // The wait frame is the first one inside its scene, and the frame before
    // it is still in the scene before.
    for (const wait of plan.sceneWaits.slice(1)) {
      const scene = FILM.scenes[wait.sceneIndex]!;
      expect(frameTimeSeconds(plan, wait.frameIndex)).toBeGreaterThanOrEqual(
        scene.startSeconds
      );
      expect(frameTimeSeconds(plan, wait.frameIndex - 1)).toBeLessThan(
        scene.startSeconds
      );
    }
  });

  it("starts a window inside a later scene by waiting on that scene", () => {
    const plan = planFilmRecording(FILM, {
      fps: 60,
      fromSeconds: 10,
      toSeconds: 22,
    });
    expect(plan.sceneWaits).toEqual([
      { frameIndex: 0, sceneIndex: 1, sceneId: "middle" },
      { frameIndex: 600, sceneIndex: 2, sceneId: "closing" },
    ]);
  });

  it("finds a scene boundary that falls between two frames", () => {
    const film = {
      id: "odd",
      durationSeconds: 2,
      scenes: [
        { id: "a", startSeconds: 0, durationSeconds: 1.01 },
        { id: "b", startSeconds: 1.01, durationSeconds: 0.99 },
      ],
    };
    const plan = planFilmRecording(film, { fps: 30 });
    // 1.01 s is between frame 30 (1.0 s) and frame 31 (1.0333 s).
    expect(plan.sceneWaits[1]).toEqual({
      frameIndex: 31,
      sceneIndex: 1,
      sceneId: "b",
    });
  });

  it("refuses rates, windows and names the recorder cannot honour", () => {
    expect(() => planFilmRecording(FILM, { fps: 24 })).toThrow(
      FilmRecordingError
    );
    expect(() => planFilmRecording(FILM, { fromSeconds: 26 })).toThrow(
      /before the film ends/
    );
    expect(() => planFilmRecording(FILM, { toSeconds: 27 })).toThrow(
      /past the film's end/
    );
    expect(() =>
      planFilmRecording(FILM, { fromSeconds: 5, toSeconds: 5 })
    ).toThrow(/one frame after start/);
    expect(() => planFilmRecording(FILM, { name: "Bad Name" })).toThrow(
      /lowercase/
    );
    expect(planFilmRecording(FILM).name).toBe("film-three-act-test");
  });
});

describe("explainEncoderSize", () => {
  it("accepts the landscape and phone cuts", () => {
    expect(explainEncoderSize(1920, 1080)).toBeNull();
    expect(explainEncoderSize(1080, 1920)).toBeNull();
    expect(explainEncoderSize(1280, 720)).toBeNull();
  });

  it("refuses the 2044-wide size the hardware encoder failed, and odd sides", () => {
    expect(explainEncoderSize(2044, 1080)).toMatch(/too large/);
    expect(explainEncoderSize(1921, 1080)).toMatch(/even/);
    expect(explainEncoderSize(1920, 1081)).toMatch(/even/);
    expect(explainEncoderSize(32, 32)).toMatch(/between/);
    expect(() => planFilmRecording(FILM, { width: 2044 })).toThrow(/too large/);
  });
});
