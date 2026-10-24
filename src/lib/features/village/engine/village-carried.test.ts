/**
 * A sequence the visitor brings from outside the rules table: here a made-up
 * three-step one, "visitor-made-3", built from real step data. The village
 * teaches, keeps and loses it like an exhibit sequence, and the input log
 * carries its steps so a return rebuilds it with nothing else passed in.
 *
 * Both logs are the museum village, with the visitor leaving 200 ticks after
 * teaching: a youth taught 200 ticks after entry keeps it, an elder near
 * retirement taught 2100 ticks after entry loses it. village-carried-expected.json holds each
 * return's memory block and hash; refresh it with `-u` only when a change to
 * the sim is meant to change them.
 */

import { describe, expect, it } from "vitest";
import keptLog from "./__fixtures__/village-carried-kept.json";
import lostLog from "./__fixtures__/village-carried-lost.json";
import {
	loadVillageRules,
	VillageRulesError,
	withCarriedSequences,
	type VillageCarriedSequence,
} from "../domain/village-rules";
import { sequenceColour, sequenceStepCount } from "../domain/village-campfire";
import {
	parseVillageInputLog,
	VillageInputLogError,
	type VillageInputLog,
} from "../domain/village-input-log";
import { VillageOrchestrator } from "./village-orchestrator";
import { villageSnapshotHash } from "./village-snapshot-hash";
import type { VillageSnapshot } from "./village-snapshot";

const RULES = loadVillageRules("museum");
const MODELS = ["x-bot", "y-bot", "remy"];
const KEPT = parseVillageInputLog(keptLog);
const LOST = parseVillageInputLog(lostLog);
const ID = "visitor-made-3";
const LOGGED = KEPT.sequences![ID]!;
const CARRIED: VillageCarriedSequence = { sequenceId: ID, ...LOGGED };

function comeBack(log: VillageInputLog): VillageOrchestrator {
	return new VillageOrchestrator({
		rules: RULES,
		seed: log.seed,
		preset: log.preset,
		opening: log.opening,
		avatarModels: MODELS,
		replay: log,
	});
}

function live(carried: VillageCarriedSequence[] = [CARRIED]): VillageOrchestrator {
	return new VillageOrchestrator({
		rules: RULES,
		seed: "museum-village",
		preset: "museum",
		avatarModels: MODELS,
		carried,
	});
}

// Runs a live village to the fixture's lesson and starts it.
function teachAsKept(): VillageOrchestrator {
	const sim = live();
	const entry = KEPT.entries[0]!;
	if (entry.type !== "teach") throw new Error("fixture starts with a lesson");
	while (sim.currentTick < entry.tick) sim.tick();
	expect(sim.teachFromVisitor(entry)).toBe(true);
	return sim;
}

// The village itself, without what only a return reports.
function villageOf(snapshot: VillageSnapshot): unknown {
	const { memory: _memory, ...world } = snapshot.world;
	return { world, avatars: snapshot.avatars };
}

