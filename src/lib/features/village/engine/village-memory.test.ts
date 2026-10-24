/**
 * The village remembers: a visitor's input log replays to the same village,
 * every time, and the return says what became of what they taught.
 *
 * The two logs in __fixtures__ are the Unreal parity set. Both are the museum
 * village and the visitor leaves 200 ticks after teaching OOGA. In one they
 * teach a youth 200 ticks after entry and the sequence is still carried at
 * the return; in the other they teach an elder near retirement, 2100 ticks
 * after entry, and nobody knows it. village-memory-expected.json holds each return's
 * memory block and snapshot hash; refresh it with `-u` only when a change to
 * the sim is meant to change them.
 */

import { describe, expect, it } from "vitest";
import keptLog from "./__fixtures__/village-memory-kept.json";
import lostLog from "./__fixtures__/village-memory-lost.json";
import { loadVillageRules } from "../domain/village-rules";
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

// The village itself, without what only a return reports.
function villageOf(snapshot: VillageSnapshot): unknown {
	const { memory: _memory, ...world } = snapshot.world;
	return { world, avatars: snapshot.avatars };
}

describe("a remembered village", () => {
	it("keeps OOGA in one fixture and loses it in the other", async () => {
		const kept = comeBack(KEPT).snapshot;
		const lost = comeBack(LOST).snapshot;
		expect(kept.world.memory).toMatchObject({ sequenceId: "codex-ooga-seq", lost: false });
		expect(kept.world.memory!.carrierCount).toBeGreaterThan(0);
		expect(lost.world.memory).toMatchObject({ sequenceId: "codex-ooga-seq", lost: true, carrierCount: 0 });
		for (const [back, log] of [
			[kept, KEPT],
			[lost, LOST],
		] as const) {
			expect(back.world.tick).toBe(log.lastTick + RULES.memory.carryOnTicks);
			expect(back.world.opening).toBeNull();
			// The time away is history: the return arrives with no news.
			expect(back.events).toEqual([]);
		}

		const expected = {
			kept: { memory: kept.world.memory, hash: villageSnapshotHash(kept) },
			lost: { memory: lost.world.memory, hash: villageSnapshotHash(lost) },
		};
		await expect(`${JSON.stringify(expected, null, "\t")}\n`).toMatchFileSnapshot(
			"./__fixtures__/village-memory-expected.json",
		);
	});

	it("finds OOGA alive on the museum seed and passed on beyond the visitor's learner", () => {
		const back = comeBack(KEPT).snapshot;
		const learnedFrom = back.avatars.flatMap((a) =>
			a.knownSequences.filter((k) => k.sequenceId === "codex-ooga-seq").map((k) => k.learnedFrom),
		);
		expect(learnedFrom.some((from) => from !== "visitor")).toBe(true);
		expect(back.world.memory!.generations).toBeGreaterThanOrEqual(2);
	});

	it("replays to the same village every time", () => {
		expect(villageSnapshotHash(comeBack(KEPT).snapshot)).toBe(villageSnapshotHash(comeBack(KEPT).snapshot));
		expect(villageSnapshotHash(comeBack(KEPT).snapshot)).not.toBe(villageSnapshotHash(comeBack(LOST).snapshot));
	});

	it("is the village the visitor would have found had they never left", () => {
		const live = new VillageOrchestrator({ rules: RULES, seed: KEPT.seed, preset: "museum", avatarModels: MODELS });
		const entry = KEPT.entries[0]!;
		if (entry.type !== "teach") throw new Error("fixture starts with a lesson");
		while (live.currentTick < entry.tick) live.tick();
		expect(live.teachFromVisitor(entry)).toBe(true);
		let snapshot = live.snapshot;
		while (live.currentTick < KEPT.lastTick + RULES.memory.carryOnTicks) snapshot = live.tick();

		expect(snapshot.world.memory).toBeUndefined();
		expect(villageSnapshotHash(villageOf(snapshot))).toBe(villageSnapshotHash(villageOf(comeBack(KEPT).snapshot)));
	});

	it("carries the log on, so a second return replays the first", () => {
		const back = comeBack(KEPT);
		const log = back.inputLog;
		expect(log.entries).toEqual(KEPT.entries);
		expect(log.lastTick).toBe(KEPT.lastTick + RULES.memory.carryOnTicks);
		const again = comeBack(log);
		expect(again.snapshot.world.tick).toBe(log.lastTick + RULES.memory.carryOnTicks);
		expect(again.snapshot.world.memory?.sequenceId).toBe("codex-ooga-seq");
	});

	it("records rounded inputs and only what changed the village", () => {
		const sim = new VillageOrchestrator({ rules: RULES, seed: "museum-village", preset: "museum", avatarModels: MODELS });
		for (let i = 0; i < 200; i++) sim.tick();
		const learner = sim.snapshot.avatars.find((a) => a.id === "avatar-15")!;
		sim.cancelVisitorLesson(); // nothing to cancel: not logged
		expect(sim.teachFromVisitor({ learnerId: learner.id, sequenceId: "nothing", x: 0, z: 0, facing: 0 })).toBe(false);
		expect(
			sim.teachFromVisitor({ learnerId: learner.id, sequenceId: "codex-ooga-seq", x: 1.23456, z: -0.004, facing: 0.12345 }),
		).toBe(true);
		sim.tick();
		sim.cancelVisitorLesson();
		expect(sim.inputLog.entries).toEqual([
			{ tick: sim.currentTick - 1, type: "teach", learnerId: learner.id, sequenceId: "codex-ooga-seq", x: 1.23, z: 0, facing: 0.123 },
			{ tick: sim.currentTick, type: "cancel" },
		]);
		expect(sim.snapshot.world.visitor?.x ?? 1.23).toBe(1.23);
	});

	it("has no memory without a return, or when the visitor never finished teaching", () => {
		const fresh = new VillageOrchestrator({ rules: RULES, seed: "museum-village", preset: "museum", avatarModels: MODELS });
		expect("memory" in fresh.snapshot.world).toBe(false);
		const untaught = comeBack({ ...KEPT, entries: [] });
		expect("memory" in untaught.snapshot.world).toBe(false);
	});

	it("refuses a log for another village, and a malformed one", () => {
		expect(
			() =>
				new VillageOrchestrator({ rules: RULES, seed: "elsewhere", preset: "museum", avatarModels: MODELS, replay: KEPT }),
		).toThrow(VillageInputLogError);
		// Same seed, but a village run on the base table.
		expect(
			() =>
				new VillageOrchestrator({ rules: RULES, seed: "museum-village", avatarModels: MODELS, replay: KEPT }),
		).toThrow(VillageInputLogError);
		expect(() => parseVillageInputLog({ ...KEPT, version: 2 })).toThrow(VillageInputLogError);
		expect(() => parseVillageInputLog({ ...KEPT, entries: [{ tick: 9999, type: "cancel" }] })).toThrow(
			VillageInputLogError,
		);
		expect(() => parseVillageInputLog({ ...KEPT, entries: [{ tick: 1, type: "dance" }] })).toThrow(
			VillageInputLogError,
		);
	});
});
