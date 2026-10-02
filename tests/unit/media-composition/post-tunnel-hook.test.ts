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
import { normalizeProject as finishProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import {
  tunnelHookArrival,
  TUNNEL_HOOK_CHROME_SECONDS,
  tunnelHookChromeOpacity,
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

  it("ends on the landing the animation takes over at, mid-move included", () => {
    expect(tunnelHookArrival(0, 16, 4, undefined, 15.85)).toBeCloseTo(11.85, 9);
    expect(tunnelHookArrival(1, 16, 4, undefined, 15.85)).toBeCloseTo(15.85, 9);
    expect(tunnelHookArrival(1, 16, 4, undefined, 31.85)).toBeCloseTo(31.85, 9);
  });

  it("moves a landing too early for a whole pass one pass later, the same pose", () => {
    expect(tunnelHookArrival(0, 16, 4, undefined, 2.5)).toBe(14.5);
    expect(tunnelHookArrival(1, 16, 4, undefined, 2.5)).toBe(18.5);
    expect(tunnelHookArrival(1, 8, 1, undefined, 0)).toBe(8);
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
  it("gives the animation itself an opening and moves what it follows later", () => {
    const before = withAnimation();
    const result = addTunnelHook(before, ctx, { seconds: 5 })!;
    expect(result).not.toBeNull();
    expect(PostProjectSchema.safeParse(result.project).success).toBe(true);

    // One animation item: it starts where the post started, is as long as the
    // footage plus the opening, and keeps its own box.
    const animations = result.project.tracks
      .flatMap((track) => track.items)
      .filter((item) => item.kind === "animation");
    expect(animations).toHaveLength(1);
    const hook = findTunnelHook(result.project)!;
    expect(hook.id).toBe("anim");
    expect(result.itemId).toBe("anim");
    expect(hook.start).toBe(0);
    expect(hook.duration).toBe(15);
    expect(hook.box).toEqual(POST_BOX.bottom);
    expect(hook.animationAppearance).toEqual({
      mandala: true,
      mandalaThickness: 1.5,
    });
    // New hooks start on the "Ease out" speed preset.
    expect(hook.tunnelHook).toEqual({
      fold: 8,
      mirror: false,
      speed: [0, 0, 0.58, 1],
      seconds: 5,
    });
    expect(spans(result.project, 0)).toEqual([["v1", 5, 10]]);
  });

  it("opens on the full frame and lands in the animation's own box", () => {
    const result = addTunnelHook(withAnimation(), ctx, { seconds: 5 })!;
    const compiled = compilePostProject(result.project, { now: NOW })!;
    const keys = compiled.preset.regionKeyframes!.find(
      (track) => track.regionId === "anim"
    )!.keyframes;
    expect(keys[0]!.atSeconds).toBe(0);
    expect(keys[0]!.value).toMatchObject(POST_BOX.full);
    const last = keys[keys.length - 1]!;
    expect(last.value).toMatchObject(POST_BOX.bottom);
    expect(last.atSeconds).toBeLessThanOrEqual(5);
  });

  it("keeps the item's own keyframes where they were in the post", () => {
    const base = withAnimation();
    const withKey = {
      ...base,
      tracks: base.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) =>
          item.id === "anim"
            ? {
                ...item,
                keyframes: {
                  opacity: [{ t: 4, value: 0.5, easing: "hold" as const }],
                },
              }
            : item
        ),
      })),
    };
    const result = addTunnelHook(withKey, ctx, { seconds: 5 })!;
    expect(findTunnelHook(result.project)!.keyframes!.opacity![0]!.t).toBe(9);
    const restored = removeTunnelHook(result.project, ctx);
    const anim = restored.tracks
      .flatMap((track) => track.items)
      .find((item) => item.id === "anim")!;
    expect(anim.keyframes!.opacity![0]!.t).toBe(4);
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

  it("will not add a second hook, or one with no animation to open", () => {
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
    expect(anim.duration).toBe(10);
    expect(anim).toMatchObject({ box: POST_BOX.bottom });
  });
});

describe("hooks saved as a separate item", () => {
  function separate(fill = true) {
    return project(
      [video("v1", { start: 5, duration: 10, pinnedStart: true })],
      [
        [
          overlay("anim", "animation", {
            start: 5,
            duration: 10,
            box: { ...POST_BOX.bottom },
            anchor: { itemId: "v1", offset: 0 },
            fill,
            animationAppearance: { mandala: true },
          } as Partial<PostAnimationItem>),
        ],
        [
          overlay("hook", "animation", {
            start: 0,
            duration: 5,
            box: { ...POST_BOX.full },
            animationAppearance: { mandala: false },
            tunnelHook: { fold: 8, mirror: false },
          } as Partial<PostAnimationItem>),
        ],
      ]
    );
  }

  it("become the animation's own opening when the project is normalized", () => {
    const merged = finishProject(separate());
    const animations = merged.tracks
      .flatMap((track) => track.items)
      .filter((item) => item.kind === "animation");
    expect(animations.map((item) => item.id)).toEqual(["anim"]);
    const hook = findTunnelHook(merged)!;
    expect(hook.start).toBe(0);
    expect(hook.duration).toBe(15);
    expect(hook.tunnelHook).toEqual({ fold: 8, mirror: false, seconds: 5 });
    // The post's own look wins over the stale copy the hook carried.
    expect(hook.animationAppearance).toEqual({ mandala: true });
    expect(merged.tracks).toHaveLength(2);
    expect(PostProjectSchema.safeParse(merged).success).toBe(true);
  });
});

