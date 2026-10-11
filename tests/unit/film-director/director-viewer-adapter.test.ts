/**
 * Task 3 of docs/superpowers/plans/2026-08-24-film-director-plane-axes.md:
 * "wire resolved planes into the viewer." Task 2 (already landed) taught
 * `resolveFilmDirectorSpec` to resolve leftPlane/rightPlane/stepPlanes per
 * performer and scene.visiblePlanes per scene. This file proves the adapter
 * actually carries those resolved values onto the viewer/character-instance
 * layer:
 *
 *  (a) `buildDirectorViewerSeed` puts the resolved planes on the seed.
 *  (b) `applyDirectorSceneToViewer` clears a PREVIOUS scene's per-step plane
 *      overrides before the next scene's (possibly empty) list is applied -
 *      a stale override must never bleed into a cut that doesn't repeat it.
 *  (c) `applyDirectorSceneToViewer` sets whole-sequence hand planes on a
 *      REUSED performer instance across a scene transition.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Plane } from "@austencloud/scene-3d";

import { resolveFilmDirectorSpec } from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";
import {
  applyDirectorSceneToViewer,
  applyDirectorStepChanges,
  buildDirectorViewerSeed,
  idlePerformerIndices,
  type DirectorAppliedStepChange,
} from "../../../src/routes/test/film-director/_lib/director-viewer-adapter";
import type { Viewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import type { ResolvedDirectorScene } from "../../../src/routes/test/film-director/_lib/film-director-schema";
import { createViewer3DStateForTest } from "../3d-viewer/viewer3d-test-helpers.svelte";
import { __resetWebGL2CapabilityForTests } from "#lib/shared/3d/capabilities/webgl-capabilities.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";

const demoSequence = demoSequenceJson as unknown as SequenceData;

// jsdom doesn't implement canvas.getContext - stub it so the WebGL2
// capability probe sees "not supported" rather than throwing. Same pattern
// as tests/unit/3d-viewer/viewer3d-integration.test.ts.
beforeAll(() => {
  const originalCreateElement = document.createElement.bind(
    document
  ) as unknown as (tag: string) => unknown;
  (
    document as unknown as { createElement: (tag: string) => unknown }
  ).createElement = (tag: string) => {
    const base = originalCreateElement(tag) as Record<string, unknown>;
    if (tag === "canvas") {
      base.getContext = () => null;
    }
    return base;
  };
  __resetWebGL2CapabilityForTests();
});

function film(
  scene: Record<string, unknown>,
  extras: Record<string, unknown> = {}
) {
  return {
    version: 2,
    id: "viewer-adapter-film",
    title: "Viewer Adapter Film",
    scenes: [{ id: "s1", title: "S1", ...scene }],
    ...extras,
  };
}

describe("buildDirectorViewerSeed carries resolved planes", () => {
  it("seeds each performer's customBluePlane/customRedPlane from the resolved leftPlane/rightPlane", () => {
    const spec = resolveFilmDirectorSpec(
      film({
        performance: {
          cast: {
            count: 2,
            performers: [
              { id: "performer-1", leftPlane: "wheel", rightPlane: "floor" },
              { id: "performer-2", leftPlane: "right-shield" },
            ],
          },
        },
      })
    );
    const scene = spec.scenes[0]!;
    const seed = buildDirectorViewerSeed(scene);

    expect(seed.performers).toHaveLength(2);
    scene.performance.performers.forEach((performer, index) => {
      const seededPerformer = seed.performers![index]!;
      expect(seededPerformer.customLeftPlane).toBe(performer.leftPlane);
      expect(seededPerformer.customRightPlane).toBe(performer.rightPlane);
    });
    expect(seed.performers![0]!.customLeftPlane).toBe(Plane.WHEEL);
    expect(seed.performers![0]!.customRightPlane).toBe(Plane.FLOOR);
    expect(seed.performers![1]!.customLeftPlane).toBe(Plane.RIGHT_SHIELD);
  });

  it("seeds visiblePlanes from the resolved scene.visiblePlanes", () => {
    const spec = resolveFilmDirectorSpec(
      film({
        location: { visiblePlanes: ["wall", "wheel"] },
        performance: { cast: { count: 1 } },
      })
    );
    const scene = spec.scenes[0]!;
    expect(scene.location.visiblePlanes).toEqual([Plane.WALL, Plane.WHEEL]);

    const seed = buildDirectorViewerSeed(scene);
    expect(seed.visiblePlanes).toEqual([Plane.WALL, Plane.WHEEL]);
  });

  it("defaults to no visible planes when the scene doesn't request any", () => {
    const spec = resolveFilmDirectorSpec(
      film({ performance: { cast: { count: 1 } } })
    );
    const seed = buildDirectorViewerSeed(spec.scenes[0]!);
    expect(seed.visiblePlanes).toEqual([]);
  });
});

describe("applyDirectorSceneToViewer wires planes onto real character instances", () => {
  it("sets hand planes and step overrides on scene A, then on scene B (reused instance) clears A's stale step overrides and applies B's own hand planes", () => {
    const { state, dispose } = createViewer3DStateForTest({});
    try {
      state.performerManager.initialize();
      state.loadSequenceScoped(demoSequence);
      expect(state.currentSequenceData).toEqual(demoSequence);
      expect(state.performerManager.performers).toHaveLength(1);

      const sceneA = resolveFilmDirectorSpec(
        film({
          performance: {
            cast: {
              count: 1,
              performers: [
                {
                  id: "performer-1",
                  leftPlane: "wheel",
                  rightPlane: "floor",
                  stepPlanes: [
                    { step: 1, hand: "left", plane: "floor" },
                    { step: 3, hand: "right", plane: "wheel" },
                  ],
                },
              ],
            },
          },
        })
      ).scenes[0]!;

      applyDirectorSceneToViewer(state, sceneA, { reservedPerformerCount: 1 });

      const performer = state.performerManager.performers[0]!;
      // Reused-instance identity across the whole test: scene A and scene B
      // both target this exact CharacterInstanceState.
      expect(state.performerManager.performers).toHaveLength(1);

      expect(performer.customLeftPlane).toBe(Plane.WHEEL);
      expect(performer.customRightPlane).toBe(Plane.FLOOR);
      // Un-overridden hands report the performer's effective whole-sequence
      // plane (wheel/floor here), not a hardcoded WALL.
      expect(performer.getStepPlanes(1)).toEqual({
        left: Plane.FLOOR,
        right: Plane.FLOOR,
      });
      expect(performer.getStepPlanes(3)).toEqual({
        left: Plane.WHEEL,
        right: Plane.WHEEL,
      });
      // A step nobody touched reports the whole-sequence hand planes.
      expect(performer.getStepPlanes(0)).toEqual({
        left: Plane.WHEEL,
        right: Plane.FLOOR,
      });

      const sceneB = resolveFilmDirectorSpec(
        film({
          performance: {
            cast: {
              count: 1,
              performers: [
                {
                  id: "performer-1",
                  leftPlane: "right-shield",
                  rightPlane: "wall",
                },
              ],
            },
          },
        })
      ).scenes[0]!;

      applyDirectorSceneToViewer(state, sceneB, { reservedPerformerCount: 1 });

      // Still the same single pooled instance - proves (c): hand planes were
      // set on a REUSED performer, not a freshly created one.
      expect(state.performerManager.performers).toHaveLength(1);
      expect(state.performerManager.performers[0]).toBe(performer);

      expect(performer.customLeftPlane).toBe(Plane.RIGHT_SHIELD);
      expect(performer.customRightPlane).toBe(Plane.WALL);

      // Proves (b): scene A's per-step overrides do not survive into scene B,
      // which declares no stepPlanes of its own. Every step reports scene B's
      // whole-sequence hand planes.
      expect(performer.getStepPlanes(1)).toEqual({
        left: Plane.RIGHT_SHIELD,
        right: Plane.WALL,
      });
      expect(performer.getStepPlanes(3)).toEqual({
        left: Plane.RIGHT_SHIELD,
        right: Plane.WALL,
      });
    } finally {
      dispose();
    }
  });

  it("backfills loadSequence onto a pooled performer created beyond the first scene's cast, so its step-plane overrides are not silently dropped", () => {
    const { state, dispose } = createViewer3DStateForTest({});
    try {
      state.performerManager.initialize();
      state.loadSequenceScoped(demoSequence);
      expect(state.performerManager.performers).toHaveLength(1);

      const scene = resolveFilmDirectorSpec(
        film({
          performance: {
            cast: {
              count: 2,
              performers: [
                { id: "performer-1" },
                {
                  id: "performer-2",
                  leftPlane: "floor",
                  stepPlanes: [{ step: 2, hand: "left", plane: "floor" }],
                },
              ],
            },
          },
        })
      ).scenes[0]!;

      // reservedPerformerCount: 2 forces ensurePerformerCount to grow the
      // pool - the newly created 2nd performer never went through enter3D's
      // sequence load, so without the adapter's backfill its
      // setStepHandPlane call below would no-op forever.
      applyDirectorSceneToViewer(state, scene, { reservedPerformerCount: 2 });

      expect(state.performerManager.performers).toHaveLength(2);
      const secondPerformer = state.performerManager.performers[1]!;
      expect(secondPerformer.hasSequence).toBe(true);
      expect(secondPerformer.customLeftPlane).toBe(Plane.FLOOR);
      expect(secondPerformer.getStepPlanes(2)).toEqual({
        left: Plane.FLOOR,
        right: Plane.WALL,
      });
    } finally {
      dispose();
    }
  });
});

describe("idle performers", () => {
  it("names the cast slots that spin nothing", () => {
    const scene = {
      performance: {
        performers: [
          { id: "a", sequence: { source: "demo" } },
          { id: "b", sequence: { source: "none" } },
          { id: "c", sequence: { word: "AB" } },
        ],
      },
    } as unknown as ResolvedDirectorScene;
    expect([...idlePerformerIndices(scene)]).toEqual([1]);
  });
});

describe("applyDirectorStepChanges", () => {
  // The plane tests above drive a real Viewer3DState because they assert on
  // real character-instance plane state. This one asserts on CALLS, so it uses
  // a stub carrying only what applyDirectorStepChanges reaches for:
  // viewer.performerManager.performers[i].setEffect/setEffort.
  function fakeViewer(count: number) {
    const performers = Array.from({ length: count }, () => ({
      setEffect: vi.fn(),
      setEffort: vi.fn(),
    }));
    return {
      viewer: { performerManager: { performers } } as unknown as Viewer3DState,
      performers,
    };
  }

  function stepScene() {
    return resolveFilmDirectorSpec({
      version: 5,
      id: "step-film",
      title: "Step Film",
      scenes: [
        {
          id: "s1",
          title: "S1",
          performance: {
            cast: {
              count: 2,
              performers: [
                {
                  id: "performer-1",
                  effect: "none",
                  effort: "linear",
                  stepEffects: [
                    { step: 4, effect: "trails" },
                    { step: 8, effect: "fire" },
                  ],
                  stepEfforts: [{ step: 8, effort: "punch" }],
                },
                { id: "performer-2" },
              ],
            },
          },
        },
      ],
    }).scenes[0]!;
  }

  it("writes only when the value changes, and never for a performer with no entries", () => {
    const scene = stepScene();
    const { viewer, performers } = fakeViewer(2);
    const applied = new Map<string, DirectorAppliedStepChange>();
    const calls = () =>
      performers.map((performer) => ({
        effect: performer.setEffect.mock.calls.length,
        effort: performer.setEffort.mock.calls.length,
      }));

    applyDirectorStepChanges(viewer, scene, [3, 3], applied);
    expect(calls()[0]).toEqual({ effect: 0, effort: 0 });

    applyDirectorStepChanges(viewer, scene, [4, 4], applied);
    applyDirectorStepChanges(viewer, scene, [5, 5], applied);
    applyDirectorStepChanges(viewer, scene, [6, 6], applied);
    expect(calls()[0]).toEqual({ effect: 1, effort: 0 });
    const performer = performers[0]!;
    expect(performer.setEffect).toHaveBeenLastCalledWith("trails", {
      equipBuild: false,
      recordUndo: false,
    });

    applyDirectorStepChanges(viewer, scene, [8, 8], applied);
    expect(calls()[0]).toEqual({ effect: 2, effort: 1 });
    expect(performer.setEffort).toHaveBeenLastCalledWith("punch", {
      recordUndo: false,
    });

    // performer-2 states no per-step entries, so no frame ever writes to it.
    expect(calls()[1]).toEqual({ effect: 0, effort: 0 });
  });

  it("returns to the scene's base value when the playhead loops back", () => {
    const scene = stepScene();
    const { viewer, performers } = fakeViewer(2);
    const applied = new Map<string, DirectorAppliedStepChange>();
    applyDirectorStepChanges(viewer, scene, [8, 8], applied);
    applyDirectorStepChanges(viewer, scene, [0, 0], applied);
    expect(performers[0]!.setEffect).toHaveBeenLastCalledWith("none", {
      equipBuild: false,
      recordUndo: false,
    });
  });
});

/**
 * Gap 21. A scene can cast nobody. The pool is kept alive across cuts, so an
 * empty stage has to actively empty the rigs left over from the scene before
 * it rather than simply having no performers of its own to apply.
 */
