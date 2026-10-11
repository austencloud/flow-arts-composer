import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditFlowFestIntegratedJourney,
  createFlowFestIntegratedJourney,
  FLOW_FEST_MAX_AREA_HISTORY_ENTRIES,
  identifyFlowFestIntegratedArea,
  observeFlowFestIntegratedArea,
  restoreFlowFestIntegratedJourney,
  setFlowFestIntegratedJourneyBranch,
  type FlowFestIntegratedAreaId,
} from "#lib/features/flow-fest-sim/domain/flow-fest-integrated-world.js";
import { computeFlowFestSiteAudioMix } from "#lib/features/flow-fest-sim/domain/flow-fest-site-audio.js";
import {
  parseFlowFestRuntimeContract,
  type FlowFestBranchId,
  type FlowFestRuntimeContract,
} from "../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";

const FINGERPRINT = "gate5-contract";

function readContract(): FlowFestRuntimeContract {
  return parseFlowFestRuntimeContract(
    JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "static/data/flow-fest-sim/gate2-runtime-contract.json"
        ),
        "utf8"
      )
    ) as unknown
  );
}

describe("Flow Fest Gate 5 integrated world", () => {
  it.each<FlowFestBranchId>(["lower-tent", "upper-tent", "car-camp"])(
    "recognizes registered landmarks for the %s branch",
    (branch) => {
      const contract = readContract();
      const campZoneId =
        branch === "lower-tent"
          ? "lower-tent-zone"
          : branch === "upper-tent"
            ? "upper-tent-zone"
            : "car-camp-zone";
      const camp = contract.zones.find((zone) => zone.id === campZoneId)!;
      const lowerGate = contract.zones.find(
        (zone) => zone.id === "lower-gate-zone"
      )!;

      expect(
        identifyFlowFestIntegratedArea(contract, branch, lowerGate.center)
      ).toBe("lower-gate");
      expect(
        identifyFlowFestIntegratedArea(contract, branch, camp.center)
      ).toBe("selected-camp");
      expect(
        identifyFlowFestIntegratedArea(contract, branch, { x: 100, z: -115 })
      ).toBe("festival");
    }
  );

  it("proves entry, exit, re-entry, backtracking, and the camp return", () => {
    let state = createFlowFestIntegratedJourney(FINGERPRINT, "lower-tent");
    for (const area of [
      "lower-gate",
      "transit",
      "selected-camp",
      "transit",
      "festival",
      "transit",
      "selected-camp",
      "transit",
      "festival",
    ] as const) {
      state = observeFlowFestIntegratedArea(state, area);
    }

    expect(auditFlowFestIntegratedJourney(state)).toMatchObject({
      festivalEntries: 2,
      festivalExits: 1,
      backtrackingConfirmed: true,
      festivalReentryConfirmed: true,
      campReturnConfirmed: true,
      completeArrivalNightReturn: true,
    });
  });

  it("restores only the matching source-locked journey", () => {
    let state = createFlowFestIntegratedJourney(FINGERPRINT);
    state = setFlowFestIntegratedJourneyBranch(state, "upper-tent");
    state = observeFlowFestIntegratedArea(state, "lower-gate");
    state = observeFlowFestIntegratedArea(state, "selected-camp");

    expect(restoreFlowFestIntegratedJourney(state, FINGERPRINT)).toEqual(state);
    expect(restoreFlowFestIntegratedJourney(state, "new-contract")).toBeNull();
    expect(
      restoreFlowFestIntegratedJourney(
        { ...state, areaHistory: ["lower-gate", "lower-gate"] },
        FINGERPRINT
      )
    ).toBeNull();
  });

  it("caps the live area history to match the restore contract, keeping the most recent entries", () => {
    const cycle: Exclude<FlowFestIntegratedAreaId, "transit">[] = [
      "lower-gate",
      "selected-camp",
      "west-parking",
      "festival",
    ];
    let state = createFlowFestIntegratedJourney(FINGERPRINT, "lower-tent");
    const totalObservations = FLOW_FEST_MAX_AREA_HISTORY_ENTRIES + 36;
    for (let index = 0; index < totalObservations; index += 1) {
      state = observeFlowFestIntegratedArea(state, cycle[index % cycle.length]!);
    }

    expect(state.areaHistory).toHaveLength(FLOW_FEST_MAX_AREA_HISTORY_ENTRIES);
    const expectedCurrent = cycle[(totalObservations - 1) % cycle.length]!;
    expect(state.currentArea).toBe(expectedCurrent);
    expect(state.areaHistory.at(-1)).toBe(expectedCurrent);
    // The runtime cap and the restore contract's cap must agree, or a
    // legitimately long journey gets trimmed live only to be discarded
    // wholesale on the next load.
    expect(restoreFlowFestIntegratedJourney(state, FINGERPRINT)).toEqual(state);
  });

  it("rejects a restored snapshot whose landmark currentArea is not the most recent history entry", () => {
    let state = createFlowFestIntegratedJourney(FINGERPRINT, "lower-tent");
    state = observeFlowFestIntegratedArea(state, "lower-gate");
    state = observeFlowFestIntegratedArea(state, "selected-camp");

    const inconsistent = { ...state, currentArea: "festival" as const };
    expect(
      restoreFlowFestIntegratedJourney(inconsistent, FINGERPRINT)
    ).toBeNull();
  });

  it("normalizes a restored snapshot's missing branch to null instead of leaving it undefined", () => {
    let state = createFlowFestIntegratedJourney(FINGERPRINT);
    state = observeFlowFestIntegratedArea(state, "lower-gate");
    const { branch: _branch, ...withoutBranch } = state;

    const restored = restoreFlowFestIntegratedJourney(
      withoutBranch,
      FINGERPRINT
    );
    expect(restored).not.toBeNull();
    expect(restored?.branch).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(restored, "branch")
    ).toBe(true);
  });

  it("crossfades one site mix from arrival to camp to the fire circle", () => {
    const layout = {
      gateCenter: { x: 340, z: -20 },
      campCenter: { x: 286, z: -130 },
      fireCenter: { x: 89, z: -113.5 },
      ledCircleCenter: { x: 120, z: -103 },
    };

    expect(
      computeFlowFestSiteAudioMix(layout, layout.gateCenter, "not-started", 0.7)
        .dominantLayer
    ).toBe("arrival-field");
    expect(
      computeFlowFestSiteAudioMix(layout, layout.campCenter, "not-started", 0.7)
        .dominantLayer
    ).toBe("camp");
    const fire = computeFlowFestSiteAudioMix(
      layout,
      layout.fireCenter,
      "active",
      0.7
    );
    expect(fire.dominantLayer).toBe("fire-circle");
    expect(fire.fire).toBe(1);
    expect(fire.master).toBe(0.7);
  });
});