describe("a sequence the visitor brings", () => {
	it("joins the visitor's sequences, catalogue and transforms, with its own steps and colour", () => {
		const sim = live();
		expect(sim.rules.visitor.sequences.map((s) => s.sequenceId)).toEqual([
			...RULES.visitor.sequences.map((s) => s.sequenceId),
			ID,
		]);
		const ids = sim.catalogue.map((e) => e.id);
		expect(ids).toContain(ID);
		for (const transform of RULES.catalogue.transforms) expect(ids).toContain(`${ID}:${transform}`);
		expect(sequenceStepCount(sim.rules, `${ID}:mirror`)).toBe(3);
		expect(sequenceColour(sim.rules, ID)).toBe(LOGGED.colour);
		// Exhibit sequences keep the visitor stone's colour.
		const ooga = RULES.visitor.sequences[0]!.sequenceId;
		expect(sequenceColour(sim.rules, ooga)).toBe(RULES.visitor.stone.colour);
	});

	it("leaves the rules and the village untouched when nothing new is taught", () => {
		expect(withCarriedSequences(RULES, [])).toBe(RULES);
		const ooga = RULES.visitor.sequences[0]!;
		const exhibit = { sequenceId: ooga.sequenceId, word: "OOGA", stepCount: ooga.steps, colour: "#ffffff" };
		expect(withCarriedSequences(RULES, [exhibit])).toBe(RULES);
		// Carried but never taught, the village runs exactly as without it.
		const carrying = live();
		const without = live([]);
		for (let i = 0; i < 300; i++) {
			carrying.tick();
			without.tick();
		}
		expect(villageSnapshotHash(carrying.snapshot)).toBe(villageSnapshotHash(without.snapshot));
		expect("sequences" in carrying.inputLog).toBe(false);
	});

	it("is kept in one fixture and lost in the other, its stone in its own colour", async () => {
		const kept = comeBack(KEPT).snapshot;
		const lost = comeBack(LOST).snapshot;
		expect(kept.world.memory).toMatchObject({ sequenceId: ID, lost: false });
		expect(kept.world.memory!.carrierCount).toBeGreaterThan(0);
		expect(lost.world.memory).toMatchObject({ sequenceId: ID, lost: true, carrierCount: 0 });
		for (const back of [kept, lost]) {
			expect(back.world.stones.find((s) => s.fromVisitor)).toMatchObject({
				sequenceId: ID,
				colour: LOGGED.colour,
			});
		}
		const expected = {
			kept: { memory: kept.world.memory, hash: villageSnapshotHash(kept) },
			lost: { memory: lost.world.memory, hash: villageSnapshotHash(lost) },
		};
		await expect(`${JSON.stringify(expected, null, "\t")}\n`).toMatchFileSnapshot(
			"./__fixtures__/village-carried-expected.json",
		);
	});

	it("replays to the same village every time, and as if the visitor had never left", () => {
		for (const log of [KEPT, LOST]) {
			expect(villageSnapshotHash(comeBack(log).snapshot)).toBe(villageSnapshotHash(comeBack(log).snapshot));
		}
		const sim = teachAsKept();
		let snapshot = sim.snapshot;
		while (sim.currentTick < KEPT.lastTick + RULES.memory.carryOnTicks) snapshot = sim.tick();
		expect(villageSnapshotHash(villageOf(snapshot))).toBe(
			villageSnapshotHash(villageOf(comeBack(KEPT).snapshot)),
		);
	});

	it("logs its steps once taught, and a return logs them on unchanged", () => {
		const sim = teachAsKept();
		while (sim.currentTick < KEPT.lastTick) sim.tick();
		expect(sim.inputLog).toEqual(KEPT);
		// The log is a copy: changing it leaves the village's own alone.
		sim.inputLog.sequences![ID]!.steps!.pop();
		expect(sim.inputLog.sequences![ID]!.steps).toHaveLength(3);

		const again = comeBack(KEPT).inputLog;
		expect(again.sequences).toEqual(KEPT.sequences);
		expect(comeBack(again).snapshot.world.memory?.sequenceId).toBe(ID);
	});

	it("runs the lesson over its own three steps", () => {
		const sim = teachAsKept();
		expect(sim.tick().world.visitor).toMatchObject({ sequenceId: ID, lessonStepCount: 3 });
	});

	it("refuses a log that teaches what it does not carry, and malformed sequences", () => {
		const { sequences: _sequences, ...bare } = KEPT;
		expect(() => comeBack(bare)).toThrow(VillageInputLogError);
		expect(() => parseVillageInputLog({ ...KEPT, sequences: [] })).toThrow(VillageInputLogError);
		expect(() =>
			parseVillageInputLog({ ...KEPT, sequences: { [ID]: { ...LOGGED, stepCount: 4 } } }),
		).toThrow(VillageInputLogError);
		expect(() =>
			parseVillageInputLog({ ...KEPT, sequences: { [ID]: { ...LOGGED, colour: 3 } } }),
		).toThrow(VillageInputLogError);
	});

	it("refuses a carried sequence the village could not tell apart or draw", () => {
		const bad: Partial<VillageCarriedSequence>[] = [
			{ sequenceId: RULES.seedSequenceIds[0]! },
			{ sequenceId: `${ID}:mirror` },
			{ sequenceId: "" },
			{ colour: "orange" },
			{ stepCount: 0 },
			{ stepCount: 4 },
		];
		for (const change of bad) {
			expect(
				() => withCarriedSequences(RULES, [{ ...CARRIED, ...change }]),
				JSON.stringify(change),
			).toThrow(VillageRulesError);
		}
	});
});
