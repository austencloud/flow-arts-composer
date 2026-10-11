import { describe, expect, it } from "vitest";
import { buildFirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";
import {
  FIRST_FIRE_COURT_LIGHT_REACH_METRES,
  FIRST_FIRE_NEUTRAL_BLACKOUT_MS,
  advanceFirstFireGrayboxProof,
  createFirstFireGrayboxReviewState,
  displayedFirstFireShrine,
  firstFireOrbitZoneThresholds,
  litFirstFireShrine,
  updateFirstFireGrayboxReview,
  visibleFirstFireFlameGroups,
} from "../../../src/lib/features/museum/data/first-fire-procession-review";

const contract = buildFirstFireBlenderContract();

function runtimeEntry(shrineId: "dj" | "ek" | "fl") {
  const shrine = contract.shrines.find(
    (candidate) => candidate.id === shrineId
  )!;
  return { x: shrine.blenderEntry.x, z: -shrine.blenderEntry.y };
}

function runtimeOrbitPoint(
  shrineId: "dj" | "ek" | "fl",
  travelledDegrees: number
) {
  const shrine = contract.shrines.find(
    (candidate) => candidate.id === shrineId
  )!;
  const direction = Math.sign(shrine.orbitSweepDegrees);
  const radians =
    ((shrine.orbitStartDegrees + direction * travelledDegrees) * Math.PI) / 180;
  return {
    x: shrine.blenderCentre.x + Math.cos(radians) * shrine.orbitRadius,
    z: -shrine.blenderCentre.y + Math.sin(radians) * shrine.orbitRadius,
  };
}

describe("First Fire Cinder Court review interaction", () => {
  it("advances DJ -> EK on forward movement through the carved route", () => {
    let state = createFirstFireGrayboxReviewState();
    state = updateFirstFireGrayboxReview(state, contract, { x: 0, z: 0 }, 16);
    expect(state.procession.phase).toBe("approach");

    state = updateFirstFireGrayboxReview(
      state,
      contract,
      runtimeEntry("dj"),
      16
    );
    expect(state.procession.phase).toBe("dj-active");
    state = updateFirstFireGrayboxReview(
      state,
      contract,
      runtimeOrbitPoint("dj", 0),
      16
    );
    const djSweep = Math.abs(
      contract.shrines.find((candidate) => candidate.id === "dj")!
        .orbitSweepDegrees
    );
    for (const travelled of [
      djSweep * 0.1,
      djSweep * 0.35,
      djSweep * 0.6,
      djSweep * 0.85,
    ]) {
      state = updateFirstFireGrayboxReview(
        state,
        contract,
        runtimeOrbitPoint("dj", travelled),
        16
      );
    }
    expect(state.procession.phase).toBe("dj-complete");
    expect(state.procession.orbitProgress.dj).toBe(4);

    // Forward movement alone advances the procession: reaching EK's threshold
    // is only possible after walking out of DJ, so no extra gate is needed.
    state = updateFirstFireGrayboxReview(
      state,
      contract,
      runtimeEntry("ek"),
      16
    );
    expect(state.procession.phase).toBe("ek-active");
  });

  it("scales orbit zone gates to each court's authored viewing sweep", () => {
    for (const shrine of contract.shrines) {
      const thresholds = firstFireOrbitZoneThresholds(shrine.orbitSweepDegrees);
      const sweep = Math.min(360, Math.abs(shrine.orbitSweepDegrees));
      expect(thresholds).toHaveLength(4);
      expect(thresholds[3]).toBeLessThan(sweep);
      expect(thresholds[0]).toBeGreaterThan(0);
      for (let index = 1; index < thresholds.length; index += 1) {
        expect(thresholds[index]).toBeGreaterThan(thresholds[index - 1]!);
      }
    }
    // A shorter authored arc must stay completable; a fixed 280 degree final
    // gate could never be reached on one.
    expect(firstFireOrbitZoneThresholds(-50)[3]).toBeLessThan(50);
  });

  it("completes every court by walking only its own authored sweep", () => {
    for (const shrine of contract.shrines) {
      let state = createFirstFireGrayboxReviewState();
      while (state.procession.phase !== `${shrine.id}-active`) {
        state = advanceFirstFireGrayboxProof(state);
      }
      const sweep = Math.min(360, Math.abs(shrine.orbitSweepDegrees));
      for (let step = 0; step <= 24; step += 1) {
        state = updateFirstFireGrayboxReview(
          state,
          contract,
          runtimeOrbitPoint(shrine.id, (sweep * step) / 24),
          16
        );
      }
      expect(state.procession.orbitProgress[shrine.id]).toBe(4);
    }
  });

  it("keeps exactly one current performer while completed lanes become coals", () => {
    let state = createFirstFireGrayboxReviewState();
    expect(displayedFirstFireShrine(state.procession.phase)).toBeNull();
    state = advanceFirstFireGrayboxProof(state);
    expect(displayedFirstFireShrine(state.procession.phase)).toBe("dj");
    state = advanceFirstFireGrayboxProof(state);
    expect(state.procession.phase).toBe("dj-complete");
    expect(displayedFirstFireShrine(state.procession.phase)).toBe("dj");
    // DJ has not been walked away from yet, so it is still alight alongside the
    // beacon on the court ahead.
    expect([...visibleFirstFireFlameGroups(state)].sort()).toEqual([
      "dj",
      "ek",
      "field",
    ]);
  });

  it("keeps a finished court burning until the visitor leaves its light", () => {
    // The failure this locks: DJ went black the frame the orbit completed,
    // while the visitor was still standing next to the performer.
    const dj = contract.shrines.find((candidate) => candidate.id === "dj")!;
    const centre = { x: dj.blenderCentre.x, z: -dj.blenderCentre.y };
    let state = createFirstFireGrayboxReviewState();
    state = advanceFirstFireGrayboxProof(state);
    state = advanceFirstFireGrayboxProof(state);
    expect(state.procession.phase).toBe("dj-complete");

    const inside = FIRST_FIRE_COURT_LIGHT_REACH_METRES - 4;
    state = updateFirstFireGrayboxReview(
      state,
      contract,
      { x: centre.x, z: centre.z + inside },
      16
    );
    expect(state.extinguished.dj).toBe(false);
    expect(litFirstFireShrine(state)).toBe("dj");
    expect(visibleFirstFireFlameGroups(state).has("dj")).toBe(true);

    const beyond = FIRST_FIRE_COURT_LIGHT_REACH_METRES + 6;
    state = updateFirstFireGrayboxReview(
      state,
      contract,
      { x: centre.x, z: centre.z + beyond },
      16
    );
    expect(state.extinguished.dj).toBe(true);
    expect(litFirstFireShrine(state)).toBeNull();
    expect(visibleFirstFireFlameGroups(state).has("dj")).toBe(false);

    // A performer who has burned down stays down: walking back in must not
    // relight them.
    state = updateFirstFireGrayboxReview(
      state,
      contract,
      { x: centre.x, z: centre.z + 5 },
      16
    );
    expect(state.extinguished.dj).toBe(true);
    expect(visibleFirstFireFlameGroups(state).has("dj")).toBe(false);
  });

  it("carries an ordinary sloppy walk through all three courts", () => {
    // A visitor does not trace the painted ribbon. Walking each court a metre
    // wide once froze the orbit at incomplete, which left EK and FL dark with
    // no performer and no fire for the rest of the room.
    // Wider than the old ribbon band (orbitWidth/2 + 0.35 = 1.85 m) and still
    // inside the 7 m court, so this fails against the band gate and passes
    // against court containment.
    const wide = 1.95;
    let state = createFirstFireGrayboxReviewState();
    for (const shrineId of ["dj", "ek", "fl"] as const) {
      const shrine = contract.shrines.find((c) => c.id === shrineId)!;
      const centre = { x: shrine.blenderCentre.x, z: -shrine.blenderCentre.y };
      const mouth = runtimeEntry(shrineId);
      state = updateFirstFireGrayboxReview(state, contract, mouth, 16);
      expect(state.procession.phase).toBe(`${shrineId}-active`);

      const sweep = Math.abs(shrine.orbitSweepDegrees);
      const direction = Math.sign(shrine.orbitSweepDegrees);
      for (let travelled = 0; travelled <= sweep; travelled += 2) {
        const radians =
          ((shrine.orbitStartDegrees + direction * travelled) * Math.PI) / 180;
        const radius = shrine.orbitRadius + wide;
        state = updateFirstFireGrayboxReview(
          state,
          contract,
          {
            x: centre.x + Math.cos(radians) * radius,
            z: centre.z + Math.sin(radians) * radius,
          },
          16
        );
      }
      expect(state.procession.phase).not.toBe(`${shrineId}-active`);
    }
    expect(state.procession.phase).toBe("fire-extinguished");
  });

  it("completes a court at its exit mouth even when the sweep was not tracked", () => {
    // The failure this locks: a visitor who cuts the horseshoe leaves the
    // court unfinished, and EK and FL then never light for the rest of the run.
    let state = createFirstFireGrayboxReviewState();
    for (const shrineId of ["dj", "ek", "fl"] as const) {
      const shrine = contract.shrines.find((c) => c.id === shrineId)!;
      state = updateFirstFireGrayboxReview(
        state,
        contract,
        runtimeEntry(shrineId),
        16
      );
      expect(state.procession.phase).toBe(`${shrineId}-active`);
      state = updateFirstFireGrayboxReview(
        state,
        contract,
        { x: shrine.blenderExit.x, z: -shrine.blenderExit.y },
        16
      );
      expect(state.procession.phase).not.toBe(`${shrineId}-active`);
    }
    expect(state.procession.phase).toBe("fire-extinguished");
  });

  it("holds a timed neutral blackout before exposing the green Earth route", () => {
    let state = createFirstFireGrayboxReviewState();
    for (let index = 0; index < 6; index += 1) {
      state = advanceFirstFireGrayboxProof(state);
    }
    expect(state.procession.phase).toBe("fire-extinguished");
    expect(visibleFirstFireFlameGroups(state).size).toBe(0);

    state = updateFirstFireGrayboxReview(
      state,
      contract,
      { x: 0, z: 0 },
      FIRST_FIRE_NEUTRAL_BLACKOUT_MS - 1
    );
    expect(state.procession.phase).toBe("fire-extinguished");
    state = updateFirstFireGrayboxReview(state, contract, { x: 0, z: 0 }, 1);
    expect(state.procession.phase).toBe("growth-complete");
    expect(visibleFirstFireFlameGroups(state).size).toBe(0);
  });
});
