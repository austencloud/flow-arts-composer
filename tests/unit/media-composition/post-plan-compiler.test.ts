import { describe, expect, it } from "vitest";
import {
  POST_ACT,
  PostPlanSchema,
  addCaption,
  addTakeToPlan,
  createDefaultPostPlan,
  removeTakeFromPlan,
  updateAct,
  type PostPlan,
  type PostTake,
} from "$lib/shared/media-composition/domain/post-plan";
import {
  ANIMATION_OVERLAY_ROLE,
  CAPTIONS_ROLE,
  actAtTime,
  compilePostPlan,
  postTimeForTakeTime,
  stripRole,
  takeRole,
} from "$lib/shared/media-composition/domain/post-plan-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import { BREAKDOWN_GEOMETRY } from "$lib/shared/media-composition/domain/post-studio-presets";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const fast: PostTake = {
  id: "a",
  label: "Full speed take",
  ref: { kind: "local", name: "fast.mp4", size: 10, lastModified: 1 },
  takeKey: "local:fast.mp4:10:1",
  durationSeconds: 20,
};
const slow: PostTake = {
  id: "b",
  label: "Slow take",
  ref: { kind: "local", name: "slow.mp4", size: 20, lastModified: 2 },
  takeKey: "local:slow.mp4:20:2",
  durationSeconds: 30,
};

const steps = Array.from({ length: 8 }, () => ({
  duration: 1,
})) as unknown as StepData[];

function planWith(...takes: PostTake[]): PostPlan {
  return takes.reduce(
    (plan, take) => addTakeToPlan(plan, take, 2),
    createDefaultPostPlan({ sequenceId: "dck", now: 1 })
  );
}

function compile(plan: PostPlan) {
  const compiled = compilePostPlan(plan, { now: 5 });
  if (!compiled) throw new Error("expected a post");
  return compiled;
}

