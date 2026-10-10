import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FLOW_FEST_AUDIO_CAMP_SYSTEM_ZONE_IDS,
  FLOW_FEST_AUDIO_FIELD_CONTRACT,
  FLOW_FEST_AUDIO_GENERATOR_LANDMARK_ID,
  FLOW_FEST_AUDIO_SOURCE_CLASS_PROFILE,
  buildFlowFestAudioFieldSources,
  computeFlowFestAudioOcclusion,
  createFlowFestAudioFieldSolution,
  flowFestAudioDistanceLowpassHz,
  flowFestAudioPhaseForMoment,
  flowFestAudioRolloffGain,
  readFlowFestAudioFieldTiers,
  solveFlowFestAudioField,
  type FlowFestAudioSource,
  type FlowFestAudioSourceCharacter,
  type FlowFestAudioSourceClass,
  type FlowFestAudioTier,
} from "#lib/features/flow-fest-sim/domain/flow-fest-audio-field.js";
import {
  FLOW_FEST_WALLA_CONTRACT,
  flowFestWallaOccupancy,
  flowFestWallaOnsetsPerSecond,
  flowFestWallaWindowIndexAt,
  scheduleFlowFestWallaWindow,
} from "#lib/features/flow-fest-sim/domain/flow-fest-audio-walla.js";
import {
  computeFlowFestSiteAudioBedFilters,
  computeFlowFestSiteAudioMix,
  type FlowFestSiteAudioLayout,
} from "#lib/features/flow-fest-sim/domain/flow-fest-site-audio.js";
import { FLOW_FEST_FIRE_JAM_CONTRACT } from "#lib/features/flow-fest-sim/domain/flow-fest-fire-jam.js";
import { FlowFestFireJamSoundscape } from "#lib/features/flow-fest-sim/services/implementations/FlowFestFireJamSoundscape.js";
import { createFlowFestCampPlan } from "../../src/routes/test/flow-fest-sim/flow-fest-camp-plan";
import {
  parseFlowFestRuntimeContract,
  type FlowFestRuntimeContract,
} from "../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";

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

const LAYOUT: FlowFestSiteAudioLayout = {
  gateCenter: { x: 340, z: -20 },
  campCenter: { x: 286, z: -130 },
  fireCenter: { x: 89, z: -113.5 },
  ledCircleCenter: { x: 120, z: -103 },
};

function syntheticSource(
  id: string,
  x: number,
  z: number,
  sourceClass: FlowFestAudioSourceClass = "camp-system",
  character: FlowFestAudioSourceCharacter = "deep-pulse"
): FlowFestAudioSource {
  const profile = FLOW_FEST_AUDIO_SOURCE_CLASS_PROFILE[sourceClass];
  return {
    id,
    label: id,
    sourceClass,
    character,
    position: { x, y: profile.heightAboveGroundMeters, z },
    priority: profile.priority,
    refDistanceMeters: profile.refDistanceMeters,
    maxDistanceMeters: profile.maxDistanceMeters,
    rolloffFactor: profile.rolloffFactor,
    phaseGain: { ...profile.phaseGain },
    provenance: {
      featureId: id,
      featureKind: "derived",
      evidence: "festival-placement",
      note: "synthetic fixture",
    },
  };
}

const ORIGIN_LISTENER = { x: 0, y: 1.7, z: 0, yawRadians: 0 };

