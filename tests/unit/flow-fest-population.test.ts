import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFlowFestRuntimeContract } from "../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";
import { createFlowFestCampPlan } from "../../src/routes/test/flow-fest-sim/flow-fest-camp-plan";
import {
  createFlowFestPopulationSite,
  flowFestHomeAnchorIds,
} from "../../src/routes/test/flow-fest-sim/flow-fest-population-site";
import {
  createFlowFestPlaceholderPool,
  flowFestPerformerSequenceProof,
  flowFestSequenceForPerformer,
  generateFlowFestPerformerPool,
  FLOW_FEST_PERFORMER_PROFILES,
} from "../../src/routes/test/flow-fest-sim/flow-fest-performer-sequences";
import {
  FLOW_FEST_DAY_PHASE_ORDER,
  FLOW_FEST_DAY_PHASE_WINDOWS,
  FLOW_FEST_PHASE_WARM_START_SECONDS,
  FlowFestPopulationSimulation,
  composeFlowFestFireJamLayout,
  createFlowFestPopulation,
  flowFestDayPhaseForMoment,
  flowFestFireJamAttendance,
  flowFestPopulationRenderBudget,
  flowFestSimClock,
  resolveFlowFestScheduleBlock,
  type FlowFestDayPhase,
  type FlowFestPopulationSite,
} from "#lib/features/flow-fest-sim/domain/flow-fest-population.js";
import {
  isFlowFestCorridorCovered,
  routeFlowFestCorridor,
  flowFestCorridorAnchorNode,
  flowFestCorridorPathLength,
} from "#lib/features/flow-fest-sim/domain/flow-fest-corridor-graph.js";
import {
  auditFlowFestLivingCommunity,
  sampleFlowFestLivingCommunity,
  type FlowFestFestivalCommunityLayout,
  type FlowFestFestivalPersonPlacement,
} from "#lib/features/flow-fest-sim/domain/flow-fest-living-fire-jam.js";
import { isEffectPreviewLoop } from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
import {
  GHGH,
  makeLoop,
} from "#lib/shared/combination/domain/demo-fixtures.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { FlowFestMoment } from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";

const contract = parseFlowFestRuntimeContract(
  JSON.parse(
    readFileSync(
      "static/data/flow-fest-sim/gate2-runtime-contract.json",
      "utf8"
    )
  )
);
const plan = createFlowFestCampPlan(contract, "lower-tent");

// The derived fire and LED centres, taken from the production geometry rather
// than re-authored here: night-heart centre offset by (-11, +1.5) and
// (+20, +12).
const nightHeart = contract.zones.find(
  (zone) => zone.id === "night-heart-zone"
)!;
const FIRE_CENTER = {
  x: nightHeart.center.x - 11,
  z: nightHeart.center.z + 1.5,
};
const LED_CIRCLE_CENTER = {
  x: nightHeart.center.x + 20,
  z: nightHeart.center.z + 12,
};

function buildSite(): FlowFestPopulationSite {
  return createFlowFestPopulationSite({
    contract,
    plan,
    branch: "lower-tent",
    fireCenter: FIRE_CENTER,
    ledCircleCenter: LED_CIRCLE_CENTER,
    groundY: () => 0,
  }).site;
}

const MOMENT_BY_PHASE: Record<FlowFestDayPhase, FlowFestMoment> = {
  "thursday-afternoon": "afternoon",
  "dusk-migration": "golden-hour",
  "night-festival": "night",
  "late-drift-home": "dawn",
};

describe("Flow Fest sim clock", () => {
  it("keeps the population phase and the visual moment in agreement", () => {
    for (const phase of FLOW_FEST_DAY_PHASE_ORDER) {
      const moment = MOMENT_BY_PHASE[phase];
      expect(flowFestDayPhaseForMoment(moment)).toBe(phase);
      const window = FLOW_FEST_DAY_PHASE_WINDOWS[phase];
      const start = flowFestSimClock(moment, 0);
      expect(start.dayPhase).toBe(phase);
      expect(start.minuteOfDay).toBeCloseTo(window.startMinute, 3);
      const late = flowFestSimClock(moment, 100000);
      expect(late.dayPhase).toBe(phase);
      expect(late.minuteOfDay).toBeLessThan(window.endMinute);
      expect(late.minuteOfDay).toBeGreaterThanOrEqual(window.startMinute);
      expect(late.phaseProgress).toBeLessThanOrEqual(1);
    }
  });

  it("advances monotonically inside a phase", () => {
    const first = flowFestSimClock("afternoon", 10);
    const second = flowFestSimClock("afternoon", 40);
    expect(second.minuteOfDay).toBeGreaterThan(first.minuteOfDay);
    expect(second.phaseProgress).toBeGreaterThan(first.phaseProgress);
  });
});

