import { describe, expect, it } from "vitest";
import {
  POST_BOX,
  type PostAnimationItem,
  type PostMovesItem,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { takeRole } from "$lib/shared/media-composition/domain/post-plan-compiler";
import {
  pipHandoffLanding,
  pipHandoffOf,
  pipHandoffSample,
  type PipHandoffClocks,
} from "$lib/shared/media-composition/domain/pip-handoff";
import type { TakeSample } from "$lib/shared/media-composition/domain/take-timing";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { NOW, overlay, project, video } from "./post-project-fixtures";

const MOVES = 16;
const CORNER = { x: 0.6, y: 0.78, width: 0.4, height: 0.22 };
const handoff = { start: 9, end: 10 };

/** Full speed: two moves a second, landing its second pass at 9.9. */
const fast = (seconds: number): TakeSample => ({
  arrival: Math.min(32, 32 - 2 * (9.9 - seconds)),
  endArrival: 32,
});
/** Half that and slower: a move every two seconds from beat one. */
const slow =
  (beatOne: number) =>
  (seconds: number): TakeSample => ({
    arrival: Math.max(0, (seconds - beatOne) / 2),
    endArrival: 16,
  });
const clocks = (beatOne: number): PipHandoffClocks => ({
  from: fast,
  to: slow(beatOne),
  passLength: MOVES,
});
/** The pose an arrival shows, folded into one pass. */
const pose = (arrival: number) => ((arrival % MOVES) + MOVES) % MOVES;

describe("picture-in-picture hand-off clock", () => {
  it("finds where the animation lands on the opening pose", () => {
    const landing = pipHandoffLanding(handoff, clocks(9.1))!;
    expect(landing.at).toBeCloseTo(9.9, 3);
    expect(landing.arrival).toBe(32);
    expect(landing.rate).toBeCloseTo(2, 2);
  });

  it("lands the animation before the square starts its slower pass", () => {
    const at = (time: number, side: "from" | "to") =>
      pipHandoffSample(handoff, clocks(9.1), time, side)!.arrival;
    // The animation keeps its own clock up to the landing; the square shows
    // the same moves, counted on its own pass.
    for (const time of [9, 9.3, 9.6, 9.89]) {
      expect(at(time, "from")).toBeCloseTo(fast(time).arrival, 9);
      expect(pose(at(time, "to"))).toBeCloseTo(pose(fast(time).arrival), 9);
      expect(at(time, "to")).toBeLessThan(MOVES);
    }
    expect(pose(at(9.9001, "to"))).toBeLessThan(1e-3);
    // Then it eases from full pace into the square's and meets it: two
    // moves a second down to a half, covering the 0.4 it is behind.
    const meets = 9.9 + (2 * 0.4) / (2 - 0.5);
    let previous = at(9.9001, "to");
    let fastest = 0;
    for (let time = 9.91; time < meets; time += 0.01) {
      const next = at(time, "to");
      const pace = (next - previous) / 0.01;
      expect(pace).toBeGreaterThanOrEqual(0.5 - 0.05);
      expect(pace).toBeLessThanOrEqual(2 + 0.05);
      fastest = Math.max(fastest, pace);
      previous = next;
    }
    expect(fastest).toBeGreaterThan(1.5);
    expect(at(meets + 0.01, "to")).toBeCloseTo(
      slow(9.1)(meets + 0.01).arrival,
      9
    );
    expect(at(meets + 0.01, "from")).toBeCloseTo(
      slow(9.1)(meets + 0.01).arrival,
      9
    );
  });

  it("holds the opening pose until a later slow pass begins", () => {
    const at = (time: number) =>
      pipHandoffSample(handoff, clocks(10.4), time, "to")!.arrival;
    expect(at(9.95)).toBe(0);
    expect(at(10.3)).toBe(0);
    expect(at(10.6)).toBeCloseTo(0.1, 9);
  });

  it("meets the square from the overlap when the animation never lands in it", () => {
    const midPass: PipHandoffClocks = {
      from: (seconds) => ({
        arrival: 20 + 2 * (seconds - 9),
        endArrival: null,
      }),
      to: slow(9.1),
      passLength: MOVES,
    };
    expect(pipHandoffLanding(handoff, midPass)).toBeNull();
    const first = pipHandoffSample(handoff, midPass, 9, "to")!.arrival;
    expect(pose(first)).toBeCloseTo(pose(20), 9);
    expect(pipHandoffSample(handoff, midPass, 14.5, "to")!.arrival).toBeCloseTo(
      slow(9.1)(14.5).arrival,
      9
    );
  });
});

function handoffProject(movesOnTop: boolean) {
  const anim = overlay("anim", "animation", {
    start: 0,
    duration: 10,
    box: { ...POST_BOX.bottom },
    anchor: { itemId: "v1", offset: 0 },
    fadeOut: 1,
    animationAppearance: { mandala: true },
  } as Partial<PostAnimationItem>);
  const pip = overlay("pip", "moves", {
    start: 9,
    duration: 12,
    box: { ...CORNER },
    anchor: { itemId: "v2", offset: 0 },
    fill: true,
    animationAppearance: { mandala: false },
  } as Partial<PostMovesItem>);
  return project(
    [
      video("v1", {
        start: 0,
        pinnedStart: true,
        transitionOut: { duration: 1, type: "crossfade", incomingId: "v2" },
      } as Partial<PostVideoItem>),
      video("v2", {
        takeId: "b",
        start: 9,
        sourceIn: 0,
        sourceOut: 12,
        pinnedStart: true,
      }),
    ],
    movesOnTop ? [[anim], [pip]] : [[pip], [anim]]
  );
}

describe("picture-in-picture hand-off", () => {
  it("finds the animation and the square it shrinks into", () => {
    const found = pipHandoffOf(handoffProject(true))!;
    expect(found.animation.id).toBe("anim");
    expect(found.moves.id).toBe("pip");
    expect(found.movesOnTop).toBe(true);
    expect([found.start, found.end]).toEqual([9, 10]);
    expect(pipHandoffOf(handoffProject(false))!.movesOnTop).toBe(false);
  });

  it("shrinks the animation into the square and draws one figure", () => {
    const compiled = compilePostProject(handoffProject(true), { now: NOW })!;
    const steps = Array.from({ length: MOVES }, () => ({
      duration: 1,
    })) as unknown as StepData[];
    const alignment = {
      steps,
      startPlacementDuration: 1,
      clocks: {
        // Media time equals post time on the first take and runs from 9 on
        // the second.
        [takeRole("a")]: { sampleAt: (media: number) => fast(media) },
        [takeRole("b")]: {
          sampleAt: (media: number) => slow(9.1)(media + 9),
        },
      },
    };
    const frame = (time: number) =>
      evaluatePresetFrame(
        compiled.preset,
        compiled.durationSeconds,
        time,
        alignment as never
      );
    const layer = (time: number, id: string) =>
      frame(time).find((entry) => entry.regionId === id);

    // One box, from the animation's into the square's.
    expect(layer(9, "anim")!.regionRect).toMatchObject(POST_BOX.bottom);
    expect(layer(9.5, "pip")!.regionRect).toEqual(
      layer(9.5, "anim")!.regionRect
    );
    expect(layer(9.5, "pip")!.regionRect!.width).toBeLessThan(1);
    expect(layer(9.5, "pip")!.regionRect!.width).toBeGreaterThan(CORNER.width);
    expect(layer(10, "pip")!.regionRect).toMatchObject(CORNER);

    // The square dissolves in over a solid animation.
    expect(layer(9.5, "anim")!.opacity).toBe(1);
    expect(layer(9.5, "pip")!.opacity).toBeGreaterThan(0.2);
    expect(layer(9.5, "pip")!.opacity).toBeLessThan(0.8);
    expect(layer(10, "pip")!.opacity).toBe(1);

    // Same pose on both, the square on its own first pass.
    for (const time of [9.2, 9.6, 9.95]) {
      expect(layer(time, "pip")!.sequencePosition).toBeCloseTo(
        layer(time, "anim")!.sequencePosition! === 17
          ? 1
          : layer(time, "anim")!.sequencePosition!,
        6
      );
      expect(layer(time, "pip")!.sequencePassIndex).toBe(0);
    }
  });

  it("dissolves the animation away when it draws above the square", () => {
    const compiled = compilePostProject(handoffProject(false), { now: NOW })!;
    const clip = (prefix: string) =>
      compiled.preset.clips.filter(
        (entry) => entry.kind === "visual" && entry.id.startsWith(prefix)
      ) as Extract<
        (typeof compiled.preset.clips)[number],
        { kind: "visual" }
      >[];
    expect(clip("anim").at(-1)!.fadeOutSeconds).toBe(1);
    expect(clip("pip")[0]!.fadeInSeconds).toBeUndefined();
    expect(clip("anim").at(-1)!.clockHandoff).toMatchObject({
      id: "anim",
      role: "from",
    });
    expect(clip("pip")[0]!.clockHandoff).toMatchObject({
      id: "anim",
      role: "to",
    });
  });
});