describe("Flow Fest audio field source inventory", () => {
  it("derives every source position from a registered plan or festival feature", () => {
    const contract = readContract();
    const plan = createFlowFestCampPlan(contract, "lower-tent");
    const nightHeart = contract.zones.find(
      (zone) => zone.id === "night-heart-zone"
    )!;
    const festival = {
      fireCenter: { x: nightHeart.center.x, y: 0, z: nightHeart.center.z },
      ledCircleCenter: {
        x: nightHeart.center.x + 20,
        y: 0,
        z: nightHeart.center.z + 12,
      },
      ingressBearingRadians: 0.4,
      spectatorCount: 9,
      performerCount: 3,
    };

    const sources = buildFlowFestAudioFieldSources({ plan, festival });
    const byId = new Map(sources.map((source) => [source.id, source]));

    expect([...byId.keys()]).toEqual([
      "fire-jam",
      "led-circle",
      "drum-circle",
      "festival-crowd",
      "camp-system-car-camp-zone",
      "camp-system-upper-tent-zone",
      "buildings-generator",
    ]);

    // The player's own camp never gets a sound system.
    expect(plan.selectedCampZoneId).toBe("lower-tent-zone");
    expect(byId.has("camp-system-lower-tent-zone")).toBe(false);

    for (const zoneId of FLOW_FEST_AUDIO_CAMP_SYSTEM_ZONE_IDS.filter(
      (candidate) => candidate !== plan.selectedCampZoneId
    )) {
      const zone = plan.zones.find((candidate) => candidate.id === zoneId)!;
      const source = byId.get(`camp-system-${zoneId}`)!;
      expect(source.position.x).toBe(zone.center.x);
      expect(source.position.z).toBe(zone.center.z);
      expect(source.provenance).toMatchObject({
        featureId: zoneId,
        featureKind: "zone",
        evidence: zone.evidence,
      });
    }

    const buildings = plan.landmarks.find(
      (landmark) => landmark.id === FLOW_FEST_AUDIO_GENERATOR_LANDMARK_ID
    )!;
    const generator = byId.get("buildings-generator")!;
    expect(generator.position.x).toBe(buildings.position.x);
    expect(generator.position.z).toBe(buildings.position.z);
    expect(generator.provenance.featureKind).toBe("landmark");
    expect(generator.provenance.evidence).toBe(buildings.evidence);

    // Festival sources ride the community layout, not literals.
    expect(byId.get("fire-jam")!.position).toEqual(festival.fireCenter);
    expect(byId.get("led-circle")!.position).toEqual(festival.ledCircleCenter);

    const fire = festival.fireCenter;
    const drum = byId.get("drum-circle")!;
    expect(Math.hypot(drum.position.x - fire.x, drum.position.z - fire.z)).toBeCloseTo(
      FLOW_FEST_FIRE_JAM_CONTRACT.performanceFloorRadiusMeters,
      6
    );
    const crowd = byId.get("festival-crowd")!;
    expect(
      Math.hypot(crowd.position.x - fire.x, crowd.position.z - fire.z)
    ).toBeCloseTo(FLOW_FEST_FIRE_JAM_CONTRACT.wheelParkingRadiusMeters * 0.75, 6);
    expect(crowd.position.x - fire.x).toBeCloseTo(
      Math.sin(festival.ingressBearingRadians) *
        FLOW_FEST_FIRE_JAM_CONTRACT.wheelParkingRadiusMeters *
        0.75,
      6
    );

    // Every camp system gets its own character, so no two read as one PA.
    const campCharacters = sources
      .filter((source) => source.sourceClass === "camp-system")
      .map((source) => source.character);
    expect(new Set(campCharacters).size).toBe(campCharacters.length);
  });

  it("moves plan-derived sources onto the measured ground when a sampler exists", () => {
    const contract = readContract();
    const plan = createFlowFestCampPlan(contract, "car-camp");
    const festival = {
      fireCenter: { x: 0, y: 0, z: 0 },
      ledCircleCenter: { x: 20, y: 0, z: 12 },
      ingressBearingRadians: 0,
      spectatorCount: 4,
      performerCount: 2,
    };

    const flat = buildFlowFestAudioFieldSources({ plan, festival });
    const raised = buildFlowFestAudioFieldSources({
      plan,
      festival,
      sampleGroundY: () => 12,
    });

    const generatorHeight =
      FLOW_FEST_AUDIO_SOURCE_CLASS_PROFILE.generator.heightAboveGroundMeters;
    const flatGenerator = flat.find(
      (source) => source.id === "buildings-generator"
    )!;
    const raisedGenerator = raised.find(
      (source) => source.id === "buildings-generator"
    )!;
    expect(flatGenerator.position.y).toBeCloseTo(generatorHeight, 6);
    expect(raisedGenerator.position.y).toBeCloseTo(12 + generatorHeight, 6);

    // The player's camp is the car camp here, so the offered systems change.
    expect(
      raised
        .filter((source) => source.sourceClass === "camp-system")
        .map((source) => source.id)
    ).toEqual([
      "camp-system-lower-tent-zone",
      "camp-system-upper-tent-zone",
    ]);
  });
});

