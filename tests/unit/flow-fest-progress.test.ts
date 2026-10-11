import { describe, expect, it } from "vitest";
import {
  advanceFlowFestProgress,
  createFlowFestGate4ReviewProgress,
  createFlowFestProgress,
  expectedFlowFestMoment,
  getFlowFestObjective,
  isFlowFestCampEstablishedPhase,
  isFlowFestDrivingPhase,
  restoreFlowFestProgress,
  type FlowFestProgressState,
} from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
import { createFlowFestDefaultLoadout } from "#lib/features/flow-fest-sim/domain/flow-fest-loadout.js";
import {
  FLOW_FEST_GAMEPLAY_JUMP_FORCE,
  FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER,
  FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND,
} from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";

const FINGERPRINT = "contract-fingerprint";

/** Through the loadout and the drive with the default car at midday. */
function arriveAtGate(
  state: FlowFestProgressState,
  loadout = createFlowFestDefaultLoadout()
): FlowFestProgressState {
  state = advanceFlowFestProgress(state, { type: "depart", loadout });
  return advanceFlowFestProgress(state, { type: "arrive-at-gate" });
}

describe("Flow Fest Thursday progress", () => {
  // Measured off the shipped clips with the same contact-weighted foot-speed
  // method LocomotionAnimator.analyzeClipGait uses, so these are the speeds the
  // animation can actually carry rather than numbers that read well.
  const WALK_CLIP_NATIVE_SPEED = 1.517;
  const RUN_CLIP_NATIVE_SPEED = 3.099;

  it("keeps on-foot speeds inside what the walk and run clips can carry", () => {
    expect(FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND).toBe(1.7);
    expect(FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER).toBe(2.3);
    expect(FLOW_FEST_GAMEPLAY_JUMP_FORCE).toBe(5);

    // Grieve's square-root law splits a speed request between stride length and
    // cadence: the animator authors sqrt(speed / clipSpeed) as stride and caps
    // it at 1.15. Past that cap the surplus lands on playback rate alone and
    // the body skates over its own footfalls. Both tiers stay under the cap,
    // which is the whole reason the run is a second clip and not a faster walk.
    const walkStride = Math.sqrt(
      FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND / WALK_CLIP_NATIVE_SPEED
    );
    const sprintStride = Math.sqrt(
      (FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND *
        FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER) /
        RUN_CLIP_NATIVE_SPEED
    );
    expect(walkStride).toBeLessThan(1.15);
    expect(sprintStride).toBeLessThan(1.15);

    // And sprint has to clear the run tier's crossover, or holding Shift buys a
    // faster walk instead of a run. The band is walk native x 1.15 up to run
    // native x 0.8; above the top of it the pose is entirely run clips.
    const sprintSpeed =
      FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND *
      FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER;
    expect(sprintSpeed).toBeGreaterThan(RUN_CLIP_NATIVE_SPEED * 0.8);
    // The walk stays below the bottom of the band, so unmodified travel is a
    // walk with no run bleeding into it.
    expect(FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND).toBeLessThan(
      WALK_CLIP_NATIVE_SPEED * 1.15
    );
  });

  it("activates the player's tent collision only after camp is established", () => {
    expect(isFlowFestCampEstablishedPhase("make-camp")).toBe(false);
    expect(isFlowFestCampEstablishedPhase("walk-to-festival")).toBe(true);
    expect(isFlowFestCampEstablishedPhase("night-free-roam")).toBe(true);
    expect(isFlowFestCampEstablishedPhase("morning")).toBe(true);
  });

  it.each(["lower-tent", "upper-tent", "car-camp"] as const)(
    "completes the %s arrival without skipping guarded steps",
    (branch) => {
      let state = createFlowFestProgress(FINGERPRINT);
      expect(advanceFlowFestProgress(state, { type: "make-camp" })).toBe(state);
      expect(advanceFlowFestProgress(state, { type: "check-in" })).toBe(state);

      state = arriveAtGate(state);
      expect(state.phase).toBe("gate-check-in");
      state = advanceFlowFestProgress(state, { type: "check-in" });
      state = advanceFlowFestProgress(state, { type: "choose-camp", branch });
      state = advanceFlowFestProgress(state, { type: "arrive-at-camp" });
      state = advanceFlowFestProgress(state, { type: "settle-vehicle" });
      if (branch !== "car-camp") {
        expect(state.phase).toBe("walk-home");
        state = advanceFlowFestProgress(state, { type: "reach-camp" });
      }
      expect(state.phase).toBe("make-camp");
      state = advanceFlowFestProgress(state, { type: "make-camp" });
      state = advanceFlowFestProgress(state, { type: "reach-festival" });
      state = advanceFlowFestProgress(state, { type: "begin-night" });
      expect(state.phase).toBe("night-free-roam");
      expect(advanceFlowFestProgress(state, { type: "head-home" })).toBe(state);
      state = advanceFlowFestProgress(state, { type: "join-fire-jam" });
      state = advanceFlowFestProgress(state, { type: "complete-fire-jam" });
      state = advanceFlowFestProgress(state, { type: "head-home" });
      state = advanceFlowFestProgress(state, { type: "return-to-camp" });

      expect(state).toMatchObject({
        branch,
        phase: "morning",
        moment: "dawn",
        fireJamState: "completed",
        contractFingerprint: FINGERPRINT,
      });
      expect(state.completed).toContain("festival-night");
    }
  );

  it("keeps authored vehicle travel untimed", () => {
    let state = arriveAtGate(createFlowFestProgress(FINGERPRINT));
    state = advanceFlowFestProgress(state, { type: "check-in" });
    state = advanceFlowFestProgress(state, {
      type: "choose-camp",
      branch: "upper-tent",
    });
    const objective = getFlowFestObjective(state);

    expect(objective.title).toBe("Stage the unload leg");
    expect(objective.detail).toContain("exact upper-level unload endpoint");
    expect(JSON.stringify(objective)).not.toMatch(/second|minute|speed/i);
  });

  it("rejects stale or malformed session snapshots", () => {
    const state = createFlowFestProgress(FINGERPRINT);
    expect(restoreFlowFestProgress(state, FINGERPRINT)).toEqual(state);
    expect(restoreFlowFestProgress(state, "new-fingerprint")).toBeNull();
    expect(
      restoreFlowFestProgress(
        { ...state, phase: "teleport-driving" },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestProgress(
        { ...state, phase: "walk-home", branch: null },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestProgress(
        { ...state, phase: "morning", moment: "afternoon" },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestProgress(
        { ...state, phase: "camp-arrival", branch: null },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestProgress(
        { ...state, completed: ["made-up-phase"] },
        FINGERPRINT
      )
    ).toBeNull();
  });

  it("seeds the drive from the departure and drains energy only on the road", () => {
    const initial = createFlowFestProgress(FINGERPRINT);
    expect(initial.phase).toBe("loadout");
    expect(initial.loadout).toBeNull();
    expect(getFlowFestObjective(initial).title).toBe("Pack the car");
    expect(advanceFlowFestProgress(initial, { type: "drain-energy", percent: 5 })).toBe(
      initial
    );

    const loadout = { ...createFlowFestDefaultLoadout(), departure: "early" as const };
    let state = advanceFlowFestProgress(initial, { type: "depart", loadout });
    expect(state).toMatchObject({
      phase: "drive-in",
      moment: "afternoon",
      energyPercent: 70,
      completed: ["loadout"],
    });
    expect(state.loadout).toEqual(loadout);
    expect(state.loadout).not.toBe(loadout);
    expect(isFlowFestDrivingPhase(state.phase)).toBe(true);
    expect(getFlowFestObjective(state)).toMatchObject({
      title: "Drive to the front gate",
      targetZoneId: "lower-gate-zone",
      actionLabel: null,
      progressStep: 2,
      progressTotal: 13,
    });

    // 25 s of driving at 3 %/min.
    state = advanceFlowFestProgress(state, { type: "drain-energy", percent: 1.25 });
    expect(state.energyPercent).toBe(68.75);
    state = advanceFlowFestProgress(state, { type: "drain-energy", percent: 500 });
    expect(state.energyPercent).toBe(0);
    expect(advanceFlowFestProgress(state, { type: "depart", loadout })).toBe(state);
    expect(restoreFlowFestProgress(state, FINGERPRINT)).toEqual(state);

    state = advanceFlowFestProgress(state, { type: "arrive-at-gate" });
    expect(state).toMatchObject({
      phase: "gate-check-in",
      moment: "afternoon",
      completed: ["loadout", "drive-in"],
    });
    expect(isFlowFestDrivingPhase(state.phase)).toBe(false);
  });

  it("carries a late departure into golden hour until the camp is made", () => {
    const late = { ...createFlowFestDefaultLoadout(), departure: "late" as const };
    let state = advanceFlowFestProgress(createFlowFestProgress(FINGERPRINT), {
      type: "depart",
      loadout: late,
    });
    expect(state).toMatchObject({ moment: "golden-hour", energyPercent: 95 });
    state = advanceFlowFestProgress(state, { type: "arrive-at-gate" });
    state = advanceFlowFestProgress(state, { type: "check-in" });
    expect(state.moment).toBe("golden-hour");
    expect(restoreFlowFestProgress(state, FINGERPRINT)).toEqual(state);
    // The same snapshot claiming afternoon light is not one a late run produced.
    expect(
      restoreFlowFestProgress({ ...state, moment: "afternoon" }, FINGERPRINT)
    ).toBeNull();
    expect(expectedFlowFestMoment("vehicle-settle", late)).toBe("golden-hour");
    expect(expectedFlowFestMoment("vehicle-settle", createFlowFestDefaultLoadout())).toBe(
      "afternoon"
    );
    expect(expectedFlowFestMoment("night-return", late)).toBe("night");
  });

  it("rejects snapshots whose loadout disagrees with the phase", () => {
    const initial = createFlowFestProgress(FINGERPRINT);
    const loadout = createFlowFestDefaultLoadout();
    expect(restoreFlowFestProgress({ ...initial, loadout }, FINGERPRINT)).toBeNull();
    const gate = arriveAtGate(initial);
    expect(restoreFlowFestProgress(gate, FINGERPRINT)).toEqual(gate);
    expect(restoreFlowFestProgress({ ...gate, loadout: null }, FINGERPRINT)).toBeNull();
    expect(
      restoreFlowFestProgress(
        { ...gate, loadout: { ...loadout, carModelId: "hovercraft" } },
        FINGERPRINT
      )
    ).toBeNull();
    expect(
      restoreFlowFestProgress({ ...gate, energyPercent: 101 }, FINGERPRINT)
    ).toBeNull();
    expect(
      restoreFlowFestProgress({ ...gate, completed: ["loadout"] }, FINGERPRINT)
    ).toBeNull();
    // A version-2 session (no loadout, gate first) restarts at the loadout.
    expect(
      restoreFlowFestProgress(
        {
          version: 2,
          contractFingerprint: FINGERPRINT,
          masterSeed: initial.masterSeed,
          phase: "gate-check-in",
          moment: "afternoon",
          branch: null,
          fireJamState: "not-started",
          completed: [],
        },
        FINGERPRINT
      )
    ).toBeNull();
  });

  it("stages the gate-4 review at night with the default loadout on record", () => {
    const state = createFlowFestGate4ReviewProgress(FINGERPRINT);
    expect(state).toMatchObject({
      phase: "night-free-roam",
      moment: "night",
      branch: "lower-tent",
      energyPercent: 85,
    });
    expect(state.loadout).toEqual(createFlowFestDefaultLoadout());
    expect(state.completed.slice(0, 3)).toEqual(["loadout", "drive-in", "gate-check-in"]);
    expect(restoreFlowFestProgress(state, FINGERPRINT)).toEqual(state);
  });

  it("starts over without changing the contract identity", () => {
    const initial = createFlowFestProgress(FINGERPRINT);
    const morning = {
      ...initial,
      phase: "morning" as const,
      moment: "dawn" as const,
      branch: "car-camp" as const,
    };
    expect(advanceFlowFestProgress(morning, { type: "start-over" })).toEqual(
      initial
    );
  });
});
