/**
 * Pins the parts of a sweep that make it usable rather than merely correct:
 * the coarse-then-fine phase plan, the settle policy that keeps a mid-seek
 * transient out of the results, and the runner's progress, cancellation, and
 * resume behaviour.
 *
 * The settle tests matter most. A sampler that reads immediately after a seek
 * measured a 21 mm clip and 57 degrees of axis error that did not reproduce
 * once the rig had settled. A matrix built from those readings sends people to
 * inspect frames where nothing is wrong, so the retry-until-two-reads-agree
 * policy is the thing that has to keep working.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  rebuildPublicSequence,
  selectSweepSequences,
  type PublicSequenceDocument,
} from "#lib/shared/3d/diagnostics/sweep/sweep-sequence-corpus.js";
import {
  DEFAULT_SWEEP_PHASE_PLAN,
  estimateSweepCost,
  planCoarsePhases,
  planRefinementPhases,
} from "#lib/shared/3d/diagnostics/sweep/sweep-phase-plan.js";
import {
  DEFAULT_SETTLE_POLICY,
  readSettledPhase,
  secondsPerSettledSample,
  type SweepRig,
} from "#lib/shared/3d/diagnostics/sweep/sweep-settling.js";
import type { SweepReading } from "#lib/shared/3d/diagnostics/sweep/sweep-sample.js";
import {
  runSweep,
  type SweepRunState,
  type SweepSampler,
} from "#lib/shared/3d/diagnostics/sweep/sweep-runner.js";
import {
  enumerateSweepConfigurations,
  sweepSpaceDigest,
  type SweepSpace,
} from "#lib/shared/3d/diagnostics/sweep/sweep-space.js";

/**
 * An adult-sized rig with enough reach to hold the product's default 81 cm
 * prop. The margin is small on purpose: a 54 cm reach already overruns that
 * default, which is one of the failures this engine exists to surface, so a
 * fixture built to "pass" has to clear the bar rather than sit on it.
 */
const POSE = {
  requestedStanceYawRad: 0,
  achievedShoulderYawRad: 0,
  shoulderWidth: 0.38,
  leftUpperArmLength: 0.31,
  leftForearmLength: 0.29,
  rightUpperArmLength: 0.31,
  rightForearmLength: 0.29,
};

function reading(gripSeparationM: number, penetrationM = 0): SweepReading {
  return {
    collisionEvents: penetrationM
      ? [
          {
            zone: "prop-through-torso",
            severity: "clip",
            stepNumber: 2,
            beatProgress: 0.25,
            penetrationDepth: penetrationM,
            description: "clipped torso",
          },
        ]
      : [],
    pose: POSE,
    grip: {
      stepNumber: 2,
      beatProgress: 0.25,
      leftPalm: { x: 0, y: 1, z: 0 },
      rightPalm: { x: gripSeparationM, y: 1, z: 0 },
      leftGripAxis: { x: 1, y: 0, z: 0 },
      rightGripAxis: { x: 1, y: 0, z: 0 },
      renderedBlueGrip: { x: 0, y: 1, z: 0 },
      renderedRedGrip: { x: gripSeparationM, y: 1, z: 0 },
      blueStaffSegment: { a: { x: -0.4, y: 1, z: 0 }, b: { x: 0.4, y: 1, z: 0 } },
      redStaffSegment: { a: { x: -0.4, y: 1, z: 0 }, b: { x: 0.4, y: 1, z: 0 } },
    },
  };
}

const instantWait = async () => {};