describe("Flow Fest audio field tier ranking", () => {
  it("never exceeds the HRTF hero limit however many sources are audible", () => {
    const sources = Array.from({ length: 14 }, (_, index) =>
      syntheticSource(`camp-${index.toString().padStart(2, "0")}`, 10 + index * 3, 0)
    );
    const solution = solveFlowFestAudioField(sources, ORIGIN_LISTENER, {
      phase: "night",
    });

    expect(solution.heroLimit).toBe(FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit);
    expect(solution.audibleCount).toBe(14);
    expect(solution.heroCount).toBe(FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit);
    expect(solution.midCount).toBe(14 - FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit);
    expect(
      solution.sources.filter((state) => state.panningModel === "HRTF")
    ).toHaveLength(FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit);
    expect(solution.sources.every((state) => state.tier !== "bed")).toBe(true);
  });

  it("promotes the nearest sources and folds inaudible ones into the bed", () => {
    const sources = [
      syntheticSource("near", 12, 0),
      syntheticSource("middle", 60, 0),
      // Beyond the camp-system max distance, so its rolloff gain is zero.
      syntheticSource("far", 400, 0),
    ];
    const solution = solveFlowFestAudioField(sources, ORIGIN_LISTENER, {
      phase: "night",
      heroLimit: 1,
    });

    const byId = new Map(solution.sources.map((state) => [state.id, state]));
    expect(byId.get("near")!.tier).toBe("hero");
    expect(byId.get("near")!.panningModel).toBe("HRTF");
    expect(byId.get("middle")!.tier).toBe("mid");
    expect(byId.get("middle")!.panningModel).toBe("equalpower");
    expect(byId.get("far")!.tier).toBe("bed");
    expect(byId.get("far")!.panningModel).toBe("none");
    expect(byId.get("far")!.audible).toBe(false);
    expect(solution.bedCount).toBe(1);
    expect(solution.promotions).toEqual(["near"]);
    expect(solution.demotions).toEqual([]);
  });

  it("holds an incumbent hero through a marginal rival and yields to a decisive one", () => {
    const incumbent = syntheticSource("incumbent", 30, 0);
    const marginal = syntheticSource("challenger", 28, 0);
    const decisive = syntheticSource("challenger", 15, 0);
    const previousTiers = new Map<string, FlowFestAudioTier>([
      ["incumbent", "hero"],
      ["challenger", "mid"],
    ]);

    const held = solveFlowFestAudioField(
      [incumbent, marginal],
      ORIGIN_LISTENER,
      { phase: "night", heroLimit: 1, previousTiers }
    );
    const heldById = new Map(held.sources.map((state) => [state.id, state]));
    // The rival is genuinely closer and louder, and still does not take the slot.
    expect(heldById.get("challenger")!.score).toBeGreaterThan(
      heldById.get("incumbent")!.score
    );
    expect(heldById.get("incumbent")!.tier).toBe("hero");
    expect(heldById.get("challenger")!.tier).toBe("mid");
    expect(held.promotions).toEqual([]);
    expect(held.demotions).toEqual([]);

    const yielded = solveFlowFestAudioField(
      [incumbent, decisive],
      ORIGIN_LISTENER,
      { phase: "night", heroLimit: 1, previousTiers }
    );
    const yieldedById = new Map(
      yielded.sources.map((state) => [state.id, state])
    );
    expect(yieldedById.get("challenger")!.tier).toBe("hero");
    expect(yieldedById.get("incumbent")!.tier).toBe("mid");
    expect(yielded.promotions).toEqual(["challenger"]);
    expect(yielded.demotions).toEqual(["incumbent"]);
  });

  it("reuses one solution object across ticks instead of allocating per frame", () => {
    const sources = [syntheticSource("a", 20, 0), syntheticSource("b", 40, 0)];
    const scratch = createFlowFestAudioFieldSolution();
    const first = solveFlowFestAudioField(sources, ORIGIN_LISTENER, {
      phase: "night",
    }, scratch);
    const firstState = first.sources[0];
    const second = solveFlowFestAudioField(
      sources,
      { ...ORIGIN_LISTENER, x: 5 },
      { phase: "night" },
      scratch
    );

    expect(second).toBe(scratch);
    expect(second).toBe(first);
    expect(second.sources[0]).toBe(firstState);
    expect(second.sources).toHaveLength(2);
    expect(second.sources[0].distanceMeters).not.toBe(
      first.sources[0].score * 0 + 20
    );
  });

  it("silences day sources that only belong to the night and keeps the field awake after dusk", () => {
    const led = syntheticSource("led", 20, 0, "led-circle", "led-drone");
    const day = solveFlowFestAudioField([led], ORIGIN_LISTENER, {
      phase: "day",
    });
    const night = solveFlowFestAudioField([led], ORIGIN_LISTENER, {
      phase: "night",
    });

    expect(day.sources[0].gain).toBe(0);
    expect(day.sources[0].tier).toBe("bed");
    expect(night.sources[0].gain).toBeGreaterThan(0);
    expect(night.sources[0].tier).toBe("hero");
    expect(flowFestAudioPhaseForMoment("night")).toBe("night");
    expect(flowFestAudioPhaseForMoment("golden-hour")).toBe("dusk");
    expect(flowFestAudioPhaseForMoment("midday")).toBe("day");
  });

  it("reads back a tier ledger for the next tick's hysteresis", () => {
    const sources = [syntheticSource("a", 20, 0), syntheticSource("b", 400, 0)];
    const solution = solveFlowFestAudioField(sources, ORIGIN_LISTENER, {
      phase: "night",
      heroLimit: 1,
    });
    const ledger = new Map<string, FlowFestAudioTier>([["stale", "hero"]]);
    readFlowFestAudioFieldTiers(solution, ledger);
    expect([...ledger.entries()]).toEqual([
      ["a", "hero"],
      ["b", "bed"],
    ]);
  });
});