describe("hooks saved with an animation placed against its clip", () => {
  it("open from where the hook began, not where the animation was", () => {
    const merged = finishProject(
      project(
        [video("v1", { start: 5, duration: 10, pinnedStart: true })],
        [
          [
            overlay("anim", "animation", {
              start: 5,
              duration: 10,
              box: { ...POST_BOX.bottom },
              anchor: { itemId: "v1", offset: 0 },
              fill: false,
            } as Partial<PostAnimationItem>),
          ],
          [
            overlay("hook", "animation", {
              start: 0,
              duration: 5,
              box: { ...POST_BOX.full },
              tunnelHook: { fold: 8, mirror: false },
            } as Partial<PostAnimationItem>),
          ],
        ]
      )
    );
    const hook = findTunnelHook(merged)!;
    expect(hook.start).toBe(0);
    expect(hook.duration).toBe(15);
    expect(spans(merged, 0)).toEqual([["v1", 5, 10]]);
  });
});

describe("tunnel hook in the compiled post", () => {
  const steps = Array.from({ length: 4 }, () => ({
    duration: 1,
  })) as unknown as StepData[];

  it("gives only the opening its own clock", () => {
    const added = addTunnelHook(withAnimation(), ctx, {
      seconds: 5,
      hook: { fold: 8, mirror: false },
    })!;
    const compiled = compilePostProject(added.project, { now: NOW })!;
    const clips = compiled.preset.clips.filter((clip) =>
      clip.id.startsWith("anim~")
    );
    expect(clips).toHaveLength(2);
    const [intro, body] = clips as [(typeof clips)[0], (typeof clips)[0]];
    expect(intro.useResolvedTimeMap).toBe(false);
    expect(intro.tunnelHook).toEqual({ fold: 8, mirror: false, seconds: 5 });
    expect(body.tunnelHook).toBeUndefined();
    expect(body.useResolvedTimeMap).toBe(true);
    // One region, so the canvas never changes hands.
    expect(new Set(clips.map((clip) => clip.regionId))).toEqual(
      new Set(["anim"])
    );

    const early = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      0.01,
      { steps } as never
    ).find((layer) => layer.clipId === intro.id)!;
    const late = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      4.99,
      { steps } as never
    ).find((layer) => layer.clipId === intro.id)!;
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
    const frame = (time: number) =>
      evaluatePresetFrame(compiled.preset, compiled.durationSeconds, time, {
        steps: steps16,
        startPlacementDuration: 1,
        sequencePeriod: 4,
      }).find((layer) => layer.clipId === "anim~0")!;
    expect(frame(0).sequencePosition).toBe(13);
    expect(frame(2.5).sequencePosition).toBe(15);
    expect(frame(5 - 1e-6).sequencePosition).toBeCloseTo(17, 5);
    const atCut = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      5,
      { steps: steps16, startPlacementDuration: 1, sequencePeriod: 4 }
    ).filter((layer) => layer.sourceRole === "sequence-animation");
    expect(atCut.map((layer) => layer.clipId)).toEqual(["anim~1"]);
    expect(atCut[0]?.regionId).toBe("anim");
  });

  it("lands where the footage's clock picks up, so the pair never steps back", () => {
    // The take's footage starts mid-move: the mapped pass is 0.85 into the
    // last move when the intro hands over.
    const added = addTunnelHook(withAnimation(), ctx, {
      seconds: 5,
      hook: { fold: 8, mirror: false, speed: [0, 0, 0.58, 1] },
    })!;
    const compiled = compilePostProject(added.project, { now: NOW })!;
    const body = compiled.preset.clips.find((clip) => clip.id === "anim~1")!;
    expect(body.kind === "visual" && body.timeMapRole).toBeTruthy();
    const role = (body as { timeMapRole: string }).timeMapRole;
    const steps16 = Array.from({ length: 16 }, () => ({
      duration: 1,
    })) as unknown as StepData[];
    const alignment = {
      steps: steps16,
      startPlacementDuration: 1,
      sequencePeriod: 4,
      clocks: {
        [role]: {
          sampleAt: (media: number) => ({
            arrival: 15.85 + media * 1.5,
            endArrival: null,
          }),
        },
      },
    };
    const position = (time: number) =>
      evaluatePresetFrame(
        compiled.preset,
        compiled.durationSeconds,
        time,
        alignment
      ).find((layer) => layer.sourceRole === "sequence-animation")!
        .sequencePosition!;

    const handedOver = position(5);
    expect(handedOver).toBeCloseTo(16.85, 6);
    expect(position(5 - 1e-6)).toBeCloseTo(handedOver, 4);
    // Forward through the whole intro, never back.
    let previous = position(0);
    for (let time = 0.25; time < 5; time += 0.25) {
      const next = position(time);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
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
      seconds: 5,
      speed: [0, 0, 1, 1],
    });
    const cleared = setTunnelHookSpeed(set, null, ctx);
    expect(findTunnelHook(cleared)!.tunnelHook).toEqual({
      fold: 8,
      mirror: false,
      seconds: 5,
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

describe("tunnel hook chrome", () => {
  it("carries no grid, glyph or step number until the hook hands over", () => {
    expect(tunnelHookChromeOpacity(-3)).toBe(0);
    expect(tunnelHookChromeOpacity(0)).toBe(0);
  });

  it("fades them in over the hand-off and then holds", () => {
    const half = tunnelHookChromeOpacity(TUNNEL_HOOK_CHROME_SECONDS / 2);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    expect(tunnelHookChromeOpacity(TUNNEL_HOOK_CHROME_SECONDS)).toBe(1);
    expect(tunnelHookChromeOpacity(30)).toBe(1);
  });
});
