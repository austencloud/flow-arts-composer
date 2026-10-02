import { describe, expect, it } from "vitest";
import {
  PostProjectSchema,
  POST_BOX,
  type PostAnimationItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addTunnelHook,
  findTunnelHook,
  removeTunnelHook,
  setTunnelHookSpeed,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import {
  tunnelHookArrival,
  tunnelHookCopyOpacity,
} from "$lib/shared/media-composition/domain/tunnel-hook";
import { sampleEasing } from "$lib/shared/media-composition/domain/post-project-keyframes";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { NOW, overlay, project, spans, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };

function withAnimation() {
  return project(
    [video("v1", { start: 0, duration: 10, pinnedStart: true })],
    [
      [
        overlay("anim", "animation", {
          start: 0,
          duration: 10,
          box: { ...POST_BOX.bottom },
          anchor: { itemId: "v1", offset: 0 },
          fill: true,
          animationAppearance: { mandala: true, mandalaThickness: 1.5 },
        } as Partial<PostAnimationItem>),
      ],
    ]
  );
}

describe("tunnel hook clock", () => {
  it("plays the whole sequence once, landing on the last pose", () => {
    expect(tunnelHookArrival(0, 8)).toBe(0);
    expect(tunnelHookArrival(1, 8)).toBe(8);
    expect(tunnelHookArrival(0.5, 8)).toBeCloseTo(4, 6);
    expect(tunnelHookArrival(-1, 8)).toBe(0);
    expect(tunnelHookArrival(2, 8)).toBe(8);
  });

  it("eases in and out so the hand-off lands softly", () => {
    expect(tunnelHookArrival(0.05, 8)).toBeLessThan(0.05 * 8);
    expect(8 - tunnelHookArrival(0.95, 8)).toBeLessThan(0.05 * 8);
  });

  it("uses four moves for a quartered sixteen-move LOOP and lands on the same terminal pose", () => {
    expect(tunnelHookArrival(0, 16, 4)).toBe(12);
    expect(tunnelHookArrival(0.5, 16, 4)).toBe(14);
    expect(tunnelHookArrival(1, 16, 4)).toBe(16);
    expect(
      tunnelHookArrival(0.75, 16, 4) - tunnelHookArrival(0.25, 16, 4)
    ).toBeLessThan(4);
  });

  it("keeps the full pass for other and irregular sequences", () => {
    expect(tunnelHookArrival(0, 16, 1)).toBe(0);
    expect(tunnelHookArrival(0, 8, 4)).toBe(6);
    expect(tunnelHookArrival(0, 15, 4)).toBe(0);
  });
});

describe("tunnel hook performers", () => {
  it("shows every extra performer at the start and none at the end", () => {
    for (let index = 0; index < 7; index++) {
      expect(tunnelHookCopyOpacity(0, index, 7)).toBe(1);
      expect(tunnelHookCopyOpacity(1, index, 7)).toBe(0);
    }
  });

  it("thins the ring one performer after another, outermost last", () => {
    const at = 0.6;
    const opacities = Array.from({ length: 7 }, (_, i) =>
      tunnelHookCopyOpacity(at, i, 7)
    );
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]!).toBeGreaterThanOrEqual(opacities[i - 1]!);
    }
    expect(opacities[0]!).toBeLessThan(opacities[6]!);
  });

  it("has nothing to show without copies", () => {
    expect(tunnelHookCopyOpacity(0.5, 0, 0)).toBe(0);
  });
});