describe("Flow Fest population schedules", () => {
  const site = buildSite();
  const npcs = createFlowFestPopulation(site, {
    count: 38,
    homeAnchorIds: flowFestHomeAnchorIds(site),
  });

  it("is deterministic for a given site seed", () => {
    const repeat = createFlowFestPopulation(site, {
      count: 38,
      homeAnchorIds: flowFestHomeAnchorIds(site),
    });
    expect(repeat.map((npc) => npc.id)).toEqual(npcs.map((npc) => npc.id));
    expect(repeat.map((npc) => npc.role)).toEqual(npcs.map((npc) => npc.role));
    expect(repeat.map((npc) => npc.homeAnchorId)).toEqual(
      npcs.map((npc) => npc.homeAnchorId)
    );
    expect(JSON.stringify(repeat.map((npc) => npc.schedule))).toBe(
      JSON.stringify(npcs.map((npc) => npc.schedule))
    );
  });

  it("gives every person a plan in every phase", () => {
    for (const npc of npcs) {
      for (const phase of FLOW_FEST_DAY_PHASE_ORDER) {
        const window = FLOW_FEST_DAY_PHASE_WINDOWS[phase];
        const blocks = npc.schedule.filter(
          (block) =>
            block.startMinute >= window.startMinute &&
            block.startMinute < window.endMinute
        );
        expect(blocks.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves the same block for the same clock time, every time", () => {
    const npc = npcs.find((candidate) => candidate.role === "traveler")!;
    for (const minute of [800, 1000, 1180, 1300, 1600]) {
      const first = resolveFlowFestScheduleBlock(npc.schedule, minute);
      const second = resolveFlowFestScheduleBlock(npc.schedule, minute);
      expect(second).toEqual(first);
      if (first.startMinute > minute) {
        // Before their first block the day has not started for this person, so
        // their opening plan stands. That is the only block allowed to be in
        // force ahead of its own start minute.
        expect(first).toBe(npc.schedule[0]);
      } else {
        expect(first.startMinute).toBeLessThanOrEqual(minute);
      }
    }
  });

  it("staggers migrations instead of moving everyone on one minute", () => {
    const duskStarts = npcs
      .filter((npc) => npc.role !== "gate-greeter")
      .map(
        (npc) =>
          resolveFlowFestScheduleBlock(
            npc.schedule,
            FLOW_FEST_DAY_PHASE_WINDOWS["dusk-migration"].startMinute + 60
          ).startMinute
      );
    expect(new Set(duskStarts).size).toBeGreaterThan(4);
  });

  it("sends the festival crowd to the fire circle at night and home after", () => {
    const nightMinute =
      FLOW_FEST_DAY_PHASE_WINDOWS["night-festival"].startMinute + 200;
    const lateMinute =
      FLOW_FEST_DAY_PHASE_WINDOWS["late-drift-home"].startMinute + 200;
    const walkers = npcs.filter((npc) => npc.role !== "gate-greeter");
    const atFire = walkers.filter((npc) => {
      const block = resolveFlowFestScheduleBlock(npc.schedule, nightMinute);
      return block.anchorId === site.fireAnchorId;
    });
    expect(atFire.length).toBeGreaterThan(walkers.length / 2);

    for (const npc of walkers) {
      const block = resolveFlowFestScheduleBlock(npc.schedule, lateMinute);
      expect(block.anchorId).toBe(npc.homeAnchorId);
      expect(block.activity).toBe("rest");
    }
  });

  it("keeps the gate crew at the gate, which no registered leg reaches", () => {
    const gateCrew = npcs.filter((npc) => npc.role === "gate-greeter");
    expect(gateCrew.length).toBe(3);
    const gateAnchor = site.anchors.find(
      (anchor) => anchor.id === gateCrew[0]!.homeAnchorId
    )!;
    expect(gateAnchor.kind).toBe("gate");
    expect(gateAnchor.routable).toBe(false);
    for (const npc of gateCrew) {
      for (const block of npc.schedule) {
        expect(block.anchorId).toBe(gateAnchor.id);
      }
    }
  });
});

describe("Flow Fest corridor routing", () => {
  const site = buildSite();

  it("builds a connected graph from registered legs and zone envelopes", () => {
    expect(site.graph.legs.length).toBeGreaterThan(10);
    expect(site.graph.clearings.length).toBe(contract.zones.length);
    expect(site.graph.edges.length).toBeGreaterThan(site.graph.nodes.length);

    // The registered legs carry 164 vertices but only 37 distinct positions at
    // the 0.5 m merge tolerance: every night-return leg retraces its arrival
    // leg, and the camp plan's foot connectors retrace contract legs. Merging
    // them is the point — one trail walked both ways is one trail. Assert the
    // merge is real without pinning a magic count.
    const legVertexCount = site.graph.legs.reduce(
      (total, leg) => total + leg.points.length,
      0
    );
    expect(legVertexCount).toBeGreaterThan(site.graph.nodes.length);
    expect(site.graph.nodes.length).toBeGreaterThanOrEqual(
      site.graph.legs.length * 2
    );
    // No leg collapsed into a single node, which would erase a whole walk.
    for (const leg of site.graph.legs) {
      const legNodes = site.graph.nodes.filter((node) =>
        node.legIds.includes(leg.id)
      );
      expect(legNodes.length, `leg ${leg.id} collapsed`).toBeGreaterThanOrEqual(
        2
      );
    }
    // Every leg id is namespaced, because the contract repeats ids across
    // branches with different geometry.
    expect(new Set(site.graph.legs.map((leg) => leg.id)).size).toBe(
      site.graph.legs.length
    );
  });

  it("marks the lower gate unroutable and everything else reachable", () => {
    const unroutable = site.anchors.filter((anchor) => !anchor.routable);
    expect(unroutable.map((anchor) => anchor.kind)).toEqual(["gate"]);
  });

  it("routes camps to the fire circle entirely inside registered coverage", () => {
    const fireNode = flowFestCorridorAnchorNode(site.graph, site.fireAnchorId);
    const camps = site.anchors.filter((anchor) => anchor.kind === "camp");
    expect(camps.length).toBeGreaterThan(0);

    for (const camp of camps) {
      const route = routeFlowFestCorridor(site.graph, camp.x, camp.z, fireNode);
      expect(route, `no route from ${camp.id}`).not.toBeNull();
      const steps = route!;
      expect(flowFestCorridorPathLength(steps)).toBeGreaterThan(1);
      const last = steps[steps.length - 1]!;
      expect(
        Math.hypot(last.x - FIRE_CENTER.x, last.z - FIRE_CENTER.z)
      ).toBeLessThan(0.6);

      for (let index = 1; index < steps.length; index += 1) {
        const from = steps[index - 1]!;
        const to = steps[index]!;
        const span = Math.hypot(to.x - from.x, to.z - from.z);
        const samples = Math.max(2, Math.ceil(span / 0.5));
        for (let sample = 0; sample <= samples; sample += 1) {
          const t = sample / samples;
          const x = from.x + (to.x - from.x) * t;
          const z = from.z + (to.z - from.z) * t;
          expect(
            isFlowFestCorridorCovered(site.graph, x, z),
            `${camp.id} leaves registered coverage at ${x.toFixed(2)}, ${z.toFixed(2)}`
          ).toBe(true);
        }
      }
    }
  });

  it("returns null instead of inventing a path to the unreachable gate", () => {
    const gate = site.anchors.find((anchor) => anchor.kind === "gate")!;
    const gateNode = flowFestCorridorAnchorNode(site.graph, gate.id);
    const camp = site.anchors.find((anchor) => anchor.kind === "camp")!;
    expect(
      routeFlowFestCorridor(site.graph, camp.x, camp.z, gateNode)
    ).toBeNull();
  });

  it("never lets a simulated journey leave the corridor network", () => {
    const npcs = createFlowFestPopulation(site, {
      count: 38,
      homeAnchorIds: flowFestHomeAnchorIds(site),
    });
    const simulation = new FlowFestPopulationSimulation(site, npcs);
    let escapes = 0;
    let worst = "";

    for (const phase of FLOW_FEST_DAY_PHASE_ORDER) {
      const moment = MOMENT_BY_PHASE[phase];
      for (let step = 0; step < 900; step += 1) {
        const clock = flowFestSimClock(moment, step * 0.25);
        const frame = simulation.advance(clock, 0.25);
        if (step % 25 !== 0) continue;
        for (const agent of frame.agents) {
          if (isFlowFestCorridorCovered(site.graph, agent.x, agent.z, 0.05))
            continue;
          escapes += 1;
          worst = `${agent.id} at ${agent.x.toFixed(2)}, ${agent.z.toFixed(2)} during ${phase}`;
        }
      }
    }

    expect(escapes, worst).toBe(0);
  });

  it("reproduces the same world from the same tick sequence", () => {
    const npcs = createFlowFestPopulation(site, {
      count: 24,
      homeAnchorIds: flowFestHomeAnchorIds(site),
    });
    const run = (): string => {
      const simulation = new FlowFestPopulationSimulation(site, npcs);
      let last = "";
      for (let step = 0; step < 400; step += 1) {
        const clock = flowFestSimClock("golden-hour", step * 0.25);
        const frame = simulation.advance(clock, 0.25);
        last = frame.agents
          .map(
            (agent) =>
              `${agent.id}:${agent.x.toFixed(4)}:${agent.z.toFixed(4)}:${agent.activity}`
          )
          .join("|");
      }
      return last;
    };
    expect(run()).toBe(run());
  });

  it("walks people to the fire and hands them to the circle on arrival", () => {
    const npcs = createFlowFestPopulation(site, {
      count: 38,
      homeAnchorIds: flowFestHomeAnchorIds(site),
    });
    const simulation = new FlowFestPopulationSimulation(site, npcs);
    simulation.warmStart("night", 0, 300);
    const frame = simulation.advance(flowFestSimClock("night", 300), 0.25);
    const attendance = flowFestFireJamAttendance(frame);

    expect(frame.fireJamAttendeeCount).toBeGreaterThan(6);
    expect(attendance.performers).toBeGreaterThan(0);
    expect(attendance.spectators + attendance.performers).toBe(
      frame.fireJamAttendeeCount
    );
    // Fire-circle attendees are absorbed by the sampler, so the walking layer
    // must not also be rendering them.
    for (const agent of frame.agents) {
      if (!agent.atFireJam) continue;
      expect(
        agent.activity === "watch-fire" || agent.activity === "join-fire"
      ).toBe(true);
    }
  });

  it("gives the night a smaller walking budget than the afternoon", () => {
    const afternoon = flowFestPopulationRenderBudget("thursday-afternoon");
    const night = flowFestPopulationRenderBudget("night-festival");
    expect(night.maxVisible).toBeLessThan(afternoon.maxVisible);
    expect(night.cullMeters).toBeLessThanOrEqual(afternoon.cullMeters);
  });
});

function placement(
  overrides: Partial<FlowFestFestivalPersonPlacement> &
    Pick<FlowFestFestivalPersonPlacement, "id" | "role" | "behavior">
): FlowFestFestivalPersonPlacement {
  return {
    avatarId: "ch01",
    x: 0,
    y: 0,
    z: 0,
    facingAngle: 0,
    phaseOffset: 0,
    ...overrides,
  };
}

function authoredLayout(): FlowFestFestivalCommunityLayout {
  const people: FlowFestFestivalPersonPlacement[] = [];
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    people.push(
      placement({
        id: `spectator-${index}`,
        role: "spectator",
        behavior: index % 5 === 0 ? "perimeter-walk" : "watch-fire",
        x: FIRE_CENTER.x + Math.cos(angle) * 9,
        z: FIRE_CENTER.z + Math.sin(angle) * 9,
      })
    );
  }
  for (let index = 0; index < 5; index += 1) {
    people.push(
      placement({
        id: `fire-${index}`,
        role: index % 2 === 0 ? "fire-poi" : "fire-hoop",
        behavior: "fire-rotation",
        rotationOrdinal: index,
        x: FIRE_CENTER.x,
        z: FIRE_CENTER.z + 9.75,
        queueTarget: { x: FIRE_CENTER.x, y: 0, z: FIRE_CENTER.z + 9.75 },
        performanceTarget: { x: FIRE_CENTER.x, y: 0, z: FIRE_CENTER.z + 4.65 },
      })
    );
  }
  for (let index = 0; index < 3; index += 1) {
    people.push(
      placement({
        id: `led-${index}`,
        role: "led-flow",
        behavior: "led-session",
        x: LED_CIRCLE_CENTER.x + index,
        z: LED_CIRCLE_CENTER.z,
      })
    );
  }
  for (let index = 0; index < 2; index += 1) {
    people.push(
      placement({
        id: `juggler-${index}`,
        role: "juggler",
        behavior: "field-practice",
        x: FIRE_CENTER.x + 12 + index,
        z: FIRE_CENTER.z - 12,
      })
    );
  }
  return {
    fireCenter: { x: FIRE_CENTER.x, y: 0, z: FIRE_CENTER.z },
    ledCircleCenter: { x: LED_CIRCLE_CENTER.x, y: 0, z: LED_CIRCLE_CENTER.z },
    people,
    spectatorCount: 16,
    performerCount: 10,
    firePerformerCount: 5,
    activeFirePerformerCount: 3,
    ingressBearingRadians: Math.PI,
    ingressHalfWidthRadians: 0.5,
  };
}

describe("Flow Fest fire-jam composition", () => {
  const base = authoredLayout();

  it("hands the circle exactly the attendance the population delivered", () => {
    const composed = composeFlowFestFireJamLayout(base, {
      spectators: 11,
      performers: 4,
    });
    expect(composed.spectatorCount).toBe(11);
    expect(composed.firePerformerCount).toBe(4);
    expect(
      composed.people.filter((person) => person.role === "spectator").length
    ).toBe(11);
    expect(
      composed.people.filter((person) => person.behavior === "fire-rotation")
        .length
    ).toBe(4);
    expect(composed.activeFirePerformerCount).toBeLessThan(
      composed.firePerformerCount
    );
    expect(base.people.length).toBe(26);
  });

  it("keeps the rotation ordinals contiguous so the sampler audit holds", () => {
    for (const performers of [2, 3, 4, 5]) {
      const composed = composeFlowFestFireJamLayout(base, {
        spectators: 8,
        performers,
      });
      const audit = auditFlowFestLivingCommunity(composed, 4.65);
      expect(audit.fireRotationComplete, `performers=${performers}`).toBe(true);
      const ordinals = composed.people
        .filter((person) => person.behavior === "fire-rotation")
        .map((person) => person.rotationOrdinal)
        .sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(ordinals).toEqual(
        Array.from({ length: performers }, (_, index) => index)
      );
    }
  });

  it("closes the circle rather than staging one lone dancer", () => {
    const composed = composeFlowFestFireJamLayout(base, {
      spectators: 4,
      performers: 1,
    });
    expect(composed.firePerformerCount).toBe(0);
    expect(composed.performerCount).toBe(0);
    expect(composed.activeFirePerformerCount).toBe(0);
    expect(composed.spectatorCount).toBe(4);
  });

  it("still samples cleanly through the existing living-community sampler", () => {
    const composed = composeFlowFestFireJamLayout(base, {
      spectators: 9,
      performers: 3,
    });
    const frame = sampleFlowFestLivingCommunity(composed, 12, 0.5);
    expect(frame.people.length).toBe(composed.people.length);
    for (const person of frame.people) {
      expect(Number.isFinite(person.x)).toBe(true);
      expect(Number.isFinite(person.z)).toBe(true);
      expect(Number.isFinite(person.facingAngle)).toBe(true);
    }
    expect(frame.activeFirePerformerIds.length).toBeLessThanOrEqual(
      composed.activeFirePerformerCount
    );
  });

  it("never mutates the authored layout it composes from", () => {
    const snapshot = JSON.stringify(base);
    composeFlowFestFireJamLayout(base, { spectators: 3, performers: 2 });
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

/**
 * A candidate LOOP of a requested length, built by repeating GHGH — Austen's
 * transcribed 4-step fusion card, which the fixture suite already proves closes
 * positionally and is an orientation fixpoint. Repeating a closed, fixpoint card
 * keeps both properties, so length is the only variable this helper changes.
 * Hand-rolling a fake sequence here would only test the gate against a shape the
 * generator never produces.
 */
function loopOfLength(steps: number): SequenceData {
  const repeats = steps / GHGH.steps.length;
  if (!Number.isInteger(repeats) || repeats < 1) {
    throw new Error(`loopOfLength needs a multiple of ${GHGH.steps.length}`);
  }
  const repeated = Array.from({ length: repeats }, () => GHGH.steps).flat();
  return makeLoop(`fx-flow-fest-${steps}`, "GHGH".repeat(repeats), repeated);
}

describe("Flow Fest performer LOOP fixture", () => {
  it("repeats a closed card into a valid preview LOOP", () => {
    expect(GHGH.steps.length).toBe(4);
    expect(isEffectPreviewLoop(GHGH)).toBe(false); // four counts is under the floor
    for (const length of [8, 16, 24]) {
      const loop = loopOfLength(length);
      expect(loop.steps.length).toBe(length);
      expect(isEffectPreviewLoop(loop)).toBe(true);
    }
    expect(isEffectPreviewLoop(loopOfLength(4))).toBe(false);
  });
});

describe("Flow Fest performer sequences", () => {
  it("boots on placeholders and says they are placeholders", () => {
    const pool = createFlowFestPlaceholderPool();
    const proof = flowFestPerformerSequenceProof(pool);
    expect(pool.loops.length).toBeGreaterThan(0);
    expect(pool.sources.every((source) => source === "placeholder")).toBe(true);
    expect(proof.generatedCount).toBe(0);
    expect(proof.notes.join(" ")).toContain("placeholder");
  });

  it("accepts only LOOPs that pass the effect preview contract", async () => {
    const pool = await generateFlowFestPerformerPool({
      count: 4,
      generate: async () => loopOfLength(16),
    });
    expect(pool.loops.length).toBe(4);
    expect(pool.generatedCount).toBe(4);
    expect(pool.sources.every((source) => source === "generated")).toBe(true);
    for (const sequence of pool.loops) {
      expect(isEffectPreviewLoop(sequence)).toBe(true);
      expect(sequence.steps.length).toBeGreaterThanOrEqual(8);
      expect(sequence.steps.length % 8).toBe(0);
    }
    expect(flowFestPerformerSequenceProof(pool).allPassPreviewLoop).toBe(true);
  });

  it("rejects a short LOOP and keeps the placeholders, honestly", async () => {
    const pool = await generateFlowFestPerformerPool({
      count: 2,
      attemptsPerLoop: 2,
      generate: async () => loopOfLength(4),
    });
    expect(pool.generatedCount).toBe(0);
    expect(pool.rejectedCount).toBe(4);
    expect(pool.sources.every((source) => source === "placeholder")).toBe(true);
    expect(pool.notes.join(" ")).toContain("still spinning placeholders");
  });

  it("survives a generator that throws", async () => {
    const pool = await generateFlowFestPerformerPool({
      count: 1,
      attemptsPerLoop: 1,
      generate: async () => {
        throw new Error("orchestrator unavailable");
      },
    });
    expect(pool.generatedCount).toBe(0);
    expect(pool.notes.join(" ")).toContain("orchestrator unavailable");
  });

  it("assigns a stable LOOP per performer, spread across the pool", async () => {
    const pool = await generateFlowFestPerformerPool({
      count: 4,
      generate: (() => {
        let index = 0;
        return async () => loopOfLength(8 + (index++ % 3) * 8);
      })(),
    });
    const ids = Array.from({ length: 12 }, (_, index) => `fire-${index}`);
    const assigned = ids.map((id) => flowFestSequenceForPerformer(pool, id));
    expect(assigned.map((sequence) => sequence.steps.length)).toEqual(
      ids.map((id) => flowFestSequenceForPerformer(pool, id).steps.length)
    );
    expect(new Set(assigned).size).toBeGreaterThan(1);
  });

  it("keeps a prop and effect profile for every performer role", () => {
    for (const role of [
      "fire-poi",
      "fire-hoop",
      "juggler",
      "led-flow",
    ] as const) {
      const profile = FLOW_FEST_PERFORMER_PROFILES[role];
      expect(profile.propType).toBeTruthy();
      expect(["fire", "led"]).toContain(profile.effectId);
    }
  });
});

describe("Flow Fest crowd behaviour", () => {
  // Thresholds come from a 240 s, 60 Hz headless run of every moment on this
  // site (38 people), measured after the crowd rewrite. This test runs 90 s per
  // moment; the ceilings below are what the 240 s run showed with room for the
  // seeded draws to land differently on a shorter window.
  //
  //   moment      pairs<0.4 m  pairs<0.6 m  max step  longest <0.4 m run
  //   afternoon   0.00/frame   0.05/frame   0.022 m   0.0 s
  //   golden-hour 0.01/frame   0.07/frame   0.026 m   0.7 s
  //   night       0.00/frame   0.02/frame   0.026 m   0.2 s
  //   dawn        0.02/frame   0.14/frame   0.028 m   0.7 s
  //
  // Standing pairs under 0.3 m, single-frame jumps over 0.12 m, slow-walk
  // circling and stalls between walks all measured zero. Before the rewrite
  // the same run showed 12 to 36 pairs under 0.4 m every frame, 78 to 493
  // jumps a second and open-field walkers turning ten circles.
  const site = buildSite();
  const FRAME_SECONDS = 1 / 60;
  const RUN_SECONDS = 90;

  interface CrowdMeasure {
    frames: number;
    pairsUnder04: number;
    pairsUnder06: number;
    standingPairsUnder03: number;
    maxStep: number;
    longestCloseRunFrames: number;
    maxSlowTurnRadians: number;
    shortStops: number;
    movingFractionWhileSettled: number;
  }

  function measureCrowd(moment: FlowFestMoment): CrowdMeasure {
    const npcs = createFlowFestPopulation(site, {
      count: 38,
      homeAnchorIds: flowFestHomeAnchorIds(site),
    });
    const simulation = new FlowFestPopulationSimulation(site, npcs);
    const phase = flowFestDayPhaseForMoment(moment);
    const warm = FLOW_FEST_PHASE_WARM_START_SECONDS[phase];
    if (warm > 0) simulation.warmStart(moment, 0, warm);

    const measure: CrowdMeasure = {
      frames: 0,
      pairsUnder04: 0,
      pairsUnder06: 0,
      standingPairsUnder03: 0,
      maxStep: 0,
      longestCloseRunFrames: 0,
      maxSlowTurnRadians: 0,
      shortStops: 0,
      movingFractionWhileSettled: 0,
    };
    const closeRuns = new Map<string, number>();
    const last = npcs.map(() => ({
      x: Number.NaN,
      z: Number.NaN,
      facing: Number.NaN,
      slowTurn: 0,
      stopFrames: 0,
      stopInterrupted: false,
      stopAnchor: "",
      everMoved: false,
      settledFrames: 0,
      settledMovingFrames: 0,
      arrivedAnchor: "",
    }));
    const measuredOpen = new Set(
      site.anchors
        .filter(
          (anchor) =>
            site.graph.clearings[anchor.clearingIndex]?.wanderPolicy ===
            "measured-open"
        )
        .map((anchor) => anchor.id)
    );

    const steps = Math.round(RUN_SECONDS / FRAME_SECONDS);
    let elapsed = warm;
    for (let step = 0; step < steps; step += 1) {
      elapsed += FRAME_SECONDS;
      const frame = simulation.advance(
        flowFestSimClock(moment, elapsed),
        FRAME_SECONDS
      );
      measure.frames += 1;
      const walkers = frame.agents.filter((agent) => !agent.atFireJam);
      for (let i = 0; i < walkers.length; i += 1) {
        for (let j = i + 1; j < walkers.length; j += 1) {
          const a = walkers[i]!;
          const b = walkers[j]!;
          const distance = Math.hypot(a.x - b.x, a.z - b.z);
          if (distance < 0.4) measure.pairsUnder04 += 1;
          if (distance < 0.6) measure.pairsUnder06 += 1;
          if (distance < 0.3 && !a.isMoving && !b.isMoving)
            measure.standingPairsUnder03 += 1;
          const key = `${a.id}|${b.id}`;
          const run = closeRuns.get(key) ?? 0;
          if (distance < 0.4) {
            closeRuns.set(key, run + 1);
            measure.longestCloseRunFrames = Math.max(
              measure.longestCloseRunFrames,
              run + 1
            );
          } else if (run > 0) {
            closeRuns.set(key, 0);
          }
        }
      }
      frame.agents.forEach((agent, index) => {
        const memo = last[index]!;
        if (!Number.isNaN(memo.x) && !agent.atFireJam) {
          measure.maxStep = Math.max(
            measure.maxStep,
            Math.hypot(agent.x - memo.x, agent.z - memo.z)
          );
          if (agent.isMoving && agent.speedMetersPerSecond < 0.5) {
            const turn = Math.atan2(
              Math.sin(agent.facingAngle - memo.facing),
              Math.cos(agent.facingAngle - memo.facing)
            );
            memo.slowTurn += turn;
            measure.maxSlowTurnRadians = Math.max(
              measure.maxSlowTurnRadians,
              Math.abs(memo.slowTurn)
            );
          } else {
            memo.slowTurn = 0;
          }
        }
        memo.x = agent.x;
        memo.z = agent.z;
        memo.facing = agent.facingAngle;
        if (agent.isMoving) {
          if (
            memo.everMoved &&
            memo.stopFrames >= 2 &&
            memo.stopFrames < 15 * 60 &&
            !memo.stopInterrupted &&
            memo.stopAnchor === agent.anchorId
          ) {
            measure.shortStops += 1;
          }
          memo.stopFrames = 0;
          memo.stopInterrupted = false;
          memo.everMoved = true;
        } else {
          if (memo.stopFrames === 0) memo.stopAnchor = agent.anchorId;
          memo.stopFrames += 1;
          if (agent.interrupted) memo.stopInterrupted = true;
        }
        // People who have reached a measured-open clearing stroll now and
        // then; the rest of the time they stand. Count from the first frame
        // they stand there until their plan sends them somewhere else.
        if (memo.arrivedAnchor !== agent.anchorId) memo.arrivedAnchor = "";
        if (
          memo.arrivedAnchor === "" &&
          !agent.atFireJam &&
          !agent.isMoving &&
          measuredOpen.has(agent.anchorId)
        ) {
          memo.arrivedAnchor = agent.anchorId;
        }
        if (memo.arrivedAnchor !== "" && !agent.atFireJam) {
          memo.settledFrames += 1;
          if (agent.isMoving) memo.settledMovingFrames += 1;
        }
      });
    }
    const settledFrames = last.reduce(
      (sum, memo) => sum + memo.settledFrames,
      0
    );
    const settledMoving = last.reduce(
      (sum, memo) => sum + memo.settledMovingFrames,
      0
    );
    measure.movingFractionWhileSettled =
      settledFrames > 0 ? settledMoving / settledFrames : 0;
    return measure;
  }

  for (const phase of FLOW_FEST_DAY_PHASE_ORDER) {
    const moment = MOMENT_BY_PHASE[phase];
    it(`keeps the ${phase} crowd apart, steady and unhurried`, () => {
      const measure = measureCrowd(moment);
      const frames = measure.frames;
      expect(frames).toBe(RUN_SECONDS * 60);

      // Clipping: brushing past on a 0.8 m trail happens; standing inside
      // someone or walking through them does not.
      expect(measure.pairsUnder04 / frames).toBeLessThan(0.25);
      expect(measure.pairsUnder06 / frames).toBeLessThan(0.6);
      expect(measure.standingPairsUnder03).toBe(0);
      expect(measure.longestCloseRunFrames / 60).toBeLessThan(2);

      // Teleporting: the fastest walker covers 0.025 m a frame and the
      // separation lean adds at most 0.0075 m. Anything over 0.05 m is a jump.
      expect(measure.maxStep).toBeLessThan(0.05);

      // Circling: the old open-field orbit turned ten full circles at a
      // creep. A slow stretch may hold a U-turn (from the anchor node onto
      // the spot beside it) but never a full circle.
      expect(measure.maxSlowTurnRadians).toBeLessThan(1.5 * Math.PI);

      // Stalls: a walk never pauses for under 15 s unless somebody stopped
      // them to chat or the schedule sent them somewhere new.
      expect(measure.shortStops).toBeLessThanOrEqual(1);

      // Congregating: people at a gathering stand far more than they stroll.
      expect(measure.movingFractionWhileSettled).toBeLessThan(0.35);
    });
  }
});
