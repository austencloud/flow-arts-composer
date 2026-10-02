import { describe, expect, it } from "vitest";
import {
  PostProjectSchema,
  POST_BOX,
  type PostAnimationItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addTunnelHook,
  findTunnelHook,
  lineUpTunnelHook,
  removeTunnelHook,
  setTunnelHookSpeed,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { normalizeProject as finishProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { takeRole } from "$lib/shared/media-composition/domain/post-plan-compiler";
import {
  tunnelHookArrival,
  TUNNEL_HOOK_BACKDROP_OPACITY,
  TUNNEL_HOOK_CHROME_SECONDS,
  tunnelHookChromeOpacity,
  tunnelHookCopyOpacity,
  tunnelHookPanelOpacity,
} from "$lib/shared/media-composition/domain/tunnel-hook";
import {
  createTakeTiming,
  resolveTakeTiming,
  takePassStartsAround,
  takePositionAt,
  takeSampleAt,
  takeTimingMoveBeats,
  takeTimingMovesKey,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import { sampleEasing } from "$lib/shared/media-composition/domain/post-project-keyframes";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  itemEnd,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  NOW,
  overlay,
  project,
  spans,
  take,
  video,
} from "./post-project-fixtures";

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
    // The opening's titles ride along as a painted clip of their own.
    const clips = compiled.preset.clips.filter(
      (clip) => clip.id.startsWith("anim~") && !clip.id.endsWith("~titles")
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

describe("tunnel hook lined up with its footage", () => {
  const EIGHT = [1, 1, 1, 1, 1, 1, 1, 1];
  const SPB = 60 / 87;
  /** Media time of landing `position` on take "a"; the opening pose is at 1 s. */
  const at = (position: number) => 1 + SPB * position;
  const timing: TakeTiming = (() => {
    const base = createTakeTiming({
      sequenceId: "seq",
      takeKey: "key-a",
      durationSeconds: 60,
      now: 1,
    });
    return {
      ...base,
      movesKey: takeTimingMovesKey(EIGHT),
      sections: [
        {
          ...base.sections[0]!,
          tempo: "locked",
          taps: Array.from({ length: 30 }, (_, index) => at(index + 1)),
        },
      ],
    };
  })();
  const resolved = resolveTakeTiming(timing, EIGHT);

  /** A clip opening on landing `opensAt`, with the animation filling it. */
  function timed(opensAt: number) {
    const base = project(
      [
        video("v1", {
          start: 0,
          sourceIn: at(opensAt),
          sourceOut: 40,
          pinnedStart: true,
        }),
      ],
      [
        [
          overlay("anim", "animation", {
            start: 0,
            duration: 10,
            box: { ...POST_BOX.bottom },
            anchor: { itemId: "v1", offset: 0 },
            fill: true,
          } as Partial<PostAnimationItem>),
          overlay("caption", "animation", {
            start: 3,
            duration: 2,
            anchor: { itemId: "v1", offset: 3 },
          } as Partial<PostAnimationItem>),
        ],
      ],
      [take("a", 60)]
    );
    return { ...base, timings: { a: timing } };
  }
  const clip = (p: ReturnType<typeof timed>) =>
    p.tracks[0]!.items.find((item) => item.id === "v1") as PostVideoItem;
  /** Media time showing at post `seconds`. */
  const mediaAt = (item: PostVideoItem, seconds: number) =>
    item.sourceIn + (seconds - item.start) * item.speed;

  it("reads the pass starts on either side of a moment", () => {
    const around = takePassStartsAround(resolved, at(9.6));
    expect(around.earlier).toBeCloseTo(at(8), 6);
    expect(around.later).toBeCloseTo(at(16), 6);
    const on = takePassStartsAround(resolved, at(16));
    expect(on.earlier).toBeCloseTo(at(16), 6);
    expect(on.later).toBeCloseTo(at(16), 6);
  });

  it("reads back the move lengths a timing was checked against", () => {
    expect(takeTimingMoveBeats(timing)).toEqual(EIGHT);
    expect(takeTimingMoveBeats({ ...timing, movesKey: undefined })).toBeNull();
    expect(
      takeTimingMoveBeats({ ...timing, movesKey: "beats:1,x" })
    ).toBeNull();
  });

  it("ends the intro on the opening pose, with the footage playing behind it", () => {
    const before = timed(9.6);
    const added = addTunnelHook(before, ctx, { seconds: 5 })!;
    const hook = findTunnelHook(added.project)!;
    const footage = clip(added.project);

    expect(PostProjectSchema.safeParse(added.project).success).toBe(true);
    expect(hook.tunnelHook!.backdrop).toBe(true);
    // The nearer pass start is landing 8, 1.6 moves before the old cut.
    expect(hook.tunnelHook!.seconds).toBeCloseTo(5 - 1.6 * SPB, 6);
    expect(hook.start).toBe(0);
    expect(footage.start).toBe(0);
    const cue = hook.start + hook.tunnelHook!.seconds!;
    expect(takePositionAt(resolved, mediaAt(footage, cue))).toBeCloseTo(8, 4);
    // Every frame after the old cut stays where it was in the post.
    for (const seconds of [5, 9, 20, 30]) {
      expect(mediaAt(footage, seconds)).toBeCloseTo(
        mediaAt(clip(before), seconds - 5),
        6
      );
    }
    expect(itemEnd(footage)).toBeCloseTo(5 + itemEnd(clip(before)), 6);
    // Placed against the footage, the caption keeps its moment.
    const caption = added.project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.id === "caption")!;
    expect(caption.start).toBeCloseTo(8, 6);
  });

  it("stretches to the coming pass start when the clip opens late in the last move", () => {
    const added = addTunnelHook(timed(15.85), ctx, { seconds: 5 })!;
    const hook = findTunnelHook(added.project)!;
    const footage = clip(added.project);
    expect(hook.tunnelHook!.seconds).toBeCloseTo(5 + 0.15 * SPB, 6);
    const cue = hook.start + hook.tunnelHook!.seconds!;
    expect(takePositionAt(resolved, mediaAt(footage, cue))).toBeCloseTo(16, 4);
  });

  it("leaves an untimed take alone", () => {
    const untimed = { ...timed(9.6), timings: {} };
    const added = addTunnelHook(untimed, ctx, { seconds: 5 })!;
    expect(findTunnelHook(added.project)!.tunnelHook!.backdrop).toBeUndefined();
    expect(clip(added.project).start).toBe(5);
    expect(lineUpTunnelHook(added.project, ctx)).toBe(added.project);
  });

  it("lands the tunnel and the footage together on the opening pose", () => {
    const added = addTunnelHook(timed(15.85), ctx, { seconds: 5 })!;
    const hook = findTunnelHook(added.project)!;
    const cue = hook.tunnelHook!.seconds!;
    const compiled = compilePostProject(added.project, { now: NOW })!;
    const roles = compiled.preset.clips.flatMap((item) =>
      item.kind === "visual" && item.timeMapRole ? [item.timeMapRole] : []
    );
    const steps8 = EIGHT.map(() => ({ duration: 1 })) as unknown as StepData[];
    const alignment = {
      steps: steps8,
      startPlacementDuration: 1,
      clocks: Object.fromEntries(
        roles.map((role) => [
          role,
          { sampleAt: (media: number) => takeSampleAt(resolved, media) },
        ])
      ),
    };
    const frame = (time: number) =>
      evaluatePresetFrame(
        compiled.preset,
        compiled.durationSeconds,
        time,
        alignment as never
      );
    const position = (time: number) =>
      frame(time).find((layer) => layer.sourceRole === "sequence-animation")!
        .sequencePosition!;
    const footage = (time: number) =>
      frame(time).find((layer) => layer.clipId.startsWith("v1"))!;

    // Position 9 is the last move's landing after the start placement: the
    // opening pose, which the footage reaches at the same instant.
    expect(position(cue)).toBeCloseTo(9, 3);
    expect(position(cue - 1e-3)).toBeCloseTo(9, 2);
    // The pass opens on the same pose, read as the start of the sequence.
    let previous = position(0.05);
    for (let time = 0.1; time < cue; time += 0.1) {
      const next = position(time);
      expect(next).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = next;
    }
    // Then step 1 starts from rest, as it does in the footage.
    const after = position(cue + 0.2);
    expect(after).toBeGreaterThan(1);
    expect(after).toBeLessThan(1 + 0.2 / SPB + 1e-3);
    // Dim behind the full-frame tunnel, whole once the canvas has settled.
    expect(footage(0.5).opacity).toBeCloseTo(TUNNEL_HOOK_BACKDROP_OPACITY, 6);
    expect(footage(cue * 0.95).opacity).toBeCloseTo(1, 6);
    expect(footage(cue + 0.5).opacity).toBe(1);
    // The panel stays clear while the canvas moves over the footage and fills
    // in only once the canvas has settled, before the cue.
    const panel = (time: number) =>
      tunnelHookPanelOpacity(
        frame(time).find((layer) => layer.tunnelHook)!.tunnelHook,
        sampleEasing
      );
    expect(panel(0.5)).toBe(0);
    expect(panel(cue * 0.89)).toBe(0);
    expect(panel(cue * 0.95)).toBeGreaterThan(0);
    expect(panel(cue * 0.95)).toBeLessThan(1);
    expect(panel(cue - 1e-3)).toBeGreaterThan(0.99);
  });

  it("takes the footage back out from under the intro when the hook goes", () => {
    const added = addTunnelHook(timed(9.6), ctx, { seconds: 5 })!;
    const removed = removeTunnelHook(added.project, ctx);
    expect(PostProjectSchema.safeParse(removed).success).toBe(true);
    expect(findTunnelHook(removed)).toBeNull();
    const footage = clip(removed);
    expect(footage.start).toBe(0);
    // It now opens on the opening pose the intro ended on.
    expect(takePositionAt(resolved, footage.sourceIn)).toBeCloseTo(8, 4);
    const anim = removed.tracks[1]!.items.find((item) => item.id === "anim")!;
    expect(anim.start).toBe(0);
    expect(itemEnd(anim)).toBeCloseTo(itemEnd(footage), 6);
  });
});

describe("tunnel hook on its footage's beats", () => {
  const EIGHT = [1, 1, 1, 1, 1, 1, 1, 1];
  const SPB = 60 / 87;
  /** Media time of landing `position`: beat one is at 10 s, after a lead-in. */
  const at = (position: number) => 10 + SPB * position;
  const timing: TakeTiming = (() => {
    const base = createTakeTiming({
      sequenceId: "seq",
      takeKey: "key-a",
      durationSeconds: 60,
      now: 1,
    });
    return {
      ...base,
      movesKey: takeTimingMovesKey(EIGHT),
      sections: [
        {
          ...base.sections[0]!,
          tempo: "locked",
          taps: Array.from({ length: 30 }, (_, index) => at(index + 1)),
        },
      ],
    };
  })();
  const resolved = resolveTakeTiming(timing, EIGHT);
  const steps8 = EIGHT.map(() => ({ duration: 1 })) as unknown as StepData[];

  /** The footage opening on landing `opensAt`, with a lined-up tunnel over it. */
  function linedUp(opensAt: number, fields: Partial<PostVideoItem> = {}) {
    const base = project(
      [
        video("v1", {
          start: 0,
          sourceIn: at(opensAt),
          sourceOut: 40,
          pinnedStart: true,
          box: { ...POST_BOX.top },
          ...fields,
        }),
      ],
      [
        [
          overlay("anim", "animation", {
            start: 0,
            duration: 10,
            box: { ...POST_BOX.bottom },
            anchor: { itemId: "v1", offset: 0 },
            fill: true,
          } as Partial<PostAnimationItem>),
        ],
      ],
      [take("a", 60)]
    );
    return addTunnelHook({ ...base, timings: { a: timing } }, ctx, {
      seconds: 5,
    })!.project;
  }

  function play(p: ReturnType<typeof linedUp>) {
    const compiled = compilePostProject(p, { now: NOW })!;
    const clock = {
      sampleAt: (media: number, options?: { leadIn?: boolean }) =>
        takeSampleAt(resolved, media, options),
    };
    const frame = (time: number) =>
      evaluatePresetFrame(compiled.preset, compiled.durationSeconds, time, {
        steps: steps8,
        startPlacementDuration: 1,
        clocks: { [takeRole("a")]: clock },
      });
    return {
      compiled,
      cue: findTunnelHook(p)!.tunnelHook!.seconds!,
      footage: p.tracks[0]!.items.find((i) => i.id === "v1") as PostVideoItem,
      position: (time: number) =>
        frame(time).find((layer) => layer.sourceRole === "sequence-animation")!
          .sequencePosition!,
      layer: (time: number, id: string) =>
        frame(time).find((layer) => layer.clipId === id)!,
    };
  }

  it("counts back from beat one at the opening tempo when asked", () => {
    expect(takeSampleAt(resolved, at(-2))!.arrival).toBe(0);
    expect(
      takeSampleAt(resolved, at(-2), { leadIn: true })!.arrival
    ).toBeCloseTo(-2, 6);
    expect(
      takeSampleAt(resolved, at(3), { leadIn: true })!.arrival
    ).toBeCloseTo(3, 6);
  });

  it("moves the tunnel with the performer in the footage behind it", () => {
    const { cue, footage, position } = play(linedUp(9.6));
    // Engine positions run one ahead of arrivals inside the first pass.
    for (const time of [0.5, 1.5, cue / 2, cue - 0.3]) {
      const media = footage.sourceIn + (time - footage.start) * footage.speed;
      expect(position(time)).toBeCloseTo(
        takePositionAt(resolved, media)! + 1,
        4
      );
    }
    expect(position(cue)).toBeCloseTo(9, 3);
  });

  it("keeps the beat before beat one, landing on the opening pose with it", () => {
    const { cue, position } = play(linedUp(0));
    expect(cue).toBeCloseTo(5, 6);
    // The intro is all lead-in, read a pass later so it never sits below zero.
    for (const time of [0.5, 2, 4]) {
      expect(position(time)).toBeCloseTo(9 - (cue - time) / SPB, 4);
    }
    expect(position(cue - 1e-3)).toBeCloseTo(9, 2);
    // On the cue the animation reads the same pose as the sequence's start.
    expect(position(cue)).toBeCloseTo(1, 6);
    const after = position(cue + 0.2);
    expect(after).toBeGreaterThan(1);
    expect(after).toBeLessThan(1 + 0.2 / SPB + 1e-3);
  });

  it("fills the frame with the footage, then moves it into its box with the canvas", () => {
    const { compiled, cue, layer } = play(linedUp(9.6));
    const keys = (id: string) =>
      compiled.preset.regionKeyframes!.find((track) => track.regionId === id)!
        .keyframes;
    const footageKeys = keys("v1");
    expect(footageKeys[0]!.value).toMatchObject(POST_BOX.full);
    expect(footageKeys[footageKeys.length - 1]!.value).toMatchObject(
      POST_BOX.top
    );
    expect(footageKeys.map((key) => [key.atSeconds, key.easing])).toEqual(
      keys("anim").map((key) => [key.atSeconds, key.easing])
    );
    expect(layer(0.2, "v1").regionRect).toMatchObject(POST_BOX.full);
    expect(layer(cue, "v1").regionRect).toMatchObject(POST_BOX.top);
  });

  it("uncrops a cropped picture to the full frame and back onto its crop", () => {
    const band = {
      x: 0,
      y: 0,
      width: 1,
      height: 0.5,
      rotation: 0,
      crop: { left: 0, top: 0.2, right: 1, bottom: 0.7 },
    };
    const { compiled, cue, layer } = play(
      linedUp(9.6, { box: { ...POST_BOX.full }, sourceGeometry: band })
    );
    const clip = compiled.preset.clips.find((item) => item.id === "v1")!;
    const geometry =
      clip.kind === "visual" ? clip.sourceGeometryKeyframes! : [];
    // The 9:16 picture fills the 9:16 frame whole.
    const full = geometry[0]!.value;
    expect([full.x, full.y, full.width, full.height, full.rotation]).toEqual([
      0, 0, 1, 1, 0,
    ]);
    expect(full.crop.left).toBeCloseTo(0, 9);
    expect(full.crop.top).toBeCloseTo(0, 9);
    expect(full.crop.right).toBeCloseTo(1, 9);
    expect(full.crop.bottom).toBeCloseTo(1, 9);
    expect(geometry[geometry.length - 1]!.value).toEqual(band);
    expect(layer(0.2, "v1").sourceGeometry!.height).toBeCloseTo(1, 6);
    expect(layer(cue, "v1").sourceGeometry).toEqual(band);
  });

  it("leaves footage alone under a tunnel with nothing behind it", () => {
    const p = addTunnelHook(withAnimation(), ctx, { seconds: 5 })!.project;
    const compiled = compilePostProject(p, { now: NOW })!;
    expect(
      compiled.preset.regionKeyframes?.some((track) => track.regionId === "v1")
    ).toBeFalsy();
  });
});
