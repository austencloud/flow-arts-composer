/**
 * Round 2, wave D: hand and prop-tip camera subjects (gap 12), cast-wide
 * spreads (gap 20), prop builds (gap 23), and one effect per hand (gap 26).
 */
import { describe, expect, it, vi } from "vitest";

import { resolveFilmDirectorSpec } from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";
import {
  rampedSequenceLevel,
  spreadBeatOffset,
} from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";
import {
  HAND_TARGET_HEIGHT,
  PROP_TIP_TARGET_HEIGHT,
  subjectAnchorHeight,
} from "../../../src/routes/test/film-director/_lib/camera-language";
import {
  applyDirectorStepChanges,
  type DirectorAppliedStepChange,
} from "../../../src/routes/test/film-director/_lib/director-viewer-adapter";
import type { Viewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

function film(scenes: Record<string, unknown>[]) {
  return {
    version: 5,
    id: "wave-d-film",
    title: "Wave D Film",
    scenes,
  };
}

const resolve = (scenes: Record<string, unknown>[]) =>
  resolveFilmDirectorSpec(film(scenes));

function scene(overrides: Record<string, unknown>) {
  return {
    id: "wave-d",
    title: "Wave D",
    durationBeats: 8,
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: { count: 2 },
    },
    ...overrides,
  };
}

describe("gap 12: hand and prop-tip camera subjects", () => {
  it("aims a hand shot at hand height and a prop-tip shot higher", () => {
    const hand = resolve([
      scene({
        camera: {
          subject: { kind: "hand", performerId: "performer-1", hand: "right" },
          shotSize: "close-up",
          position: "front",
        },
      }),
    ]).scenes[0]!;
    const tip = resolve([
      scene({
        camera: {
          subject: {
            kind: "prop-tip",
            performerId: "performer-1",
            hand: "right",
          },
          shotSize: "close-up",
          position: "front",
        },
      }),
    ]).scenes[0]!;

    const handY = hand.camera.keyframes[0]!.target[1];
    const tipY = tip.camera.keyframes[0]!.target[1];
    // Both sit on the same floor, so the difference between them is exactly
    // the difference between the two anchor heights.
    expect(tipY - handY).toBeCloseTo(
      PROP_TIP_TARGET_HEIGHT - HAND_TARGET_HEIGHT,
      6
    );
    // A close-up must not drag either one up to face height.
    expect(handY).not.toBeCloseTo(tipY, 6);
    expect(subjectAnchorHeight("hand")).toBe(HAND_TARGET_HEIGHT);
    expect(subjectAnchorHeight("prop-tip")).toBe(PROP_TIP_TARGET_HEIGHT);
    expect(subjectAnchorHeight("performer")).toBeNull();
  });

  it("aims at the named performer's mark, not the group centre", () => {
    const spec = resolve([
      scene({
        camera: {
          subject: { kind: "hand", performerId: "performer-2", hand: "left" },
          shotSize: "medium",
          position: "front",
        },
      }),
    ]).scenes[0]!;
    const performer = spec.performance.performers[1]!;
    expect(spec.camera.keyframes[0]!.target[0]).toBeCloseTo(
      performer.position.x,
      6
    );
  });

  it('accepts "blue" and "red" as hand names', () => {
    const spec = resolve([
      scene({
        camera: {
          subject: { kind: "hand", performerId: "performer-1", hand: "blue" },
          shotSize: "medium",
          position: "front",
        },
      }),
    ]).scenes[0]!;
    expect(spec.camera.keyframes).not.toHaveLength(0);
  });

  it("rejects a hand subject that names nobody in the cast", () => {
    expect(() =>
      resolve([
        scene({
          camera: {
            subject: { kind: "hand", performerId: "ghost", hand: "left" },
            shotSize: "medium",
            position: "front",
          },
        }),
      ])
    ).toThrow(/ghost/);
  });
});

describe("gap 20: spreads the cast speaks once", () => {
  it("walks a canon offset across the cast", () => {
    const spec = resolve([
      scene({
        performance: {
          bpm: 120,
          formation: "line",
          cast: { count: 4, defaults: { beatOffset: { canon: 2 } } },
        },
      }),
    ]).scenes[0]!;
    expect(
      spec.performance.performers.map((performer) => performer.beatOffset)
    ).toEqual([0, 2, 4, 6]);
  });

  it("walks a level ramp across the cast and rounds inside the range", () => {
    const spec = resolve([
      scene({
        performance: {
          bpm: 120,
          formation: "line",
          cast: {
            count: 4,
            defaults: {
              sequence: { length: 8, level: { ramp: { from: 1, to: 3 } } },
            },
          },
        },
      }),
    ]).scenes[0]!;
    expect(
      spec.performance.performers.map((performer) => performer.sequence.level)
    ).toEqual([1, 2, 2, 3]);
  });

  it("hands a one-performer cast the ramp's first level", () => {
    expect(rampedSequenceLevel({ from: 1, to: 3 }, 0, 1)).toBe(1);
    expect(spreadBeatOffset({ canon: 2 }, 3)).toBe(6);
    expect(spreadBeatOffset(5, 3)).toBe(5);
    expect(spreadBeatOffset(undefined, 3)).toBeUndefined();
  });

  it("rejects a spread spoken on one performer, by name", () => {
    expect(() =>
      resolve([
        scene({
          performance: {
            bpm: 120,
            formation: "line",
            cast: {
              count: 2,
              performers: [
                { id: "performer-1", beatOffset: { canon: 2 } },
                { id: "performer-2" },
              ],
            },
          },
        }),
      ])
    ).toThrow(/cast\.defaults/);

    expect(() =>
      resolve([
        scene({
          performance: {
            bpm: 120,
            formation: "line",
            cast: {
              count: 2,
              performers: [
                {
                  id: "performer-1",
                  sequence: { length: 8, level: { ramp: { from: 1, to: 3 } } },
                },
                { id: "performer-2" },
              ],
            },
          },
        }),
      ])
    ).toThrow(/cast\.defaults/);
  });
});