describe("Flow Fest site audio bus law", () => {
  it("keeps the documented six-channel mix for the existing scenarios", () => {
    expect(
      computeFlowFestSiteAudioMix(LAYOUT, LAYOUT.gateCenter, "not-started", 0.7)
        .dominantLayer
    ).toBe("arrival-field");
    expect(
      computeFlowFestSiteAudioMix(LAYOUT, LAYOUT.campCenter, "not-started", 0.7)
        .dominantLayer
    ).toBe("camp");

    const fire = computeFlowFestSiteAudioMix(
      LAYOUT,
      LAYOUT.fireCenter,
      "active",
      0.7
    );
    expect(fire.dominantLayer).toBe("fire-circle");
    expect(fire.fire).toBe(1);
    expect(fire.master).toBe(0.7);
    expect(fire.crowd).toBeCloseTo(0.64, 6);
    expect(fire.arrival).toBe(0);
    expect(fire.camp).toBe(0);
    expect(fire.woodland).toBeCloseTo(0.16, 6);

    const gate = computeFlowFestSiteAudioMix(
      LAYOUT,
      LAYOUT.gateCenter,
      "not-started",
      0.7
    );
    expect(gate.arrival).toBe(1);
    expect(gate.woodland).toBeCloseTo(0.32, 6);
    expect(gate.fire).toBe(0);
    expect(gate.led).toBe(0);
    expect(gate.crowd).toBe(0);

    // The jam state still scales the fire and crowd channels the same way.
    const idleFire = computeFlowFestSiteAudioMix(
      LAYOUT,
      LAYOUT.fireCenter,
      "not-started",
      1
    );
    const doneFire = computeFlowFestSiteAudioMix(
      LAYOUT,
      LAYOUT.fireCenter,
      "completed",
      1
    );
    expect(idleFire.fire).toBeCloseTo(0.5, 6);
    expect(doneFire.fire).toBeCloseTo(0.72, 6);
    expect(idleFire.crowd).toBeCloseTo(0.28, 6);
    expect(computeFlowFestSiteAudioMix(LAYOUT, LAYOUT.fireCenter, "active", 4).master).toBe(1);
  });

  it("closes the bed brightness with distance and leaves the woodland air open", () => {
    const atFire = computeFlowFestSiteAudioBedFilters(LAYOUT, LAYOUT.fireCenter);
    const atGate = computeFlowFestSiteAudioBedFilters(LAYOUT, LAYOUT.gateCenter);

    expect(atFire.fireHz).toBeCloseTo(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
      6
    );
    expect(atGate.fireHz).toBeLessThan(atFire.fireHz);
    expect(atGate.arrivalHz).toBeCloseTo(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
      6
    );
    expect(atFire.woodlandHz).toBe(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz
    );
    expect(atGate.woodlandHz).toBe(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz
    );
    expect(atGate.crowdHz).toBe(Math.max(atGate.fireHz, atGate.ledHz));

    // Distance eats the top end long before it eats the level.
    expect(flowFestAudioDistanceLowpassHz(0)).toBeCloseTo(18000, 6);
    expect(flowFestAudioDistanceLowpassHz(120)).toBeLessThan(2600);
    expect(flowFestAudioDistanceLowpassHz(100000)).toBe(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.distantLowpassFloorHz
    );
    expect(flowFestAudioRolloffGain(4, 8, 132, 0.72)).toBe(1);
    expect(flowFestAudioRolloffGain(132, 8, 132, 0.72)).toBe(0);
    expect(flowFestAudioRolloffGain(200, 8, 132, 0.72)).toBe(0);
  });
});

describe("Flow Fest audio field terrain occlusion", () => {
  const listener = { x: 0, y: 1.7, z: 0 };
  const source = { x: 40, y: 1.2, z: 0 };

  it("leaves a clear line of sight fully open", () => {
    const clear = computeFlowFestAudioOcclusion(listener, source, () => 0);
    expect(clear).toEqual({
      blocked: false,
      obstructionMeters: 0,
      blockedFraction: 0,
      lowpassHz: FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz,
      gainScale: 1,
    });
  });

  it("closes the filter and dips the gain behind a ridge", () => {
    const ridge = (x: number) => (x > 15 && x < 25 ? 8 : 0);
    const blocked = computeFlowFestAudioOcclusion(listener, source, ridge);

    expect(blocked.blocked).toBe(true);
    expect(blocked.obstructionMeters).toBeGreaterThan(6);
    expect(blocked.blockedFraction).toBe(1);
    expect(blocked.lowpassHz).toBeCloseTo(520, 6);
    expect(blocked.gainScale).toBeCloseTo(0.45, 6);

    const clear = computeFlowFestAudioOcclusion(listener, source, () => 0);
    expect(blocked.lowpassHz).toBeLessThan(clear.lowpassHz / 30);
    expect(blocked.gainScale).toBeLessThan(clear.gainScale);
  });

  it("scales partial relief between open and fully blocked", () => {
    const shallow = computeFlowFestAudioOcclusion(listener, source, (x) =>
      x > 15 && x < 25 ? 3 : 0
    );
    expect(shallow.blocked).toBe(true);
    expect(shallow.blockedFraction).toBeGreaterThan(0);
    expect(shallow.blockedFraction).toBeLessThan(1);
    expect(shallow.gainScale).toBeGreaterThan(0.45);
    expect(shallow.gainScale).toBeLessThan(1);
    expect(shallow.lowpassHz).toBeGreaterThan(520);
    expect(shallow.lowpassHz).toBeLessThan(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz
    );
  });

  it("ignores measurement noise, short spans, and gaps in the heightmap", () => {
    // A 1.6 m hummock barely clears the ear-to-source sightline. That is
    // heightmap noise, not a hill, and it must not close the filter.
    const hummock = computeFlowFestAudioOcclusion(listener, source, (x) =>
      x > 15 && x < 25 ? 1.6 : 0
    );
    expect(hummock.blocked).toBe(false);

    const hill = computeFlowFestAudioOcclusion(listener, source, (x) =>
      x > 15 && x < 25 ? 2.5 : 0
    );
    expect(hill.blocked).toBe(true);

    // A source a couple of metres away is never occluded, whatever the sampler
    // reports, because the interior samples have nowhere useful to land.
    const shortSpan = computeFlowFestAudioOcclusion(
      listener,
      { x: 2, y: 1.2, z: 0 },
      () => 40
    );
    expect(shortSpan.blocked).toBe(false);

    // Off the measured tile the sampler returns NaN. Skipped, never propagated.
    const offTile = computeFlowFestAudioOcclusion(
      listener,
      source,
      () => Number.NaN
    );
    expect(offTile.blocked).toBe(false);
    expect(offTile.gainScale).toBe(1);
  });

  it("routes occlusion through the field solve only when a sampler is configured", () => {
    const sources = [syntheticSource("blocked", 40, 0)];
    const ridge = (x: number) => (x > 15 && x < 25 ? 8 : 0);

    const withoutSampler = solveFlowFestAudioField(sources, ORIGIN_LISTENER, {
      phase: "night",
    });
    const withSampler = solveFlowFestAudioField(sources, ORIGIN_LISTENER, {
      phase: "night",
      sampleGroundY: ridge,
    });

    expect(withoutSampler.sources[0].occluded).toBe(false);
    expect(withSampler.sources[0].occluded).toBe(true);
    expect(withSampler.sources[0].gain).toBeCloseTo(
      withoutSampler.sources[0].gain * 0.45,
      6
    );
    expect(withSampler.sources[0].lowpassHz).toBeLessThan(
      withoutSampler.sources[0].lowpassHz
    );
  });
});