describe("post plan", () => {
  it("drives both performance acts from the first take, slowed for the breakdown", () => {
    const plan = planWith(fast);
    const [full, breakdown] = plan.acts;
    expect(full).toMatchObject({ takeId: "a", speed: 1, layout: "split" });
    expect(breakdown).toMatchObject({
      takeId: "a",
      speed: 0.5,
      layout: "full",
    });
  });

  it("gives a second take the breakdown at its own speed", () => {
    // The slow take was performed slowly; slowing it again would halve it twice.
    const plan = planWith(fast, slow);
    expect(plan.acts[0]).toMatchObject({ takeId: "a" });
    expect(plan.acts[1]).toMatchObject({ takeId: "b", speed: 1 });
  });

  it("refreshes a take picked again instead of adding it twice", () => {
    const plan = addTakeToPlan(planWith(fast), { ...fast, id: "z" }, 3);
    expect(plan.takes.map((take) => take.id)).toEqual(["a"]);
  });

  it("moves acts onto the remaining take when one is removed", () => {
    const plan = removeTakeFromPlan(planWith(fast, slow), "b", 3);
    expect(plan.acts[1]).toMatchObject({ takeId: "a", sourceIn: 0 });
    expect(PostPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("refuses a caption for an act the post does not have", () => {
    const plan = planWith(fast);
    const next = addCaption(
      plan,
      {
        id: "c1",
        actId: "missing",
        text: "Practice with me!",
        startSeconds: 0,
        endSeconds: 2,
        position: "top",
        size: "l",
      },
      3
    );
    expect(next).toBe(plan);
  });

  it("refuses an edit that would end an act before it starts", () => {
    const plan = planWith(fast);
    const next = updateAct(
      plan,
      POST_ACT.fullSpeed,
      (act) =>
        act.kind === "performance"
          ? { ...act, sourceIn: 10, sourceOut: 4 }
          : act,
      3
    );
    expect(next).toBe(plan);
  });
});

describe("compilePostPlan", () => {
  it("lays the acts end to end, a slowed act as long as its span over its speed", () => {
    const post = compile(planWith(fast));
    expect(
      post.acts.map((act) => [act.actId, act.startSeconds, act.endSeconds])
    ).toEqual([
      [POST_ACT.fullSpeed, 0, 20],
      [POST_ACT.breakdown, 20, 60],
      [POST_ACT.card, 60, 65],
    ]);
    expect(post.durationSeconds).toBe(65);
    expect(post.preset.duration).toEqual({ mode: "fixed", seconds: 65 });
  });

  it("ties every layer over an act to that act's take and footage", () => {
    const post = compile(planWith(fast, slow));
    const breakdownClips = post.preset.clips.filter((clip) =>
      clip.id.startsWith(`${POST_ACT.breakdown}:`)
    );
    expect(breakdownClips.map((clip) => clip.sourceRole).sort()).toEqual(
      ["sequence-carousel", stripRole("alternate"), takeRole("b")].sort()
    );
    for (const clip of breakdownClips) {
      expect(clip).toMatchObject({
        start: { unit: "seconds", value: 20 },
        end: { unit: "seconds", value: 50 },
        sourceIn: { unit: "seconds", value: 0 },
        sourceOut: { unit: "seconds", value: 30 },
        playbackRate: 1,
      });
      expect(clip.kind === "visual" && clip.timeMapRole).toBe(takeRole("b"));
    }
  });

  it("shows one move on the take, the square and the carousel of a slowed act", () => {
    const post = compile(planWith(fast));
    // Take a's clock: media second s is arrival s.
    const layers = evaluatePresetFrame(post.preset, post.durationSeconds, 30, {
      steps,
      startPlacementDuration: 1,
      clocks: {
        [takeRole("a")]: {
          sampleAt: (media) => ({ arrival: media, endArrival: null }),
        },
      },
    });
    const breakdown = layers.filter((layer) =>
      layer.clipId.startsWith(`${POST_ACT.breakdown}:`)
    );
    expect(breakdown).toHaveLength(3);
    for (const layer of breakdown) {
      // Ten post seconds into a half-speed act is five seconds of footage.
      expect(layer.sourceTimeSeconds).toBeCloseTo(5, 9);
      expect(layer.sequenceFrame!.arrival).toBeCloseTo(5, 9);
    }
  });

  it("draws nothing from the sequence over the card", () => {
    const post = compile(planWith(fast));
    const layers = evaluatePresetFrame(post.preset, post.durationSeconds, 62, {
      steps,
      startPlacementDuration: 1,
      clocks: {
        [takeRole("a")]: {
          sampleAt: (media) => ({ arrival: media, endArrival: null }),
        },
      },
    });
    expect(layers.map((layer) => layer.clipId)).toEqual([
      `${POST_ACT.card}:card`,
    ]);
    expect(layers[0]!.sequenceFrame).toBeUndefined();
  });

  it("skips an act that is off or has no take", () => {
    const empty = createDefaultPostPlan({ sequenceId: "dck", now: 1 });
    const cardOnly = compile(empty);
    expect(cardOnly.acts.map((act) => act.actId)).toEqual([POST_ACT.card]);

    const noCard = updateAct(
      planWith(fast),
      POST_ACT.card,
      (act) => ({ ...act, enabled: false }),
      3
    );
    expect(compile(noCard).durationSeconds).toBe(60);

    const nothing = updateAct(
      empty,
      POST_ACT.card,
      (act) => ({ ...act, enabled: false }),
      3
    );
    expect(compilePostPlan(nothing, { now: 5 })).toBeNull();
  });

  it("clamps an act's span to its footage", () => {
    const plan = updateAct(
      planWith(fast),
      POST_ACT.fullSpeed,
      (act) =>
        act.kind === "performance"
          ? { ...act, sourceIn: 4, sourceOut: 50 }
          : act,
      3
    );
    const [full] = compile(plan).acts;
    expect(full).toMatchObject({ sourceIn: 4, sourceOut: 20, endSeconds: 16 });
  });

  it("carries captions with their act when an earlier act is trimmed", () => {
    const withCaption = addCaption(
      planWith(fast, slow),
      {
        id: "c1",
        actId: POST_ACT.breakdown,
        text: "  Watch hands closely  ",
        startSeconds: 2,
        endSeconds: 5,
        position: "top",
        size: "l",
      },
      3
    );
    expect(compile(withCaption).captions).toEqual([
      {
        id: "c1",
        text: "Watch hands closely",
        startSeconds: 22,
        endSeconds: 25,
        position: "top",
        size: "l",
      },
    ]);
    const trimmed = updateAct(
      withCaption,
      POST_ACT.fullSpeed,
      (act) => (act.kind === "performance" ? { ...act, sourceOut: 12 } : act),
      4
    );
    const post = compile(trimmed);
    expect(post.captions[0]).toMatchObject({
      startSeconds: 14,
      endSeconds: 17,
    });
    const overlay = post.preset.clips.find(
      (clip) => clip.sourceRole === CAPTIONS_ROLE
    );
    expect(overlay).toMatchObject({
      start: { value: 0 },
      end: { value: post.durationSeconds },
    });
  });

  it("stops a caption at its act's end", () => {
    const plan = addCaption(
      planWith(fast),
      {
        id: "c1",
        actId: POST_ACT.card,
        text: "Now repeat 100x",
        startSeconds: 3,
        endSeconds: 20,
        position: "bottom",
        size: "m",
      },
      3
    );
    expect(compile(plan).captions[0]).toMatchObject({
      startSeconds: 63,
      endSeconds: 65,
    });
  });

  it("lifts the take above the strip when asked, and leaves it full frame otherwise", () => {
    const takeRect = (plan: PostPlan) =>
      compile(plan).preset.regions.find(
        (region) => region.id === `${POST_ACT.breakdown}:take`
      )!;
    const plan = planWith(fast);
    expect(takeRect(plan)).toMatchObject({ y: 0, height: 1 });
    const lifted = updateAct(
      plan,
      POST_ACT.breakdown,
      (act) =>
        act.kind === "performance"
          ? { ...act, framing: { ...act.framing, area: "above-strip" } }
          : act,
      3
    );
    expect(takeRect(lifted).height).toBeCloseTo(BREAKDOWN_GEOMETRY.stripTop, 9);
  });

  it("puts the beat overlay over the split's animation only when asked", () => {
    const roles = (post: ReturnType<typeof compile>) =>
      post.preset.clips
        .filter((clip) => clip.regionId === `${POST_ACT.fullSpeed}:animation`)
        .map((clip) => clip.sourceRole);
    expect(roles(compile(planWith(fast)))).toEqual(["sequence-animation"]);
    const withOverlay = compilePostPlan(planWith(fast), {
      now: 5,
      animationOverlay: true,
    })!;
    // Drawn after the animation in the same region, so it lands on top.
    expect(roles(withOverlay)).toEqual([
      "sequence-animation",
      ANIMATION_OVERLAY_ROLE,
    ]);
  });

  it("finds the act at a post time and the post time of a take moment", () => {
    const post = compile(planWith(fast));
    expect(actAtTime(post.acts, 10)?.actId).toBe(POST_ACT.fullSpeed);
    // A shared boundary belongs to the act that is starting.
    expect(actAtTime(post.acts, 20)?.actId).toBe(POST_ACT.breakdown);
    const breakdown = post.acts[1]!;
    expect(postTimeForTakeTime(breakdown, 5)).toBeCloseTo(30, 9);
    expect(postTimeForTakeTime(post.acts[2]!, 1)).toBeNull();
  });
});