describe("phase plan", () => {
  it("spaces coarse phases evenly and stops short of the wrap point", () => {
    expect(planCoarsePhases(2, 4)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    expect(planCoarsePhases(0, 4)).toEqual([]);
  });

  it("refines only around suspicious phases", () => {
    const refined = planRefinementPhases(
      [
        { phase: 0, score: 0.1 },
        { phase: 1, score: 0.9 },
        { phase: 2, score: 0.1 },
      ],
      3,
      { ...DEFAULT_SWEEP_PHASE_PLAN, fineSamplesPerStep: 8 }
    );
    expect(refined.length).toBeGreaterThan(0);
    expect(Math.min(...refined)).toBeGreaterThanOrEqual(0.75);
    expect(Math.max(...refined)).toBeLessThanOrEqual(1.25);
    expect(refined).not.toContain(1);
  });

  it("merges overlapping refinement windows instead of re-reading their overlap", () => {
    const refined = planRefinementPhases(
      [
        { phase: 1, score: 0.9 },
        { phase: 1.25, score: 0.9 },
      ],
      4,
      { ...DEFAULT_SWEEP_PHASE_PLAN, fineSamplesPerStep: 8 }
    );
    expect(new Set(refined).size).toBe(refined.length);
  });

  it("caps refinement so one bad configuration cannot stall a run", () => {
    const coarse = planCoarsePhases(16, 4).map((phase) => ({ phase, score: 5 }));
    const refined = planRefinementPhases(coarse, 16, DEFAULT_SWEEP_PHASE_PLAN);
    expect(refined.length).toBe(DEFAULT_SWEEP_PHASE_PLAN.maxRefinementSamples);
  });

  it("estimates the real cost of a run before it starts", () => {
    const estimate = estimateSweepCost(
      [8, 8, 8],
      12,
      14,
      secondsPerSettledSample(),
      DEFAULT_SWEEP_PHASE_PLAN
    );
    expect(estimate.configurations).toBe(504);
    expect(estimate.coarseSamples).toBe(16128);
    expect(estimate.coarseSeconds).toBeCloseTo(16128 * 1.8);
  });
});

describe("settling", () => {
  it("accepts a phase once two reads agree", async () => {
    const rig: SweepRig = {
      seek: vi.fn(),
      read: vi.fn().mockReturnValue(reading(0.2)),
    };
    const outcome = await readSettledPhase({
      rig,
      phase: 1.25,
      configuredPropLengthCm: 81,
      wait: instantWait,
    });
    expect(outcome.settled).toBe(true);
    expect(rig.seek).toHaveBeenCalledWith(1.25);
    if (outcome.settled) {
      expect(outcome.attempts).toBe(1);
      expect(outcome.sample.collisions.eventCount).toBe(0);
    }
  });

  it("does not accept a mid-seek transient, and accepts the settled pose behind it", async () => {
    // The rig is still moving for the first attempt's two reads — a clip that
    // is not really there — and has settled by the second attempt.
    const reads = [
      reading(0.2, 0.021),
      reading(0.26, 0.004),
      reading(0.2),
      reading(0.2),
    ];
    let index = 0;
    const rig: SweepRig = {
      seek: vi.fn(),
      read: () => reads[Math.min(index++, reads.length - 1)],
    };
    const outcome = await readSettledPhase({
      rig,
      phase: 1.25,
      configuredPropLengthCm: 81,
      wait: instantWait,
    });
    expect(outcome.settled).toBe(true);
    if (outcome.settled) {
      expect(outcome.attempts).toBe(2);
      // The phantom 21 mm clip is not in the accepted sample.
      expect(outcome.sample.collisions.deepestBodyPenetrationMm).toBe(0);
    }
  });

  it("reports a never-settling phase as unsettled rather than grading it", async () => {
    let separation = 0.2;
    const rig: SweepRig = {
      seek: vi.fn(),
      read: () => reading((separation += 0.05)),
    };
    const outcome = await readSettledPhase({
      rig,
      phase: 3,
      configuredPropLengthCm: 81,
      wait: instantWait,
    });
    expect(outcome.settled).toBe(false);
    if (!outcome.settled) {
      expect(outcome.reason).toBe("never-agreed");
      expect(outcome.attempts).toBe(DEFAULT_SETTLE_POLICY.maxRetries + 1);
    }
  });

  it("reports a rig that never produced a frame", async () => {
    const outcome = await readSettledPhase({
      rig: { seek: vi.fn(), read: () => null },
      phase: 0,
      configuredPropLengthCm: 81,
      wait: instantWait,
    });
    expect(outcome.settled).toBe(false);
    if (!outcome.settled) expect(outcome.reason).toBe("no-frame");
  });

  it("stops between reads when cancelled", async () => {
    const signal = { aborted: true };
    const outcome = await readSettledPhase({
      rig: { seek: vi.fn(), read: () => reading(0.2) },
      phase: 0,
      configuredPropLengthCm: 81,
      wait: instantWait,
      signal,
    });
    expect(outcome.settled).toBe(false);
    if (!outcome.settled) expect(outcome.reason).toBe("cancelled");
  });
});

function space(sequenceIds: string[]): SweepSpace {
  return {
    characters: [
      { id: "ch01" as never, label: "ch01" },
      { id: "ch07" as never, label: "ch07" },
    ],
    props: [{ id: "staff" as never, label: "Staff", lengthCm: 81 }],
    sequences: sequenceIds.map((id) => ({
      id,
      label: id,
      stepCount: 2,
      data: {} as never,
    })),
  };
}

function stubSampler(readingFor: (key: string) => SweepReading): SweepSampler {
  return {
    async mount(configuration) {
      const value = readingFor(configuration.key);
      return { seek: () => {}, read: () => value };
    },
  };
}

describe("runner", () => {
  it("walks every configuration and reports progress per cell", async () => {
    const progress: number[] = [];
    const report = await runSweep({
      space: space(["a", "b"]),
      sampler: stubSampler(() => reading(0.2)),
      wait: instantWait,
      onProgress: (update) => {
        if (update.lastResult) progress.push(update.completed);
      },
    });
    expect(report.total).toBe(4);
    expect(report.completed).toBe(4);
    expect(progress).toEqual([1, 2, 3, 4]);
    expect(report.results.every((result) => result.severity === "pass")).toBe(true);
  });

  it("blocks a configuration the sampler cannot mount", async () => {
    const report = await runSweep({
      space: space(["a"]),
      sampler: { async mount() { return null; } },
      wait: instantWait,
    });
    expect(report.results.every((result) => result.severity === "blocked")).toBe(true);
    expect(report.results[0].blockedReason).toBe(
      "configuration could not be mounted"
    );
  });

  it("finds the failing body when only one character breaks", async () => {
    const report = await runSweep({
      space: space(["a"]),
      sampler: stubSampler((key) =>
        key.startsWith("ch07") ? reading(0.2, 0.03) : reading(0.2)
      ),
      wait: instantWait,
    });
    const failing = report.results.filter((result) => result.severity === "fail");
    expect(failing).toHaveLength(1);
    expect(failing[0].configuration.character.id).toBe("ch07");
    expect(failing[0].worstMoment?.coordinate.characterId).toBe("ch07");
    expect(failing[0].deepestBodyPenetrationMm).toBeCloseTo(30);
  });

  it("stops when cancelled and reports what it finished", async () => {
    const signal = { aborted: false };
    const report = await runSweep({
      space: space(["a", "b"]),
      sampler: stubSampler(() => reading(0.2)),
      wait: instantWait,
      onProgress: (update) => {
        if (update.completed >= 2) signal.aborted = true;
      },
      signal,
    });
    expect(report.cancelled).toBe(true);
    expect(report.completed).toBe(2);
  });

  it("resumes from a stored run instead of re-sampling finished cells", async () => {
    const configurations = enumerateSweepConfigurations(space(["a"]));
    const digest = sweepSpaceDigest(space(["a"]));
    let mounts = 0;
    const first = await runSweep({
      space: space(["a"]),
      sampler: {
        async mount() {
          mounts += 1;
          return { seek: () => {}, read: () => reading(0.2) };
        },
      },
      wait: instantWait,
    });
    expect(mounts).toBe(configurations.length);

    const stored: SweepRunState = {
      spaceDigest: digest,
      startedAt: 0,
      results: Object.fromEntries(
        first.results.map((result) => [result.key, result])
      ),
    };
    let resumedMounts = 0;
    const resumed = await runSweep({
      space: space(["a"]),
      sampler: {
        async mount() {
          resumedMounts += 1;
          return { seek: () => {}, read: () => reading(0.2) };
        },
      },
      wait: instantWait,
      store: { load: () => stored, save: () => {} },
    });
    expect(resumedMounts).toBe(0);
    expect(resumed.completed).toBe(configurations.length);
  });

  it("ignores a stored run measured against different axes", async () => {
    let mounts = 0;
    await runSweep({
      space: space(["a"]),
      sampler: {
        async mount() {
          mounts += 1;
          return { seek: () => {}, read: () => reading(0.2) };
        },
      },
      wait: instantWait,
      store: {
        load: () => ({
          spaceDigest: "a different question",
          startedAt: 0,
          results: {},
        }),
        save: () => {},
      },
    });
    expect(mounts).toBe(2);
  });
});

/**
 * The sequence axis is only real if the corpus actually rebuilds. Reading the
 * committed snapshot rather than a fixture is deliberate: the first version of
 * this module read the stored tracks back under their pre-normalization names
 * and rebuilt nothing at all, and because an empty axis produces an empty
 * matrix rather than an error, the sweep looked like it had simply found
 * nothing to say. A hand-written fixture in the post-normalization shape would
 * have passed that bug.
 */
describe("real sequence corpus", () => {
  const snapshot = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../../static/data/snapshots/public-sequences.json"),
      "utf8"
    )
  ) as { documents: PublicSequenceDocument[] };

  it("rebuilds published sequences into playable steps", () => {
    const rebuilt = snapshot.documents
      .slice(0, 50)
      .map(rebuildPublicSequence)
      .filter((sequence) => sequence !== null);

    expect(rebuilt.length).toBeGreaterThan(40);
    for (const sequence of rebuilt) {
      expect(sequence.steps.length).toBeGreaterThan(0);
      expect(sequence.id).toBeTruthy();
    }
  });

  it("selects a spread of lengths rather than the first few documents", () => {
    const selected = selectSweepSequences(snapshot, {
      count: 4,
      minSteps: 4,
      maxSteps: 12,
    });

    expect(selected).toHaveLength(4);
    expect(new Set(selected.map((sequence) => sequence.stepCount)).size).toBeGreaterThan(1);
    for (const sequence of selected) {
      expect(sequence.stepCount).toBe(sequence.data.steps.length);
      expect(sequence.stepCount).toBeGreaterThanOrEqual(4);
      expect(sequence.stepCount).toBeLessThanOrEqual(12);
    }
  });
});
