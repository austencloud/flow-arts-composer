import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVITY_EPISODES,
  activitySituation,
  beginActivityExperience,
  finishActivityExperience,
} from "#lib/shared/attract/domain/activity-experience.js";
import {
  activityPredictionMultiplier,
  predictActivityOutcome,
} from "#lib/shared/attract/domain/activity-prediction.js";
import {
  EMPTY_WORLD,
  type ActiveGhostActivity,
  type GhostActivityGoal,
  type GhostActivityId,
  type GhostContext,
} from "#lib/shared/attract/domain/intention.js";
import { createMemory } from "#lib/shared/attract/domain/scoring.js";
import { createRng } from "#lib/shared/attract/services/rng.js";
import { createTrail } from "#lib/shared/attract/services/trail.js";

function context(): GhostContext {
  const rng = createRng(7);
  return {
    ...EMPTY_WORLD,
    ...createMemory(
      rng,
      createTrail(() => 0)
    ),
    moduleId: "create",
    tabId: "construct",
    cameraGranted: true,
    available: {
      ...EMPTY_WORLD.available,
      option: 8,
      play: 1,
    },
  };
}

function activity(
  id: GhostActivityId,
  startedAt: number,
  variantId = "default"
): ActiveGhostActivity {
  return {
    id,
    variantId,
    steps: [{ intentionId: "test" }],
    stepIndex: 0,
    startedAt,
  };
}

function record(
  ctx: GhostContext,
  id: GhostActivityId,
  goal: GhostActivityGoal,
  startedAt: number,
  mutate: () => void = () => {},
  variantId = "default"
) {
  const active = activity(id, startedAt, variantId);
  const prediction = predictActivityOutcome(
    ctx.experience,
    id,
    goal,
    activitySituation(ctx),
    variantId
  );
  beginActivityExperience(
    ctx.experience,
    active,
    goal,
    prediction,
    ctx,
    startedAt
  );
  mutate();
  return finishActivityExperience(
    ctx.experience,
    active,
    "completed",
    ctx,
    startedAt + 1_000
  )!;
}