describe("applyDirectorSceneToViewer with an empty cast", () => {
  it("applies without throwing and leaves every pooled performer idle", () => {
    const { state, dispose } = createViewer3DStateForTest({});
    try {
      state.performerManager.initialize();
      state.loadSequenceScoped(demoSequence);

      const cast = resolveFilmDirectorSpec(
        film({ performance: { cast: { count: 1 } } })
      ).scenes[0]!;
      applyDirectorSceneToViewer(state, cast, { reservedPerformerCount: 1 });
      expect(state.performerManager.performers[0]!.hasSequence).toBe(true);

      const empty = resolveFilmDirectorSpec(
        film({
          durationSeconds: 3,
          performance: { cast: { count: 0 } },
        })
      ).scenes[0]!;
      expect(empty.performance.performers).toEqual([]);

      applyDirectorSceneToViewer(state, empty, { reservedPerformerCount: 1 });
      for (const performer of state.performerManager.performers) {
        expect(performer.hasSequence).toBe(false);
      }
    } finally {
      dispose();
    }
  });

  it("seeds a viewer with no performers", () => {
    const empty = resolveFilmDirectorSpec(
      film({ durationSeconds: 3, performance: { cast: { count: 0 } } })
    ).scenes[0]!;
    const seed = buildDirectorViewerSeed(empty);
    expect(seed.performers).toEqual([]);
    expect(idlePerformerIndices(empty).size).toBe(0);
  });
});
