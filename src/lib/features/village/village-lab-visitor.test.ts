/**
 * The lab's "Teach nearest idle" (village-lab-visitor.ts) picks someone the
 * sim will accept, stands the visitor in front of them, and the lesson ends
 * with the learner knowing the pocket's sequence; the panel's button starts
 * it through the village state. Leave and come back keeps the village
 * state's log, and a return reports what became of the sequence.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "./domain/village-rules";
import { planCampLayout } from "./domain/village-campfire";
import { VillageOrchestrator } from "./engine/village-orchestrator";
import { createVillageState } from "./state/village-state.svelte";
import expected from "./engine/__fixtures__/village-memory-expected.json";
import {
  LAB_FIXTURES,
  LAB_SEED,
  LAB_VISITOR_STAND_OFF,
  labVisitorLesson,
  labVillageOptions,
  memoryFacts,
  memoryStoryLine,
  nearestIdleLearner,
  readLabLog,
  teachNearestIdle,
} from "./village-lab-visitor";

const RULES = loadVillageRules();
const OOGA = RULES.visitor.sequences[0]!.sequenceId;

function createSim(): VillageOrchestrator {
  const sim = new VillageOrchestrator({
    rules: RULES,
    seed: "village-lab-1",
    avatarModels: ["x-bot", "y-bot", "remy"],
  });
  for (let i = 0; i < 40; i++) sim.tick();
  return sim;
}

describe("the lab's visitor", () => {
  it("picks a free villager who lacks the sequence, nearest the audience spot", () => {
    const sim = createSim();
    const learner = nearestIdleLearner(sim.snapshot, RULES, OOGA)!;
    expect(learner).not.toBeNull();
    expect(["passing", "retiring", "seated"]).not.toContain(learner.state);
    expect(learner.lessonRole).toBeNull();
    expect(learner.knownSequenceIds).not.toContain(OOGA);
    const { audience } = planCampLayout(RULES);
    const distance = (a: { x: number; z: number }) =>
      Math.hypot(a.x - audience.x, a.z - audience.z);
    for (const other of sim.snapshot.avatars) {
      const free =
        !["passing", "retiring", "seated"].includes(other.state) &&
        other.lessonRole === null;
      if (free && !other.knownSequenceIds.includes(OOGA))
        expect(distance(other)).toBeGreaterThanOrEqual(distance(learner));
    }
  });

  it("stands the visitor in front of the learner, facing them, and the lesson takes", () => {
    const sim = createSim();
    const learner = nearestIdleLearner(sim.snapshot, RULES, OOGA)!;
    const request = labVisitorLesson(learner, RULES, OOGA);
    expect(
      Math.hypot(request.x - learner.x, request.z - learner.z)
    ).toBeCloseTo(LAB_VISITOR_STAND_OFF, 6);
    const toLearner = Math.atan2(learner.z - request.z, learner.x - request.x);
    expect(Math.cos(request.facing - toLearner)).toBeCloseTo(1, 6);

    expect(sim.teachFromVisitor(request)).toBe(true);
    let snapshot = sim.tick();
    for (let i = 0; i < 600 && snapshot.world.visitor; i++)
      snapshot = sim.tick();
    const after = snapshot.avatars.find((a) => a.id === learner.id)!;
    expect(after.knownSequenceIds).toContain(OOGA);
  });

  it("finds nobody once everyone idle already knows it", () => {
    const sim = createSim();
    const knowing = {
      ...sim.snapshot,
      avatars: sim.snapshot.avatars.map((a) => ({
        ...a,
        knownSequenceIds: [...a.knownSequenceIds, OOGA],
      })),
    };
    expect(nearestIdleLearner(knowing, RULES, OOGA)).toBeNull();
  });
});

describe("the lab's Teach nearest idle button", () => {
  it("starts the visitor's lesson through the village state", () => {
    const village = createVillageState({
      rules: RULES,
      seed: "village-lab-1",
      // The opening holds the clock until its motion is built, which a test never does.
      opening: false,
    });
    const result = teachNearestIdle(village, OOGA);
    expect(result.started).toBe(true);
    village.start();
    village.advance(1 / 60 + 1 / RULES.ticksPerSecond);
    const visitor = village.snapshot.world.visitor;
    expect(visitor).toMatchObject({
      learnerId: result.learner!.id,
      sequenceId: OOGA,
    });
    const learner = village.snapshot.avatars.find(
      (a) => a.id === result.learner!.id
    )!;
    expect(learner.state).toBe("learning");
    village.cancelVisitorLesson();
    village.destroy();
  });
});

describe("the lab's leave and come back", () => {
  it("keeps the village state's input log, with the lab's lesson in it", () => {
    const village = createVillageState({
      ...labVillageOptions(null),
      opening: false,
    });
    const result = teachNearestIdle(village, OOGA);
    expect(result.started).toBe(true);
    expect(village.inputLog).toMatchObject({
      seed: LAB_SEED,
      preset: null,
      entries: [
        { type: "teach", learnerId: result.learner!.id, sequenceId: OOGA },
      ],
    });
    village.destroy();
  });

  for (const ending of ["kept", "lost"] as const) {
    it(`comes back to the ${ending} fixture and tells the visitor what became of it`, () => {
      const village = createVillageState(
        labVillageOptions(LAB_FIXTURES[ending])
      );
      const memory = village.snapshot.world.memory!;
      const want = expected[ending].memory;
      expect(memory).toEqual(want);
      expect(memory.lost).toBe(ending === "lost");
      const generations = `${want.generations} generation${want.generations === 1 ? "" : "s"}`;
      expect(
        memoryStoryLine(memory, village.snapshot.world.tick, "OOGA")
      ).toEqual({
        tick: village.snapshot.world.tick,
        kind: want.lost ? "loss" : "change",
        text: want.lost
          ? `You came back. Nobody carries OOGA any more. It lasted ${generations}.`
          : `You came back. OOGA is still here: ${want.carrierCount} people carry it, ${generations} on.`,
      });
      expect(memoryFacts(memory, "OOGA")).toEqual([
        ["What you brought", "OOGA"],
        ["Carried by", want.lost ? "nobody" : `${want.carrierCount} people`],
        ["Generations", String(want.generations)],
        ["Lost", want.lost ? "yes" : "no"],
      ]);
      village.destroy();
    });
  }

  it("reads a log file back, and turns a bad one into a plain sentence", () => {
    expect(readLabLog(JSON.stringify(LAB_FIXTURES.kept))).toEqual({
      ok: true,
      log: LAB_FIXTURES.kept,
    });
    expect(readLabLog("{ not json")).toEqual({
      ok: false,
      error: "That file is not a village log: it isn't JSON.",
    });
    expect(readLabLog(JSON.stringify({ version: 1 }))).toEqual({
      ok: false,
      error: "That file is not a village log: seed must be a string.",
    });
    expect(
      readLabLog(JSON.stringify({ ...LAB_FIXTURES.kept, preset: "atlantis" }))
    ).toEqual({
      ok: false,
      error: `That log is for a village this lab can't build (the "atlantis" rules).`,
    });
  });
});