describe("Flow Fest crowd walla scheduler", () => {
  it("replays a seed and window identically", () => {
    const options = {
      seed: 1234,
      windowIndex: 7,
      occupancy: 0.8,
      nightEnergy: 1,
      nearFire: 0.4,
    };
    expect(scheduleFlowFestWallaWindow(options)).toEqual(
      scheduleFlowFestWallaWindow(options)
    );
    expect(scheduleFlowFestWallaWindow({ ...options, windowIndex: 8 })).not.toEqual(
      scheduleFlowFestWallaWindow(options)
    );
    expect(scheduleFlowFestWallaWindow({ ...options, seed: 1235 })).not.toEqual(
      scheduleFlowFestWallaWindow(options)
    );
  });

  it("scales onset density with occupancy and night energy", () => {
    expect(flowFestWallaOccupancy(0)).toBe(0);
    expect(flowFestWallaOccupancy(13)).toBeCloseTo(0.5, 6);
    expect(
      flowFestWallaOccupancy(FLOW_FEST_WALLA_CONTRACT.referenceOccupancy * 3)
    ).toBe(1);

    const full = flowFestWallaOnsetsPerSecond(1, 1);
    const half = flowFestWallaOnsetsPerSecond(0.5, 1);
    const daytime = flowFestWallaOnsetsPerSecond(1, 0);
    expect(full).toBeCloseTo(FLOW_FEST_WALLA_CONTRACT.baseOnsetsPerSecond, 6);
    expect(half).toBeCloseTo(full / 2, 6);
    expect(daytime).toBeCloseTo(
      full * FLOW_FEST_WALLA_CONTRACT.dayEnergyFloor,
      6
    );
    expect(flowFestWallaOnsetsPerSecond(0, 1)).toBe(0);

    const busy = scheduleFlowFestWallaWindow({
      seed: 9,
      windowIndex: 3,
      occupancy: 1,
      nightEnergy: 1,
    });
    const sparse = scheduleFlowFestWallaWindow({
      seed: 9,
      windowIndex: 3,
      occupancy: 0.15,
      nightEnergy: 1,
    });
    const empty = scheduleFlowFestWallaWindow({
      seed: 9,
      windowIndex: 3,
      occupancy: 0,
      nightEnergy: 1,
    });
    expect(busy.grains.length).toBeGreaterThan(sparse.grains.length);
    expect(empty.grains).toHaveLength(0);
    expect(busy.onsetsPerSecond).toBeGreaterThan(sparse.onsetsPerSecond);
  });

  it("caps transient grains per window and keeps every grain inside it", () => {
    const capped = scheduleFlowFestWallaWindow({
      seed: 55,
      windowIndex: 2,
      occupancy: 1,
      nightEnergy: 1,
      maxGrains: 2,
    });
    expect(capped.grains.length).toBeLessThanOrEqual(2);

    const window = scheduleFlowFestWallaWindow({
      seed: 55,
      windowIndex: 2,
      occupancy: 1,
      nightEnergy: 1,
    });
    expect(window.grains.length).toBeLessThanOrEqual(
      FLOW_FEST_WALLA_CONTRACT.maxGrainsPerWindow
    );
    for (const grain of window.grains) {
      expect(grain.offsetSeconds).toBeGreaterThanOrEqual(0);
      expect(grain.offsetSeconds).toBeLessThan(window.durationSeconds);
      expect(grain.gain).toBeGreaterThan(0);
      expect(grain.pitchRatio).toBeGreaterThan(0);
      expect(grain.pan).toBeGreaterThanOrEqual(-1);
      expect(grain.pan).toBeLessThanOrEqual(1);
      expect(grain.centerHz).toBeGreaterThan(0);
    }
    const offsets = window.grains.map((grain) => grain.offsetSeconds);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    // Randomized inter-onset timing, not a metronome.
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it("shifts the crowd from chatter toward reaction near the fire", () => {
    const tally = (nearFire: number) => {
      let reactions = 0;
      let total = 0;
      for (let windowIndex = 0; windowIndex < 400; windowIndex += 1) {
        const window = scheduleFlowFestWallaWindow({
          seed: 4242,
          windowIndex,
          occupancy: 1,
          nightEnergy: 1,
          nearFire,
        });
        for (const grain of window.grains) {
          total += 1;
          if (grain.kind === "clap" || grain.kind === "whoop") reactions += 1;
        }
      }
      return reactions / total;
    };

    expect(tally(1)).toBeGreaterThan(tally(0) * 1.5);
  });

  it("maps clock seconds onto the window the scheduler will fire", () => {
    expect(flowFestWallaWindowIndexAt(0)).toBe(0);
    expect(flowFestWallaWindowIndexAt(1.99)).toBe(0);
    expect(flowFestWallaWindowIndexAt(2)).toBe(1);
    expect(flowFestWallaWindowIndexAt(5.5)).toBe(2);
    expect(flowFestWallaWindowIndexAt(-3)).toBe(0);
  });
});

// --- Web Audio stub -------------------------------------------------------
// jsdom has no Web Audio. The graph-discipline and unlock tests need a graph
// they can count, so this stub records every node, connection, and start.

class StubAudioParam {
  value = 0;
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class StubAudioNode {
  readonly connections = new Set<StubAudioNode>();
  disconnectCount = 0;
  constructor(
    readonly context: StubAudioContext,
    readonly nodeType: string
  ) {
    context.createdNodes.push(this);
  }
  connect(target: StubAudioNode | StubAudioParam): unknown {
    if (target instanceof StubAudioNode) this.connections.add(target);
    return target;
  }
  disconnect(target?: StubAudioNode): void {
    this.disconnectCount += 1;
    if (target) this.connections.delete(target);
    else this.connections.clear();
  }
}

class StubGainNode extends StubAudioNode {
  readonly gain = new StubAudioParam();
}

class StubBiquadFilterNode extends StubAudioNode {
  type = "lowpass";
  readonly frequency = new StubAudioParam();
  readonly Q = new StubAudioParam();
  readonly gain = new StubAudioParam();
  readonly detune = new StubAudioParam();
}

class StubPannerNode extends StubAudioNode {
  panningModel = "equalpower";
  distanceModel = "inverse";
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  coneInnerAngle = 360;
  coneOuterAngle = 360;
  readonly positionX = new StubAudioParam();
  readonly positionY = new StubAudioParam();
  readonly positionZ = new StubAudioParam();
  readonly orientationX = new StubAudioParam();
  readonly orientationY = new StubAudioParam();
  readonly orientationZ = new StubAudioParam();
}

class StubScheduledSourceNode extends StubAudioNode {
  startCount = 0;
  stopped = false;
  onended: (() => void) | null = null;
  start(): void {
    this.startCount += 1;
    this.context.startedSources.push(this);
  }
  stop(): void {
    this.stopped = true;
  }
}

class StubOscillatorNode extends StubScheduledSourceNode {
  type = "sine";
  readonly frequency = new StubAudioParam();
  readonly detune = new StubAudioParam();
}

class StubBufferSourceNode extends StubScheduledSourceNode {
  buffer: unknown = null;
  loop = false;
  readonly playbackRate = new StubAudioParam();
  readonly detune = new StubAudioParam();
}

function stubListener(): Record<string, StubAudioParam> {
  const listener: Record<string, StubAudioParam> = {};
  for (const key of [
    "positionX",
    "positionY",
    "positionZ",
    "forwardX",
    "forwardY",
    "forwardZ",
    "upX",
    "upY",
    "upZ",
  ]) {
    listener[key] = new StubAudioParam();
  }
  return listener;
}

interface StubAudioContextOptions {
  resumeRejects?: boolean;
  staysSuspended?: boolean;
}

let stubOptions: StubAudioContextOptions = {};
let constructedContexts: StubAudioContext[] = [];

class StubAudioContext {
  // Declared before `destination`: class fields initialize in source order, and
  // constructing that node pushes into these arrays.
  readonly createdNodes: StubAudioNode[] = [];
  readonly startedSources: StubScheduledSourceNode[] = [];
  state: AudioContextState = "suspended";
  currentTime = 0;
  readonly sampleRate = 8000;
  readonly destination = new StubAudioNode(this, "destination");
  readonly listener = stubListener();
  readonly options: StubAudioContextOptions;
  resumeCount = 0;

  constructor() {
    this.options = { ...stubOptions };
    constructedContexts.push(this);
  }

  createGain(): StubGainNode {
    return new StubGainNode(this, "gain");
  }
  createBiquadFilter(): StubBiquadFilterNode {
    return new StubBiquadFilterNode(this, "biquad");
  }
  createPanner(): StubPannerNode {
    return new StubPannerNode(this, "panner");
  }
  createOscillator(): StubOscillatorNode {
    return new StubOscillatorNode(this, "oscillator");
  }
  createBufferSource(): StubBufferSourceNode {
    return new StubBufferSourceNode(this, "buffer-source");
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
    };
  }
  async resume(): Promise<void> {
    this.resumeCount += 1;
    if (this.options.resumeRejects) {
      throw new DOMException("play() failed because the user didn't interact");
    }
    if (!this.options.staysSuspended) this.state = "running";
  }
  async close(): Promise<void> {
    this.state = "closed";
  }
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

function fieldFrame(overrides: Record<string, unknown> = {}) {
  return {
    listener: { x: 0, y: 1.7, z: 0, yawRadians: 0 },
    fireJamState: "active" as const,
    moment: "night",
    masterVolume: 0.8,
    crowdOccupancy: 0,
    nearFire: 0.5,
    ...overrides,
  };
}

describe("Flow Fest soundscape graph discipline", () => {
  let originalAudioContext: unknown;

  beforeEach(() => {
    stubOptions = {};
    constructedContexts = [];
    originalAudioContext = (window as unknown as Record<string, unknown>)
      .AudioContext;
    (window as unknown as Record<string, unknown>).AudioContext =
      StubAudioContext;
  });

  afterEach(() => {
    (window as unknown as Record<string, unknown>).AudioContext =
      originalAudioContext;
  });

  function configuredSoundscape(sourceCount = 12) {
    const soundscape = new FlowFestFireJamSoundscape();
    const sources = Array.from({ length: sourceCount }, (_, index) =>
      syntheticSource(`camp-${index.toString().padStart(2, "0")}`, 12 + index * 4, 0)
    );
    // One walla voice, so the grain scheduler has somewhere to fire.
    sources.push(syntheticSource("festival-crowd", 18, 6, "crowd-walla", "walla"));
    soundscape.configure({ layout: LAYOUT, sources });
    return { soundscape, sources };
  }

  it("builds one context and one graph across repeated unlocks and updates", async () => {
    const { soundscape } = configuredSoundscape();
    expect(await soundscape.unlock()).toBe(true);
    expect(await soundscape.unlock()).toBe(true);

    const context = constructedContexts[0];
    const baseline = soundscape.snapshot();
    expect(constructedContexts).toHaveLength(1);
    expect(baseline.graphBuildCount).toBe(1);
    expect(baseline.unlockState).toBe("running");
    expect(baseline.longLivedSourceCount).toBeGreaterThan(0);

    for (let tick = 0; tick < 30; tick += 1) {
      context.advance(0.05);
      soundscape.update(fieldFrame({ listener: { x: tick, y: 1.7, z: 0, yawRadians: 0 } }));
    }

    const after = soundscape.snapshot();
    expect(constructedContexts).toHaveLength(1);
    expect(after.graphBuildCount).toBe(1);
    // Long-lived voices are re-aimed, never re-created.
    expect(after.longLivedSourceCount).toBe(baseline.longLivedSourceCount);
    expect(after.sourceStartCount).toBe(baseline.sourceStartCount);
    expect(context.startedSources).toHaveLength(after.longLivedSourceCount);
    expect(after.field.updateTicks).toBe(30);
    soundscape.dispose();
  });

  it("caps HRTF panners at the hero limit however many sources are configured", async () => {
    const { soundscape } = configuredSoundscape(14);
    await soundscape.unlock();
    constructedContexts[0].advance(0.1);
    soundscape.update(fieldFrame());

    const proof = soundscape.snapshot().field;
    expect(proof.hrtfPannerCount).toBe(FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit);
    expect(proof.heroCount).toBeLessThanOrEqual(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit
    );
    expect(proof.heroCount + proof.midCount + proof.bedCount).toBe(15);
    expect(proof.pendingHeroPromotions).toBe(0);

    const panners = constructedContexts[0].createdNodes.filter(
      (node): node is StubPannerNode => node instanceof StubPannerNode
    );
    expect(panners.filter((panner) => panner.panningModel === "HRTF")).toHaveLength(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.heroLimit
    );
    expect(
      panners.filter((panner) => panner.panningModel === "equalpower")
    ).toHaveLength(15);
    soundscape.dispose();
  });

  it("coalesces ticks faster than the audio update interval", async () => {
    const { soundscape } = configuredSoundscape(4);
    await soundscape.unlock();
    const context = constructedContexts[0];

    soundscape.update(fieldFrame());
    for (let tick = 0; tick < 5; tick += 1) {
      context.advance(0.005);
      soundscape.update(fieldFrame());
    }
    context.advance(0.2);
    soundscape.update(fieldFrame());

    const proof = soundscape.snapshot().field;
    expect(proof.updateTicks).toBe(2);
    expect(proof.coalescedTicks).toBe(5);
    soundscape.dispose();
  });

  it("publishes the per-source proof the runtime surface reads", async () => {
    const { soundscape } = configuredSoundscape(3);
    await soundscape.unlock();
    constructedContexts[0].advance(0.1);
    soundscape.update(fieldFrame({ crowdOccupancy: 26 }));

    const proof = soundscape.snapshot().field;
    expect(proof.configured).toBe(true);
    expect(proof.phase).toBe("night");
    expect(proof.sources).toHaveLength(4);
    for (const source of proof.sources) {
      expect(source.provenance.featureId).not.toBe("");
      expect(Number.isFinite(source.distanceMeters)).toBe(true);
      expect(source.lowpassHz).toBeGreaterThan(0);
      expect(["HRTF", "equalpower", "none"]).toContain(source.panningModel);
    }
    expect(proof.walla.occupancy).toBe(1);
    expect(proof.walla.onsetsPerSecond).toBeGreaterThan(0);
    expect(proof.walla.windowsScheduled).toBeGreaterThan(0);
    expect(proof.walla.grainsScheduled).toBeGreaterThan(0);
    expect(proof.bedFilterHz.woodland).toBe(
      FLOW_FEST_AUDIO_FIELD_CONTRACT.openLowpassHz
    );
    soundscape.dispose();
  });

  it("bumps the proof revision only on discrete change", async () => {
    const { soundscape } = configuredSoundscape(3);
    await soundscape.unlock();
    const context = constructedContexts[0];
    // Two ticks to settle: the first reports every source as a promotion, the
    // second retires that ledger. After that the composition is stable.
    context.advance(0.1);
    soundscape.update(fieldFrame());
    context.advance(0.06);
    soundscape.update(fieldFrame());

    const settled = soundscape.proofRevision();
    for (let tick = 0; tick < 5; tick += 1) {
      context.advance(0.06);
      soundscape.update(fieldFrame());
    }
    expect(soundscape.proofRevision()).toBe(settled);

    // Walking out of range changes the tier composition, which must be visible.
    context.advance(0.06);
    soundscape.update(
      fieldFrame({ listener: { x: 900, y: 1.7, z: 0, yawRadians: 0 } })
    );
    expect(soundscape.proofRevision()).toBeGreaterThan(settled);
    soundscape.dispose();
  });

  it("stops every source and disconnects every node on teardown", async () => {
    const { soundscape } = configuredSoundscape(6);
    await soundscape.unlock();
    const context = constructedContexts[0];
    context.advance(0.1);
    soundscape.update(fieldFrame());

    soundscape.dispose();

    const leaked = context.createdNodes.filter(
      (node) =>
        node !== context.destination &&
        !(node instanceof StubScheduledSourceNode) &&
        node.disconnectCount === 0
    );
    expect(leaked.map((node) => node.nodeType)).toEqual([]);
    expect(
      context.startedSources.filter((source) => !source.stopped)
    ).toHaveLength(0);
    expect(context.state).toBe("closed");
    expect(soundscape.snapshot()).toMatchObject({
      playing: false,
      unlocked: false,
      unlockState: "idle",
    });
  });
});

describe("Flow Fest soundscape unlock handling", () => {
  let originalAudioContext: unknown;

  beforeEach(() => {
    stubOptions = {};
    constructedContexts = [];
    originalAudioContext = (window as unknown as Record<string, unknown>)
      .AudioContext;
    (window as unknown as Record<string, unknown>).AudioContext =
      StubAudioContext;
  });

  afterEach(() => {
    (window as unknown as Record<string, unknown>).AudioContext =
      originalAudioContext;
  });

  it("keeps a rejected unlock re-armable instead of rejecting the caller", async () => {
    stubOptions = { resumeRejects: true };
    const soundscape = new FlowFestFireJamSoundscape();
    soundscape.configure({
      layout: LAYOUT,
      sources: [syntheticSource("camp", 20, 0)],
    });

    // The whole point: this resolves false. It never throws, so the caller can
    // hold the sim back rather than advancing past uninitialized audio.
    await expect(soundscape.unlock()).resolves.toBe(false);

    const refused = soundscape.snapshot();
    expect(refused.unlockState).toBe("awaiting-gesture");
    expect(refused.unlocked).toBe(false);
    expect(refused.playing).toBe(false);
    expect(refused.unlockAttemptCount).toBe(1);
    expect(refused.unlockFailureCount).toBe(1);
    expect(refused.lastUnlockError).toContain("user didn't interact");

    // Ticking while refused must stay safe and must not start audio.
    constructedContexts[0].advance(0.1);
    soundscape.update(fieldFrame());
    expect(soundscape.snapshot().playing).toBe(false);

    // The next real gesture arms the same graph rather than building a second.
    stubOptions = {};
    constructedContexts[0].options.resumeRejects = false;
    await expect(soundscape.unlock()).resolves.toBe(true);

    const armed = soundscape.snapshot();
    expect(armed.unlockState).toBe("running");
    expect(armed.unlocked).toBe(true);
    expect(armed.unlockAttemptCount).toBe(2);
    expect(armed.unlockFailureCount).toBe(1);
    expect(armed.lastUnlockError).toBeNull();
    expect(armed.graphBuildCount).toBe(1);
    expect(constructedContexts).toHaveLength(1);
    soundscape.dispose();
  });

  it("reports a context that stays suspended after resume as still awaiting a gesture", async () => {
    stubOptions = { staysSuspended: true };
    const soundscape = new FlowFestFireJamSoundscape();
    soundscape.configure({
      layout: LAYOUT,
      sources: [syntheticSource("camp", 20, 0)],
    });

    await expect(soundscape.unlock()).resolves.toBe(false);
    const snapshot = soundscape.snapshot();
    expect(snapshot.unlockState).toBe("awaiting-gesture");
    expect(snapshot.unlockFailureCount).toBe(1);
    expect(snapshot.lastUnlockError).toContain("suspended");
    soundscape.dispose();
  });

  it("reports unsupported when the platform has no Web Audio at all", async () => {
    (window as unknown as Record<string, unknown>).AudioContext = undefined;
    const soundscape = new FlowFestFireJamSoundscape();
    await expect(soundscape.unlock()).resolves.toBe(false);
    expect(soundscape.snapshot()).toMatchObject({
      supported: false,
      unlockState: "unsupported",
      unlockAttemptCount: 0,
    });
    soundscape.dispose();
  });

  it("tolerates configure and update before any gesture", () => {
    const soundscape = new FlowFestFireJamSoundscape();
    soundscape.configure({
      layout: LAYOUT,
      sources: [syntheticSource("camp", 20, 0)],
    });
    expect(() => soundscape.update(fieldFrame())).not.toThrow();
    const snapshot = soundscape.snapshot();
    expect(snapshot.playing).toBe(false);
    expect(snapshot.field.configured).toBe(true);
    expect(snapshot.field.hrtfPannerCount).toBe(0);
    expect(snapshot.spatializedSources).toBe(0);
    soundscape.dispose();
  });
});