describe("addTunnelHook", () => {
  it("puts a full-frame animation first and moves everything later by its length", () => {
    const before = withAnimation();
    const result = addTunnelHook(before, ctx, { seconds: 5 })!;
    expect(result).not.toBeNull();
    expect(PostProjectSchema.safeParse(result.project).success).toBe(true);

    const hook = findTunnelHook(result.project)!;
    expect(hook.id).toBe(result.itemId);
    expect(hook.start).toBe(0);
    expect(hook.duration).toBe(5);
    expect(hook.box).toEqual(POST_BOX.full);
    // New hooks start on the "Ease out" speed preset.
    expect(hook.tunnelHook).toEqual({
      fold: 8,
      mirror: false,
      speed: [0, 0, 0.58, 1],
    });

    expect(spans(result.project, 0)).toEqual([["v1", 5, 10]]);
    const real = result.project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.id === "anim")!;
    expect(real.start).toBe(5);
  });

  it("hands over to the post's own animation: same look, lands in its box", () => {
    const result = addTunnelHook(withAnimation(), ctx, { seconds: 5 })!;
    const hook = findTunnelHook(result.project)!;
    expect(hook.animationAppearance).toEqual({
      mandala: true,
      mandalaThickness: 1.5,
    });
    const boxes = hook.keyframes!.box!;
    expect(boxes[0]!.value).toEqual(POST_BOX.full);
    expect(boxes[boxes.length - 1]!.value).toEqual(POST_BOX.bottom);
    expect(boxes[boxes.length - 1]!.t).toBeLessThanOrEqual(hook.duration);
  });

  it("pins main clips that would otherwise snap back to zero", () => {
    const before = project(
      [video("v1", { start: 0, duration: 10 })],
      [
        [
          overlay("anim", "animation", {
            start: 0,
            duration: 10,
            anchor: { itemId: "v1", offset: 0 },
            fill: true,
          } as Partial<PostAnimationItem>),
        ],
      ]
    );
    const result = addTunnelHook(before, ctx, { seconds: 4 })!;
    expect(spans(result.project, 0)).toEqual([["v1", 4, 10]]);
  });

  it("will not add a second hook, or one with nothing to hand over to", () => {
    const once = addTunnelHook(withAnimation(), ctx)!;
    expect(addTunnelHook(once.project, ctx)).toBeNull();
    expect(
      addTunnelHook(project([video("v1", { start: 0, duration: 10 })]), ctx)
    ).toBeNull();
  });

  it("is undone exactly by removeTunnelHook", () => {
    const before = withAnimation();
    const added = addTunnelHook(before, ctx, { seconds: 5 })!;
    const restored = removeTunnelHook(added.project, ctx);
    expect(findTunnelHook(restored)).toBeNull();
    expect(spans(restored, 0)).toEqual(spans(before, 0));
    expect(restored.tracks).toHaveLength(before.tracks.length);
    const anim = restored.tracks
      .flatMap((track) => track.items)
      .find((item) => item.id === "anim")!;
    expect(anim.start).toBe(0);
  });
});

describe("tunnel hook in the compiled post", () => {
  const steps = Array.from({ length: 4 }, () => ({
    duration: 1,
  })) as unknown as StepData[];

  it("gives only the hook its own clock", () => {
    const added = addTunnelHook(withAnimation(), ctx, {
      seconds: 5,
      hook: { fold: 8, mirror: false },
    })!;
    const compiled = compilePostProject(added.project, { now: NOW })!;
    const hookClip = compiled.preset.clips.find((clip) =>
      clip.id.startsWith(added.itemId)
    )!;
    expect(hookClip.useResolvedTimeMap).toBe(false);
    expect(hookClip.tunnelHook).toEqual({ fold: 8, mirror: false });
    const real = compiled.preset.clips.find((clip) =>
      clip.id.startsWith("anim")
    )!;
    expect(real.tunnelHook).toBeUndefined();

    const early = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      0.01,
      { steps } as never
    ).find((layer) => layer.clipId === hookClip.id)!;
    const late = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      4.99,
      { steps } as never
    ).find((layer) => layer.clipId === hookClip.id)!;
    expect(early.tunnelHook?.progress).toBeLessThan(0.01);
    expect(early.sequencePosition).toBeLessThan(1.01);
    expect(late.tunnelHook?.progress).toBeGreaterThan(0.99);
    expect(late.sequencePosition).toBeCloseTo(5, 1);
  });

  it("evaluates a quartered sixteen-step hook across only its final four moves", () => {
    // The original symmetric ease, so the midpoint lands halfway.
    const added = addTunnelHook(withAnimation(), ctx, {
      seconds: 5,
      hook: { fold: 8, mirror: false },
    })!;
    const compiled = compilePostProject(added.project, { now: NOW })!;
    const steps16 = Array.from({ length: 16 }, () => ({
      duration: 1,
    })) as unknown as StepData[];
    const hookId = added.itemId;
    const frame = (time: number) =>
      evaluatePresetFrame(compiled.preset, compiled.durationSeconds, time, {
        steps: steps16,
        startPlacementDuration: 1,
        sequencePeriod: 4,
      }).find((layer) => layer.clipId.startsWith(hookId))!;
    expect(frame(0).sequencePosition).toBe(13);
    expect(frame(2.5).sequencePosition).toBe(15);
    expect(frame(5 - 1e-6).sequencePosition).toBeCloseTo(17, 5);
    const atCut = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      5,
      { steps: steps16, startPlacementDuration: 1, sequencePeriod: 4 }
    ).filter((layer) => layer.sourceRole === "sequence-animation");
    expect(atCut.map((layer) => layer.clipId)).toEqual(["anim~0"]);
    expect(atCut[0]?.regionId).toBe("anim");
  });
});

