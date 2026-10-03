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

/**
 * An animation and the square it shrinks into. Unless `shared`, the square
 * shows a different prop look, which one surface cannot become.
 */
function handoffProject(movesOnTop: boolean, shared = false) {
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
    animationAppearance: {
      mandala: false,
      ...(shared ? {} : { propLook: "model" as const }),
    },
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

function frameOf(compiled: NonNullable<ReturnType<typeof compilePostProject>>) {
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
  return (time: number) =>
    evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      time,
      alignment as never
    );
}

describe("picture-in-picture hand-off", () => {
  it("finds the animation and the square it shrinks into", () => {
    const found = pipHandoffOf(handoffProject(true))!;
    expect(found.animation.id).toBe("anim");
    expect(found.moves.id).toBe("pip");
    expect(found.movesOnTop).toBe(true);
    expect([found.start, found.end]).toEqual([9, 10]);
    expect(found.shared).toBe(false);
    expect(pipHandoffOf(handoffProject(false))!.movesOnTop).toBe(false);
    expect(pipHandoffOf(handoffProject(true, true))!.shared).toBe(true);
  });

  it("shrinks the animation into the square and draws one figure", () => {
    const compiled = compilePostProject(handoffProject(true), { now: NOW })!;
    const frame = frameOf(compiled);
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

describe("picture-in-picture hand-off on one surface", () => {
  const compiled = compilePostProject(handoffProject(true, true), {
    now: NOW,
  })!;
  const frame = frameOf(compiled);
  const sequenceLayers = (time: number) =>
    frame(time).filter((entry) => entry.sourceRole === "sequence-animation");

  it("draws the square on the animation's own region and role", () => {
    const pieces = compiled.preset.clips.filter(
      (entry) =>
        entry.kind === "visual" &&
        (entry.id.startsWith("anim") || entry.id.startsWith("pip"))
    ) as Extract<(typeof compiled.preset.clips)[number], { kind: "visual" }>[];
    expect(new Set(pieces.map((piece) => piece.regionId))).toEqual(
      new Set(["anim"])
    );
    expect(new Set(pieces.map((piece) => piece.sourceRole)).size).toBe(1);
    // Nothing dissolves: the one surface changes its look instead.
    expect(pieces.every((piece) => !piece.fadeInSeconds)).toBe(true);
    expect(pieces.every((piece) => !piece.fadeOutSeconds)).toBe(true);
    // The square still has its own region, for picking it in the editor,
    // and the shared one draws at the higher of the two tracks.
    const regions = new Map(
      compiled.preset.regions.map((entry) => [entry.id, entry])
    );
    expect(regions.has("pip")).toBe(true);
    expect(regions.get("anim")!.zIndex).toBe(regions.get("pip")!.zIndex);
  });

  it("shows exactly one layer at every moment, turning its look", () => {
    for (const time of [8.5, 9, 9.3, 9.6, 9.99, 10, 10.5, 14]) {
      // At a footage cut two pieces of one item meet; the surface follows
      // the later. Never both items.
      const items = new Set(
        sequenceLayers(time).map((entry) => entry.clipId.split("~")[0])
      );
      expect(items.size).toBe(1);
    }
    expect(sequenceLayers(9.5)[0]!.clipId.startsWith("anim")).toBe(true);
    expect(sequenceLayers(10)[0]!.clipId.startsWith("pip")).toBe(true);

    const blend = (time: number) => sequenceLayers(time).at(-1)!.lookBlend;
    expect(blend(8.5)).toBe(0);
    expect(blend(9)).toBe(0);
    expect(blend(9.5)).toBeCloseTo(0.5, 6);
    expect(blend(9.3)!).toBeLessThan(blend(9.6)!);
    expect(blend(9.99)!).toBeGreaterThan(0.99);
    // The square draws its own look; no blend rides on it.
    expect(blend(10)).toBeUndefined();
  });

  it("fades the square's own effects in after it lands, not before", () => {
    const fadeIn = (time: number) => sequenceLayers(time).at(-1)!.effectsIn;
    // The animation keeps its effects (fading by its look blend); the square's
    // start at the landing and arrive over half a second.
    expect(fadeIn(9.5)).toBeUndefined();
    expect(fadeIn(10)).toBe(0);
    expect(fadeIn(10.25)).toBeCloseTo(0.5, 6);
    expect(fadeIn(10.1)!).toBeLessThan(fadeIn(10.4)!);
    expect(fadeIn(10.5)).toBeUndefined();
    expect(fadeIn(14)).toBeUndefined();
  });

  it("follows the same box into the corner and stays there", () => {
    const rect = (time: number) => sequenceLayers(time).at(-1)!.regionRect!;
    expect(rect(9)).toMatchObject(POST_BOX.bottom);
    expect(rect(9.5).width).toBeLessThan(1);
    expect(rect(9.5).width).toBeGreaterThan(CORNER.width);
    expect(rect(10)).toMatchObject(CORNER);
    expect(rect(14)).toMatchObject(CORNER);
  });

  it("hands the figure over at the same pose", () => {
    const before = sequenceLayers(9.9999)[0]!;
    const after = sequenceLayers(10)[0]!;
    expect(after.sequencePosition!).toBeCloseTo(before.sequencePosition!, 2);
    expect(after.sequencePassIndex).toBe(before.sequencePassIndex);
  });
});