describe("gap 23: prop builds", () => {
  it("carries a per-performer build, including finish, into the resolved cast", () => {
    const spec = resolve([
      scene({
        performance: {
          bpm: 120,
          formation: "side-by-side",
          cast: {
            count: 2,
            defaults: { prop: "fan" },
            performers: [
              {
                id: "performer-1",
                propBuild: { fanBuild: "fire", finish: "fire" },
              },
              { id: "performer-2", propBuild: { finish: "day" } },
            ],
          },
        },
      }),
    ]).scenes[0]!;
    expect(spec.performance.performers[0]!.propBuild).toEqual({
      fanBuild: "fire",
      finish: "fire",
    });
    expect(spec.performance.performers[1]!.propBuild).toEqual({ finish: "day" });
  });

  it("leaves the field absent when nobody states a build", () => {
    const spec = resolve([scene({})]).scenes[0]!;
    expect(spec.performance.performers[0]!).not.toHaveProperty("propBuild");
  });

  it("rejects an empty build", () => {
    expect(() =>
      resolve([
        scene({
          performance: {
            bpm: 120,
            formation: "side-by-side",
            cast: {
              count: 2,
              performers: [
                { id: "performer-1", propBuild: {} },
                { id: "performer-2" },
              ],
            },
          },
        }),
      ])
    ).toThrow();
  });
});

describe("gap 26: one effect per hand", () => {
  it("resolves a pair and keeps the whole-performer effect on the left hand", () => {
    const spec = resolve([
      scene({
        performance: {
          bpm: 120,
          formation: "side-by-side",
          cast: {
            count: 2,
            performers: [
              { id: "performer-1", effect: { left: "fire", right: "led" } },
              { id: "performer-2", effect: "trails" },
            ],
          },
        },
      }),
    ]).scenes[0]!;
    const [split, matched] = spec.performance.performers;
    expect(split!.handEffects).toEqual({ left: "fire", right: "led" });
    expect(split!.effect).toBe("fire");
    expect(matched!).not.toHaveProperty("handEffects");
    expect(matched!.effect).toBe("trails");
  });

  it("resolves a pair on a step entry", () => {
    const spec = resolve([
      scene({
        performance: {
          bpm: 120,
          formation: "side-by-side",
          cast: {
            count: 2,
            performers: [
              {
                id: "performer-1",
                stepEffects: [
                  { step: 4, effect: { left: "sparkles", right: "ghost" } },
                ],
              },
              { id: "performer-2" },
            ],
          },
        },
      }),
    ]).scenes[0]!;
    expect(spec.performance.performers[0]!.stepEffects).toEqual([
      {
        step: 4,
        effect: "sparkles",
        handEffects: { left: "sparkles", right: "ghost" },
      },
    ]);
  });

  it("resolves a directive on each hand independently", () => {
    const spec = resolve([
      scene({
        performance: {
          bpm: 120,
          formation: "side-by-side",
          cast: {
            count: 2,
            defaults: {
              effect: {
                left: { oneOf: ["fire"] },
                right: { oneOf: ["led"] },
              },
            },
          },
        },
      }),
    ]).scenes[0]!;
    for (const performer of spec.performance.performers) {
      expect(performer.handEffects).toEqual({ left: "fire", right: "led" });
    }
  });

  it("writes a differing pair through setHandEffects and a matched pair through setEffect", () => {
    const spec = resolve([
      scene({
        durationBeats: 16,
        performance: {
          bpm: 120,
          formation: "side-by-side",
          cast: {
            count: 2,
            performers: [
              {
                id: "performer-1",
                effect: "trails",
                stepEffects: [
                  { step: 4, effect: { left: "fire", right: "led" } },
                  { step: 8, effect: "ghost" },
                ],
              },
              { id: "performer-2" },
            ],
          },
        },
      }),
    ]).scenes[0]!;

    const performer = {
      setEffect: vi.fn(),
      setHandEffects: vi.fn(),
      setEffort: vi.fn(),
      setStaffLengthCm: vi.fn(),
    };
    const viewer = {
      performerManager: { performers: [performer, performer] },
    } as unknown as Viewer3DState;
    const applied = new Map<string, DirectorAppliedStepChange>();

    applyDirectorStepChanges(viewer, spec, [4, 0], applied);
    expect(performer.setHandEffects).toHaveBeenCalledWith("fire", "led", {
      recordUndo: false,
    });
    expect(performer.setEffect).not.toHaveBeenCalled();

    // Same frame again writes nothing.
    performer.setHandEffects.mockClear();
    applyDirectorStepChanges(viewer, spec, [4, 0], applied);
    expect(performer.setHandEffects).not.toHaveBeenCalled();

    // Back to one effect for both hands: the plain setter, which clears the pair.
    applyDirectorStepChanges(viewer, spec, [8, 0], applied);
    expect(performer.setEffect).toHaveBeenCalledWith("ghost", {
      equipBuild: false,
      recordUndo: false,
    });
  });
});