describe("tunnel hook speed curve", () => {
  it("a linear curve plays the sequence at an even pace", () => {
    const linear = (p: number) => sampleEasing([0, 0, 1, 1], p);
    expect(tunnelHookArrival(0.25, 8, 1, linear)).toBeCloseTo(2, 3);
    expect(tunnelHookArrival(0.5, 8, 1, linear)).toBeCloseTo(4, 3);
    expect(tunnelHookArrival(1, 8, 1, linear)).toBeCloseTo(8, 6);
  });

  it("an ease-out curve starts fast and settles, and never leaves the sequence", () => {
    const out = (p: number) => sampleEasing([0, 0, 0.58, 1], p);
    expect(tunnelHookArrival(0.25, 8, 1, out)).toBeGreaterThan(2);
    const overshoot = (p: number) => sampleEasing([0.34, 1.56, 0.64, 1], p);
    for (const p of [0.2, 0.4, 0.6, 0.8]) {
      expect(tunnelHookArrival(p, 8, 1, overshoot)).toBeLessThanOrEqual(8);
    }
  });

  it("stores a chosen curve on the hook and drops it to return to the default", () => {
    const added = addTunnelHook(withAnimation(), ctx)!;
    const set = setTunnelHookSpeed(added.project, [0, 0, 1, 1], ctx);
    expect(PostProjectSchema.safeParse(set).success).toBe(true);
    expect(findTunnelHook(set)!.tunnelHook).toEqual({
      fold: 8,
      mirror: false,
      speed: [0, 0, 1, 1],
    });
    const cleared = setTunnelHookSpeed(set, null, ctx);
    expect(findTunnelHook(cleared)!.tunnelHook).toEqual({
      fold: 8,
      mirror: false,
    });
  });

  it("the post's frames follow the chosen curve", () => {
    const steps = Array.from({ length: 8 }, () => ({
      duration: 1,
    })) as unknown as StepData[];
    const added = addTunnelHook(withAnimation(), ctx, { seconds: 5 })!;
    const frameAt = (project: typeof added.project, t: number) => {
      const compiled = compilePostProject(project, { now: NOW })!;
      const hookClip = compiled.preset.clips.find((clip) =>
        clip.id.startsWith(added.itemId)
      )!;
      return evaluatePresetFrame(compiled.preset, compiled.durationSeconds, t, {
        steps,
      } as never).find((layer) => layer.clipId === hookClip.id)!;
    };
    const linear = setTunnelHookSpeed(added.project, [0, 0, 1, 1], ctx);
    const quarter = frameAt(linear, 1.25).sequencePosition!;
    const smooth = frameAt(
      setTunnelHookSpeed(added.project, null, ctx),
      1.25
    ).sequencePosition!;
    expect(quarter).toBeCloseTo(3, 1);
    expect(smooth).toBeLessThan(quarter);
  });
});
