import { describe, expect, it } from "vitest";
import {
  ACTIVITY_INTENTION_IDS,
  GHOST_ACTIVITIES,
  advanceActivity,
  currentActivityStep,
  imagineActivityFutures,
  scoreActivities,
  startNextActivity,
} from "$lib/shared/attract/domain/activities";
import {
  activitySituation,
  beginActivityExperience,
  finishActivityExperience,
} from "$lib/shared/attract/domain/activity-experience";
import { predictActivityOutcome } from "$lib/shared/attract/domain/activity-prediction";
import {
  EMPTY_WORLD,
  type GhostContext,
} from "$lib/shared/attract/domain/intention";
import { createMemory } from "$lib/shared/attract/domain/scoring";
import { ALL_INTENTIONS } from "$lib/shared/attract/intentions";
import { createRng } from "$lib/shared/attract/services/rng";
import { createTrail } from "$lib/shared/attract/services/trail";

function context(seed = 7): GhostContext {
  const rng = createRng(seed);
  const memory = createMemory(
    rng,
    createTrail(() => 0)
  );
  return {
    ...EMPTY_WORLD,
    ...memory,
    moduleId: "create",
    tabId: "construct",
    reachableModules: ["create", "library", "play"],
    available: {
      ...EMPTY_WORLD.available,
      "start-placement": 8,
      "nav-module": 3,
    },
  };
}

describe("ghost activity planning", () => {
  it("commits to a coherent plan instead of redrawing after every action", () => {
    const ctx = context();
    const activity = startNextActivity(GHOST_ACTIVITIES, ctx, 0);

    expect(activity?.id).toBe("compose");
    expect(currentActivityStep(ctx.activities)?.intentionId).toBe(
      "overwhelmed"
    );

    advanceActivity(ctx.activities, 1_000);
    expect(ctx.activities.current).toBe(activity);
    expect(currentActivityStep(ctx.activities)?.intentionId).toBe("pick-start");

    advanceActivity(ctx.activities, 2_000);
    expect(currentActivityStep(ctx.activities)?.intentionId).toBe("add-step");
  });

  it("keeps activity eligibility pure so scoring does not move the RNG", () => {
    const scored = context(19);
    const untouched = context(19);
    for (const id of ["a", "b", "c", "d"]) scored.performed.set(id, 1);
    for (const id of ["a", "b", "c", "d"]) untouched.performed.set(id, 1);

    scoreActivities(GHOST_ACTIVITIES, scored, 120_000);

    expect(scored.rng.next()).toBe(untouched.rng.next());
  });

  it("forms an explicit forecast for every candidate before choosing", () => {
    const ctx = context();
    const candidates = scoreActivities(GHOST_ACTIVITIES, ctx, 0);

    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every(
        ({ definition, prediction }) =>
          prediction.activityId === definition.id &&
          prediction.source === "prior" &&
          prediction.uncertainty === 1
      )
    ).toBe(true);

    const selected = startNextActivity(GHOST_ACTIVITIES, ctx, 0);
    expect(ctx.experience.active?.activityId).toBe(selected?.id);
    expect(ctx.experience.active?.prediction.activityId).toBe(selected?.id);
    expect(ctx.experience.lastPrediction?.prediction.activityId).toBe(
      selected?.id
    );
  });

  it("counts a real comparison between imagined futures on selection", () => {
    const ctx = context();
    const activity = startNextActivity(GHOST_ACTIVITIES, ctx, 0);

    // compose declares two variants, so choosing it must have compared them.
    expect(activity?.id).toBe("compose");
    expect(["detoured", "direct"]).toContain(activity?.variantId);
    expect(ctx.experience.counterfactualSelections).toBe(1);
    expect(ctx.experience.active?.variantId).toBe(activity?.variantId);
  });

  it("learns to prefer the variant whose episodes paid off", () => {
    const ctx = context();
    const browse = GHOST_ACTIVITIES.find(({ id }) => id === "browse")!;

    // Same situation, opposite outcomes: browse-only visits keep discovering
    // controls, open-one visits reproduce the same empty result.
    for (let index = 0; index < 4; index++) {
      for (const [variantId, discovers] of [
        ["browse-only", true],
        ["open-one", false],
      ] as const) {
        const active = {
          id: browse.id,
          variantId,
          steps: [{ intentionId: "test" }],
          stepIndex: 0,
          startedAt: index * 2_000,
        };
        const prediction = predictActivityOutcome(
          ctx.experience,
          browse.id,
          browse.goal,
          activitySituation(ctx),
          variantId
        );
        beginActivityExperience(
          ctx.experience,
          active,
          browse.goal,
          prediction,
          ctx,
          index * 2_000
        );
        if (discovers) ctx.askedAbout.add(`control-${index}`);
        finishActivityExperience(
          ctx.experience,
          active,
          "completed",
          ctx,
          index * 2_000 + 1_000
        );
      }
    }

    const futures = imagineActivityFutures(browse, ctx);
    const weightOf = (id: string) =>
      futures.find(({ variant }) => variant.id === id)!.weight;

    expect(futures).toHaveLength(2);
    expect(weightOf("browse-only")).toBeGreaterThan(weightOf("open-one"));
    // Judgment shifts the odds; the clamp keeps either future choosable.
    expect(weightOf("open-one")).toBeGreaterThanOrEqual(0.75);
  });

  it("only leaves explicit interrupts and invitations unplanned", () => {
    const known = new Set(ALL_INTENTIONS.map((intention) => intention.id));
    expect([...ACTIVITY_INTENTION_IDS].filter((id) => !known.has(id))).toEqual(
      []
    );
    expect(
      ALL_INTENTIONS.filter(
        (intention) =>
          !intention.interrupt && !ACTIVITY_INTENTION_IDS.has(intention.id)
      ).map((intention) => intention.id)
    ).toEqual(["offer-the-wheel", "point-it-out", "everything-is-live"]);
  });
});
