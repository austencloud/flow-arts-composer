/**
 * The fifth stone: raised in the visitor's slot when they first finish
 * teaching, lit while anyone carries what they brought, dark when nobody
 * does, lit again if it comes back. Plus the moments and the story line the
 * real run produces.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VISITOR_ID, type VillageEntity, type VillageEvent } from "../domain/village-types";
import { VillageOrchestrator } from "./village-orchestrator";
import { MonumentSystem } from "./systems/monument-system";
import type { VillageSnapshot } from "./village-snapshot";
import { createVillageMomentTracker, type VillageMoment } from "../state/village-moments";
import { describeVillageEvents, storyContextFrom } from "../state/village-story";

const RULES = loadVillageRules();
const OOGA = RULES.visitor.sequences[0]!.sequenceId;

function teachAndRun(): { snapshots: VillageSnapshot[]; moments: VillageMoment[]; learnerId: string } {
	const sim = new VillageOrchestrator({ rules: RULES, seed: "visitor-1", avatarModels: ["x-bot"], opening: false });
	for (let i = 0; i < 40; i++) sim.tick();
	const learner = sim.snapshot.avatars.find((a) => a.phase === "youth" && a.state !== "passing")!;
	sim.teachFromVisitor({ learnerId: learner.id, sequenceId: OOGA, x: learner.x + 1.5, z: learner.z, facing: Math.PI });
	const track = createVillageMomentTracker(RULES.seedSequenceIds);
	const snapshots = [sim.snapshot];
	const moments: VillageMoment[] = [];
	track([], sim.snapshot);
	for (let i = 0; i < 700; i++) {
		const next = sim.tick();
		snapshots.push(next);
		moments.push(...track(next.events, next));
	}
	return { snapshots, moments, learnerId: learner.id };
}

describe("the visitor's stone", () => {
	const { snapshots, moments, learnerId } = teachAndRun();
	const placedAt = snapshots.findIndex((s) => s.world.stones.some((stone) => stone.fromVisitor));

	it("is raised, lit, in the visitor's slot and colour, on the tick the lesson completes", () => {
		expect(placedAt).toBeGreaterThan(0);
		const placed = snapshots[placedAt]!;
		expect(snapshots[placedAt - 1]!.world.stones.some((s) => s.fromVisitor)).toBe(false);
		expect(placed.events).toContainEqual(
			expect.objectContaining({ type: "teaching:completed", teacherId: VISITOR_ID }),
		);
		expect(placed.events).toContainEqual(expect.objectContaining({ type: "monument:placed", sequenceId: OOGA }));
		const stone = placed.world.stones.find((s) => s.fromVisitor)!;
		expect(stone).toMatchObject({
			sequenceId: OOGA,
			x: RULES.visitor.stone.x,
			z: RULES.visitor.stone.z,
			colour: RULES.visitor.stone.colour,
			lit: true,
			originName: null,
		});
		// The founders' four stones are untouched and carry no flag.
		expect(placed.world.stones.filter((s) => !s.fromVisitor)).toHaveLength(RULES.seedSequenceIds.length);
		expect(placed.world.stones.filter((s) => "fromVisitor" in s)).toHaveLength(1);
	});

	it("reports visitor:taught once, for the learner", () => {
		const taught = moments.filter((m) => m.kind === "visitor:taught");
		expect(taught).toEqual([
			{ kind: "visitor:taught", tick: snapshots[placedAt]!.world.tick, avatarId: learnerId, sequenceId: OOGA },
		]);
	});

	it("tells the lesson and the stone in the second person", () => {
		const after = snapshots[placedAt]!;
		const ctx = storyContextFrom(snapshots[placedAt - 1]!, after, () => "OOGA", new Set(RULES.seedSequenceIds));
		const name = after.avatars.find((a) => a.id === learnerId)!.name;
		const lines = describeVillageEvents(after.events, ctx).map((l) => l.text);
		expect(lines).toContain(`${name} learned OOGA from you.`);
		expect(lines).toContain("A stone is lit for OOGA.");
	});
});

describe("the visitor's stone over time", () => {
	function carrier(knows: boolean): VillageEntity {
		return {
			identity: { generation: 1 },
			social: { state: "idle" },
			knowledge: { knownSequences: new Map(knows ? [[OOGA, {}]] : []) },
		} as unknown as VillageEntity;
	}

	it("dims when nobody carries it and lights again when someone does", () => {
		const events: string[] = [];
		const system = new MonumentSystem(
			RULES,
			{ emit: (e) => events.push(`${e.type}:${"sequenceId" in e ? e.sequenceId : ""}`) },
			RULES.seedSequenceIds,
		);
		const world = { entities: [carrier(true)], visitor: null };
		system.tick(world, 1);
		expect(system.monuments.some((m) => m.fromVisitor)).toBe(false);

		system.recordVisitorLesson(OOGA);
		events.length = 0;
		system.tick(world, 2);
		const stone = () => system.monuments.find((m) => m.fromVisitor)!;
		expect(stone().carrierCount).toBe(1);
		expect(events).toContain(`monument:placed:${OOGA}`);

		world.entities = [carrier(false)];
		system.tick(world, 3);
		expect(stone().carrierCount).toBe(0);
		expect(events).toContain(`monument:dimmed:${OOGA}`);

		world.entities = [carrier(true)];
		system.tick(world, 4);
		expect(stone().carrierCount).toBe(1);
		expect(events).toContain(`monument:relit:${OOGA}`);

		// A second lesson never raises a second stone.
		system.recordVisitorLesson(OOGA);
		system.tick(world, 5);
		expect(system.monuments.filter((m) => m.fromVisitor)).toHaveLength(1);
	});
});

describe("visitor moments from events", () => {
	const { snapshots } = teachAndRun();
	const withStone = snapshots.find((s) => s.world.stones.some((stone) => stone.fromVisitor))!;
	const track = () => {
		const t = createVillageMomentTracker(RULES.seedSequenceIds);
		t([], withStone);
		return t;
	};

	it("calls a villager teaching it onward visitor:passed-on, and its end visitor:lost", () => {
		const tick = withStone.world.tick + 1;
		const events: VillageEvent[] = [
			{ type: "teaching:completed", tick, teacherId: "a1", learnerId: "a2", sequenceId: OOGA },
			{ type: "teaching:completed", tick, teacherId: "a1", learnerId: "a2", sequenceId: RULES.seedSequenceIds[0]! },
			{ type: "sequence:extinct", tick, sequenceId: OOGA },
		];
		const next = { ...withStone, world: { ...withStone.world, tick } };
		expect(track()(events, next)).toEqual([
			{ kind: "visitor:passed-on", tick, avatarId: "a2", sequenceId: OOGA },
			{ kind: "visitor:lost", tick, sequenceId: OOGA },
		]);
	});
});
