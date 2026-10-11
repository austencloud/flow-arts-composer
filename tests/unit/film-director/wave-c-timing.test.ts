/**
 * Round 2, wave C: cues (gap 15), phrase continuity (gap 16), prop length over
 * time (gap 17), staging as a timeline (gap 18), and where a hold freezes
 * inside its step (gap 19).
 */
import { describe, expect, it, vi } from "vitest";

import { resolveFilmDirectorSpec } from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";
import { sampleFilmDirector } from "../../../src/routes/test/film-director/_lib/sample-film-director";
import { sampleDirectorBlockingTrack } from "../../../src/routes/test/film-director/_lib/director-blocking-track";
import { resolveHeldStep } from "../../../src/routes/test/film-director/_lib/director-step-holds";
import { resolveStepRamp } from "../../../src/routes/test/film-director/_lib/director-step-changes";
import {
  applyDirectorStepChanges,
  type DirectorAppliedStepChange,
} from "../../../src/routes/test/film-director/_lib/director-viewer-adapter";
import type { Viewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

function film(scenes: Record<string, unknown>[]) {
  return {
    version: 5,
    id: "wave-c-film",
    title: "Wave C Film",
    scenes,
  };
}

const resolve = (scenes: Record<string, unknown>[]) =>
  resolveFilmDirectorSpec(film(scenes));

describe("gap 15: named cues", () => {
  /**
   * The point of a cue is that one name reaches everything. This scene names
   * "drop" once and spends it on a step change, a shot boundary and a blocking
   * move, and all three land on the same second.
   */
  it("drives a step change, a shot boundary and a blocking stop to one instant", () => {
    const scene = resolve([
      {
        id: "one-cue",
        title: "One Cue",
        durationBeats: 16,
        cues: { drop: { atBeats: 8 } },
        performance: {
          bpm: 120,
          formation: "side-by-side",
          cast: {
            count: 2,
            performers: [
              {
                id: "performer-1",
                stepEffects: [{ step: "drop", effect: "fire" }],
                blocking: [
                  { move: "walk", to: { x: -2, z: 0 }, until: "drop" },
                  { move: "stand" },
                ],
              },
              { id: "performer-2" },
            ],
          },
        },
        camera: {
          shots: [
            {
              subject: { kind: "group" },
              shotSize: "wide",
              position: "front",
              until: "drop",
            },
            {
              subject: { kind: "group" },
              shotSize: "medium",
              position: "behind",
            },
          ],
        },
      },
    ]).scenes[0]!;

    // 8 beats at 120 bpm is 4 seconds, and step 8 at one step per beat.
    expect(scene.performance.performers[0]!.stepEffects).toEqual([
      { step: 8, effect: "fire" },
    ]);
    const walker = scene.performance.performers[0]!;
    const arrival = walker.blocking.find((frame) => !frame.walking && frame.atSeconds > 0);
    expect(arrival!.atSeconds).toBeCloseTo(4, 6);
    expect(sampleDirectorBlockingTrack(walker.blocking, 4).position.x).toBeCloseTo(
      -2,
      6
    );
    expect(
      scene.camera.keyframes.some((frame) => Math.abs(frame.atSeconds - 4) < 1e-6)
    ).toBe(true);
  });

  it("reads a cue in seconds or bars as the same moment", () => {
    const bySeconds = resolve([
      {
        id: "s",
        title: "S",
        durationSeconds: 8,
        cues: { mark: { atSeconds: 4 } },
        performance: {
          bpm: 120,
          cast: {
            count: 1,
            performers: [
              { id: "performer-1", stepEffects: [{ step: "mark", effect: "fire" }] },
            ],
          },
        },
      },
    ]);
    const byBars = resolve([
      {
        id: "s",
        title: "S",
        durationSeconds: 8,
        cues: { mark: { atBars: 2 } },
        performance: {
          bpm: 120,
          meter: { beatsPerBar: 4 },
          cast: {
            count: 1,
            performers: [
              { id: "performer-1", stepEffects: [{ step: "mark", effect: "fire" }] },
            ],
          },
        },
      },
    ]);
    expect(bySeconds.scenes[0]!.performance.performers[0]!.stepEffects[0]!.step).toBe(
      8
    );
    expect(byBars.scenes[0]!.performance.performers[0]!.stepEffects[0]!.step).toBe(8);
  });

  it("names the cue and the scene when the cue was never declared", () => {
    expect(() =>
      resolve([
        {
          id: "missing",
          title: "Missing",
          durationSeconds: 8,
          cues: { drop: { atBeats: 4 } },
          performance: {
            cast: {
              count: 1,
              performers: [
                { id: "performer-1", stepEffects: [{ step: "chorus", effect: "fire" }] },
              ],
            },
          },
        },
      ])
    ).toThrow(/Scene "missing".*"chorus".*never names.*"drop"/s);
  });

  it("rejects a cue used as a step when it lands between counts", () => {
    expect(() =>
      resolve([
        {
          id: "fractional",
          title: "Fractional",
          durationSeconds: 8,
          cues: { drop: { atSeconds: 1 } },
          performance: {
            bpm: 90,
            cast: {
              count: 1,
              performers: [
                { id: "performer-1", stepEffects: [{ step: "drop", effect: "fire" }] },
              ],
            },
          },
        },
      ])
    ).toThrow(/lands on count 1.5/);
  });

  it("rejects an `until` whose cue has already passed", () => {
    expect(() =>
      resolve([
        {
          id: "past",
          title: "Past",
          durationBeats: 16,
          cues: { drop: { atBeats: 2 } },
          performance: {
            bpm: 120,
            cast: {
              count: 1,
              performers: [
                {
                  id: "performer-1",
                  blocking: [
                    { move: "stand", durationBeats: 8 },
                    { move: "walk", to: { x: -1, z: 0 }, until: "drop" },
                  ],
                },
              ],
            },
          },
        },
      ])
    ).toThrow(/already passed/);
  });

  it("rejects `until` stated alongside a duration", () => {
    expect(() =>
      resolve([
        {
          id: "both",
          title: "Both",
          durationSeconds: 8,
          cues: { drop: { atSeconds: 4 } },
          performance: {
            cast: {
              count: 1,
              performers: [
                {
                  id: "performer-1",
                  blocking: [
                    {
                      move: "stand",
                      durationSeconds: 2,
                      until: "drop",
                    },
                  ],
                },
              ],
            },
          },
        },
      ])
    ).toThrow(/exactly one/);
  });
});

describe("gap 16: phrase continuity", () => {
  function twoScenes(secondBpm: number, phrase?: string) {
    return resolve([
      {
        id: "first",
        title: "First",
        durationBeats: 8,
        performance: { bpm: 60, cast: { count: 1 } },
      },
      {
        id: "second",
        title: "Second",
        durationBeats: 8,
        transition: { kind: "cut" },
        performance: {
          bpm: secondBpm,
          ...(phrase ? { phrase } : {}),
          cast: { count: 1 },
        },
      },
    ]);
  }

  it("opens a continuing scene on the count the previous one ended", () => {
    const spec = twoScenes(60, "continue");
    expect(spec.scenes[1]!.performance.stepOffset).toBe(8);
    // The first scene is 8 seconds at 60 bpm, so the second opens at 8s.
    expect(sampleFilmDirector(spec, 8).sequenceStep).toBeCloseTo(8, 6);
  });

  it("keeps the count continuous across a tempo change", () => {
    const spec = twoScenes(120, "continue");
    expect(spec.scenes[1]!.performance.stepOffset).toBe(8);
    const beforeCut = sampleFilmDirector(spec, 8 - 1e-4).sequenceStep;
    const afterCut = sampleFilmDirector(spec, 8).sequenceStep;
    expect(afterCut - beforeCut).toBeLessThan(1e-3);
    // And it now advances twice as fast: one more second is two more counts.
    expect(sampleFilmDirector(spec, 9).sequenceStep).toBeCloseTo(10, 6);
  });

  it("restarts by default, and says nothing about an offset when it does", () => {
    const spec = twoScenes(60);
    expect(spec.scenes[1]!.performance.stepOffset).toBeUndefined();
    expect(sampleFilmDirector(spec, 8).sequenceStep).toBeCloseTo(0, 6);
  });

  it("rejects a film whose first scene continues", () => {
    expect(() =>
      resolve([
        {
          id: "opener",
          title: "Opener",
          durationSeconds: 8,
          performance: { phrase: "continue", cast: { count: 1 } },
        },
      ])
    ).toThrow(/Scene "opener" continues.*no previous phrase/s);
  });
});

describe("gap 17: prop length over time", () => {
  it("ramps linearly between entries and cuts when asked", () => {
    const ramp = [
      { step: 0, value: 100, ease: "cut" as const },
      { step: 8, value: 250, ease: "linear" as const },
      { step: 12, value: 60, ease: "cut" as const },
    ];
    expect(resolveStepRamp(ramp, 0, 100)).toBe(100);
    expect(resolveStepRamp(ramp, 4, 100)).toBeCloseTo(175, 6);
    expect(resolveStepRamp(ramp, 8, 100)).toBe(250);
    // A cut holds the previous value right up to its own step.
    expect(resolveStepRamp(ramp, 11.9, 100)).toBe(250);
    expect(resolveStepRamp(ramp, 12, 100)).toBe(60);
    expect(resolveStepRamp(ramp, 40, 100)).toBe(60);
  });

  it("resolves a performer's ramp sorted, with linear as the default arrival", () => {
    const scene = resolve([
      {
        id: "grow",
        title: "Grow",
        durationBeats: 16,
        cues: { settle: { atBeats: 12 } },
        performance: {
          bpm: 120,
          cast: {
            count: 1,
            performers: [
              {
                id: "performer-1",
                staffLengthCm: 100,
                stepStaffLengths: [
                  { step: "settle", staffLengthCm: 250 },
                  { step: 0, staffLengthCm: 100, ease: "cut" },
                ],
              },
            ],
          },
        },
      },
    ]).scenes[0]!;
    expect(scene.performance.performers[0]!.stepStaffLengths).toEqual([
      { step: 0, staffLengthCm: 100, ease: "cut" },
      { step: 12, staffLengthCm: 250, ease: "linear" },
    ]);
  });

  it("leaves stepStaffLengths off a performer whose prop keeps one length", () => {
    const scene = resolve([
      { id: "plain", title: "Plain", performance: { cast: { count: 1 } } },
    ]).scenes[0]!;
    expect(scene.performance.performers[0]!.stepStaffLengths).toBeUndefined();
  });

  it("writes the runtime only once the length has actually moved", () => {
    const scene = resolve([
      {
        id: "grow",
        title: "Grow",
        durationBeats: 16,
        performance: {
          bpm: 120,
          cast: {
            count: 1,
            performers: [
              {
                id: "performer-1",
                staffLengthCm: 100,
                stepStaffLengths: [
                  { step: 0, staffLengthCm: 100, ease: "cut" },
                  { step: 8, staffLengthCm: 250 },
                ],
              },
            ],
          },
        },
      },
    ]).scenes[0]!;

    const performer = {
      setEffect: vi.fn(),
      setEffort: vi.fn(),
      setStaffLengthCm: vi.fn(),
    };
    const viewer = {
      performerManager: { performers: [performer] },
    } as unknown as Viewer3DState;
    const applied = new Map<string, DirectorAppliedStepChange>();

    applyDirectorStepChanges(viewer, scene, [0], applied);
    expect(performer.setStaffLengthCm).toHaveBeenCalledTimes(1);
    expect(performer.setStaffLengthCm).toHaveBeenLastCalledWith(100);

    // A hair further along the ramp is under half a centimetre of growth.
    applyDirectorStepChanges(viewer, scene, [0.02], applied);
    expect(performer.setStaffLengthCm).toHaveBeenCalledTimes(1);

    applyDirectorStepChanges(viewer, scene, [4], applied);
    expect(performer.setStaffLengthCm).toHaveBeenLastCalledWith(175);
    applyDirectorStepChanges(viewer, scene, [8], applied);
    expect(performer.setStaffLengthCm).toHaveBeenLastCalledWith(250);
    expect(performer.setStaffLengthCm).toHaveBeenCalledTimes(3);
  });
});

describe("gap 18: staging as a timeline", () => {
  function phased(blocking: Record<string, unknown>[], durationSeconds = 16) {
    return resolve([
      {
        id: "phases",
        title: "Phases",
        durationSeconds,
        performance: {
          formation: "grid-2x2",
          cast: { count: 4 },
          blocking,
        },
      },
    ]).scenes[0]!;
  }

  it("walks the cast into a line, holds, then opens into a circle", () => {
    const scene = phased([
      { endFormation: "line", durationSeconds: 4 },
      { endFormation: "circle", startSeconds: 8, durationSeconds: 4 },
    ]);
    const at = (seconds: number) =>
      scene.performance.performers.map(
        (performer) => sampleDirectorBlockingTrack(performer.blocking, seconds).position
      );

    const line = at(6);
    expect(Math.max(...line.map((m) => m.z)) - Math.min(...line.map((m) => m.z))).toBeLessThan(
      1e-6
    );
    // Still standing on the line when the second phase opens.
    const held = at(8);
    held.forEach((mark, index) => {
      expect(mark.x).toBeCloseTo(line[index]!.x, 6);
      expect(mark.z).toBeCloseTo(line[index]!.z, 6);
    });
    const circle = at(12);
    expect(
      Math.max(...circle.map((m) => m.z)) - Math.min(...circle.map((m) => m.z))
    ).toBeGreaterThan(0.5);
  });

  it("takes a cue as a phase start", () => {
    const scene = resolve([
      {
        id: "cued-phases",
        title: "Cued Phases",
        durationBeats: 32,
        cues: { drop: { atBeats: 16 } },
        performance: {
          bpm: 120,
          formation: "grid-2x2",
          cast: { count: 4 },
          blocking: [
            { endFormation: "line", durationBeats: 8 },
            { endFormation: "circle", startCue: "drop", durationBeats: 8 },
          ],
        },
      },
    ]).scenes[0]!;
    const performer = scene.performance.performers[0]!;
    const beforeDrop = sampleDirectorBlockingTrack(performer.blocking, 7.9);
    expect(beforeDrop.isMoving).toBe(false);
    expect(sampleDirectorBlockingTrack(performer.blocking, 8.5).isMoving).toBe(true);
  });

  it("names both phases when they overlap", () => {
    expect(() =>
      phased([
        { endFormation: "line", durationSeconds: 6 },
        { endFormation: "circle", startSeconds: 3, durationSeconds: 4 },
      ])
    ).toThrow(/blocking phase 2 starts at 3s, before phase 1 finishes at 6s/);
  });

  it("rejects a phase that runs past the end of the scene", () => {
    expect(() =>
      phased([{ endFormation: "line", startSeconds: 14, durationSeconds: 6 }])
    ).toThrow(/blocking phase 1 finishes at 20s, past the scene's 16s/);
  });

  it("still lets a performer's own blocking override the whole timeline", () => {
    const scene = resolve([
      {
        id: "override",
        title: "Override",
        durationSeconds: 16,
        performance: {
          formation: "grid-2x2",
          cast: {
            count: 4,
            performers: [
              { id: "performer-1", blocking: [{ move: "stand" }] },
            ],
          },
          blocking: [{ endFormation: "line", durationSeconds: 4 }],
        },
      },
    ]).scenes[0]!;
    const stubborn = scene.performance.performers[0]!;
    const opening = stubborn.position;
    const late = sampleDirectorBlockingTrack(stubborn.blocking, 12).position;
    expect(late.x).toBeCloseTo(opening.x, 6);
    expect(late.z).toBeCloseTo(opening.z, 6);
  });
});

describe("gap 19: where a hold freezes inside its step", () => {
  it("pins the frozen pose at the stated fraction of the step", () => {
    const holds = [{ fromStep: 4, steps: 4, progress: 0.5 }];
    expect(resolveHeldStep(5, 0, 0, holds, 0)).toEqual({ step: 4, progress: 0.5 });
    expect(resolveHeldStep(4, 0, 0, holds, 0)).toEqual({ step: 4, progress: 0.5 });
  });

  it("freezes at the top of the step when the hold does not say", () => {
    expect(resolveHeldStep(5, 0, 0, [{ fromStep: 4, steps: 4 }], 0)).toEqual({
      step: 4,
      progress: 0,
    });
  });

  it("carries progress through the resolver only when stated", () => {
    const scene = resolve([
      {
        id: "held",
        title: "Held",
        durationBeats: 16,
        performance: {
          bpm: 120,
          cast: {
            count: 2,
            performers: [
              { id: "performer-1", holds: [{ fromStep: 4, steps: 4, progress: 0.25 }] },
              { id: "performer-2", holds: [{ fromStep: 4, steps: 4 }] },
            ],
          },
        },
      },
    ]).scenes[0]!;
    expect(scene.performance.performers[0]!.holds).toEqual([
      { fromStep: 4, steps: 4, progress: 0.25 },
    ]);
    expect(scene.performance.performers[1]!.holds).toEqual([
      { fromStep: 4, steps: 4 },
    ]);
  });
});