describe("ghost activity experience", () => {
  it("values measured achievement above a completed empty visit", () => {
    const ctx = context();
    const made = record(ctx, "compose", "make", 0, () => {
      ctx.sequenceLength = 8;
      ctx.sequenceWord = "ABDGPSWX";
      ctx.playback.presentationRevision += 1;
    });
    const emptyVisit = record(ctx, "visit", "discover", 2_000);

    expect(made.achievement).toBe(1);
    expect(made.value).toBe(1);
    expect(emptyVisit.achievement).toBe(0);
    // Completed (0.2) plus first-time novelty (0.2), zero achievement.
    expect(emptyVisit.value).toBeCloseTo(0.4);
  });

  it("predicts useful and disappointing consequences without banning either", () => {
    const ctx = context();
    for (let index = 0; index < 3; index++) {
      record(ctx, "compose", "make", index * 2_000, () => {
        ctx.playback.presentationRevision += 1;
        ctx.sequenceWord = `WORD-${index}`;
      });
      record(ctx, "visit", "discover", index * 2_000 + 1_000);
    }

    const useful = predictActivityOutcome(
      ctx.experience,
      "compose",
      "make",
      activitySituation(ctx)
    );
    const disappointing = predictActivityOutcome(
      ctx.experience,
      "visit",
      "discover",
      activitySituation(ctx)
    );

    expect(useful.source).toBe("activity");
    expect(useful.presentationChange).toBeGreaterThan(0.7);
    expect(useful.value).toBeGreaterThan(disappointing.value);
    expect(activityPredictionMultiplier(useful)).toBeGreaterThan(1);
    expect(activityPredictionMultiplier(disappointing)).toBeLessThan(1);
    expect(activityPredictionMultiplier(disappointing)).toBeGreaterThanOrEqual(
      0.75
    );
  });

  it("reports uncertainty instead of transferring confidence into an unrelated situation", () => {
    const ctx = context();
    record(ctx, "compose", "make", 0, () => {
      ctx.playback.presentationRevision += 1;
    });

    ctx.moduleId = "museum";
    ctx.tabId = null;
    ctx.sequenceLength = 12;
    ctx.activeEffectIds = ["fire"];
    ctx.budgets.galleryOpens = 8;
    ctx.cameraGranted = false;
    ctx.available = { ...EMPTY_WORLD.available, docent: 1 };

    const prediction = predictActivityOutcome(
      ctx.experience,
      "compose",
      "make",
      activitySituation(ctx)
    );

    expect(prediction.source).toBe("prior");
    expect(prediction.confidence).toBe(0);
    expect(prediction.uncertainty).toBe(1);
    expect(activityPredictionMultiplier(prediction)).toBeGreaterThan(1);
    expect(activityPredictionMultiplier(prediction)).toBeLessThanOrEqual(1.25);
  });

  it("transfers weaker same-goal evidence to an untried activity", () => {
    const ctx = context();
    for (let index = 0; index < 4; index++) {
      record(ctx, "compose", "make", index * 2_000, () => {
        ctx.playback.presentationRevision += 1;
        ctx.sequenceWord = `WORD-${index}`;
      });
    }

    const known = predictActivityOutcome(
      ctx.experience,
      "compose",
      "make",
      activitySituation(ctx)
    );
    const transferred = predictActivityOutcome(
      ctx.experience,
      "change-prop",
      "make",
      activitySituation(ctx)
    );

    expect(known.source).toBe("activity");
    expect(transferred.source).toBe("goal");
    expect(transferred.matches).toBeGreaterThan(0);
    expect(transferred.confidence).toBeLessThan(known.confidence);
  });

  it("lowers reliability after a confident forecast misses", () => {
    const ctx = context();
    for (let index = 0; index < 4; index++) {
      record(ctx, "compose", "make", index * 2_000, () => {
        ctx.playback.presentationRevision += 1;
        ctx.sequenceWord = `WORD-${index}`;
      });
    }
    const beforeMiss = predictActivityOutcome(
      ctx.experience,
      "compose",
      "make",
      activitySituation(ctx)
    );

    const missedEpisode = record(ctx, "compose", "make", 10_000);
    const afterMiss = predictActivityOutcome(
      ctx.experience,
      "compose",
      "make",
      activitySituation(ctx)
    );

    expect(beforeMiss.confidence).toBeGreaterThan(0.6);
    expect(missedEpisode.predictionError).toBeGreaterThan(0.35);
    expect(missedEpisode.surprises).toContain("achievement");
    expect(ctx.experience.confidentMisses).toBe(1);
    expect(afterMiss.reliability).toBeLessThan(beforeMiss.reliability);
  });

  it("buys real confidence from consistent, similar, recent evidence", () => {
    const ctx = context();
    for (let index = 0; index < 6; index++) {
      record(ctx, "compose", "make", index * 2_000, () => {
        ctx.playback.presentationRevision += 1;
        ctx.sequenceWord = `WORD-${index}`;
      });
    }

    const prediction = predictActivityOutcome(
      ctx.experience,
      "compose",
      "make",
      activitySituation(ctx)
    );

    // Six consistent matches in the same situation must be actionable
    // evidence, not the 0.25 confidence the squared-similarity curve gave.
    expect(prediction.matches).toBe(6);
    expect(prediction.confidence).toBeGreaterThan(0.6);
    expect(prediction.confidence).toBeLessThanOrEqual(1);
  });

  it("devalues reproducing an identical result", () => {
    const ctx = context();
    const values: number[] = [];
    for (let index = 0; index < 4; index++) {
      values.push(record(ctx, "visit", "discover", index * 2_000).value);
    }

    // Same signature every time: worth declines, and by the repeats the
    // episode is genuinely below the neutral expectation — negative evidence
    // the predictor can act on.
    expect(values[0]).toBeGreaterThan(values[3]!);
    expect(values[3]).toBeLessThan(0.5);
  });

  it("forecasts each variant from its own episodes before cross-variant ones", () => {
    const ctx = context();
    for (let index = 0; index < 3; index++) {
      record(
        ctx,
        "browse",
        "discover",
        index * 2_000,
        () => {
          ctx.askedAbout.add(`control-${index}`);
        },
        "browse-only"
      );
      record(ctx, "browse", "discover", index * 2_000 + 1_000, () => {}, "open-one");
    }

    const good = predictActivityOutcome(
      ctx.experience,
      "browse",
      "discover",
      activitySituation(ctx),
      "browse-only"
    );
    const poor = predictActivityOutcome(
      ctx.experience,
      "browse",
      "discover",
      activitySituation(ctx),
      "open-one"
    );

    expect(good.source).toBe("activity");
    expect(poor.source).toBe("activity");
    expect(good.value).toBeGreaterThan(poor.value);
    expect(activityPredictionMultiplier(good)).toBeGreaterThan(
      activityPredictionMultiplier(poor)
    );
  });

  it("keeps a bounded recent history while retaining the lifetime count", () => {
    const ctx = context();
    for (let index = 0; index < MAX_ACTIVITY_EPISODES + 5; index++) {
      record(ctx, "visit", "discover", index * 2_000);
    }

    expect(ctx.experience.episodes).toHaveLength(MAX_ACTIVITY_EPISODES);
    expect(ctx.experience.recorded).toBe(MAX_ACTIVITY_EPISODES + 5);
    expect(ctx.experience.predictionsRecorded).toBe(MAX_ACTIVITY_EPISODES + 5);
    expect(ctx.experience.episodes[0]?.startedAt).toBe(10_000);
  });
});
