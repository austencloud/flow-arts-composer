/**
 * The village's render-side state (village-state.svelte.ts): the opening's
 * first events reach the story log, the opening lesson waits for its
 * motion instead of playing to empty bodies, and the museum visitor's lesson
 * runs through it with a rig for the visitor's side.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import type { VillageEvent } from "../domain/village-types";
import { createVillageState } from "./village-state.svelte";
import { buildVillageSequenceCatalogue } from "../services/village-sequence-catalogue";

const rules = loadVillageRules("museum");
const FRAME = 1 / 60;

function listen(village: ReturnType<typeof createVillageState>): VillageEvent[] {
	const heard: VillageEvent[] = [];
	village.onEvents((events) => heard.push(...events));
	return heard;
}

describe("village state", () => {
	it("hands the entry snapshot's events to the first listener, then again after a restart", () => {
		const village = createVillageState({ rules, seed: "museum-village" });
		const heard = listen(village);
		const entryEvents = village.snapshot.events;
		expect(entryEvents.some((e) => e.type === "teaching:started")).toBe(true);
		village.advance(FRAME);
		expect(heard).toEqual(entryEvents);

		heard.length = 0;
		village.reset();
		village.advance(FRAME);
		expect(heard.some((e) => e.type === "teaching:started")).toBe(true);
		village.destroy();
	});

	it("holds the opening lesson while its motion is missing, but never for good", () => {
		const village = createVillageState({ rules, seed: "museum-village" });
		const entryTick = village.snapshot.world.tick;
		village.start();
		for (let i = 0; i < 60; i++) village.advance(FRAME);
		expect(village.snapshot.world.tick).toBe(entryTick);
		// With no motion ever arriving, the lesson plays after the wait limit.
		for (let i = 0; i < 60 * 12; i++) village.advance(FRAME);
		expect(village.snapshot.world.tick).toBeGreaterThan(entryTick);
		village.destroy();
	});

	it("teaches from the visitor, gives them a rig while it runs, and can be cancelled", () => {
		const village = createVillageState({ rules, seed: "museum-village", opening: false });
		const sequenceId = rules.visitor.sequences[0]!.sequenceId;
		const learner = village.snapshot.avatars.find(
			(a) =>
				a.state !== "passing" &&
				a.state !== "retiring" &&
				a.state !== "seated" &&
				!a.knownSequenceIds.includes(sequenceId),
		)!;
		const request = {
			learnerId: learner.id,
			sequenceId,
			x: learner.x + 1.5,
			z: learner.z,
			facing: Math.PI,
		};
		const knows = () =>
			village.snapshot.avatars
				.find((a) => a.id === learner.id)
				?.knownSequenceIds.includes(sequenceId) ?? false;

		expect(village.teachFromVisitor(request)).toBe(true);
		village.start();
		village.advance(FRAME * 30);
		expect(village.visitorRenderState?.visitor).toMatchObject({ learnerId: learner.id, sequenceId });
		expect(village.snapshot.avatars.some((a) => a.id === "visitor")).toBe(false);

		// Cancel: the rig goes with the next tick and nothing is learned.
		village.cancelVisitorLesson();
		village.advance(FRAME * 30);
		expect(village.visitorRenderState).toBeNull();
		expect(knows()).toBe(false);

		// Teach again and let it run: the motion wait (no catalogue here) plus
		// the lesson's ~50 s at a step every two seconds.
		expect(village.teachFromVisitor(request)).toBe(true);
		for (let i = 0; i < 60 * 90 && !knows(); i++) village.advance(FRAME);
		expect(knows()).toBe(true);
		for (let i = 0; i < 60 * 40 && village.visitorRenderState; i++) village.advance(FRAME);
		expect(village.visitorRenderState).toBeNull();
		village.destroy();
	});

	it("comes back to a taught village from its saved log, remembering the visitor", () => {
		const village = createVillageState({ rules, seed: "museum-village", preset: "museum", opening: false });
		const sequenceId = rules.visitor.sequences[0]!.sequenceId;
		const learner = village.snapshot.avatars.find(
			(a) =>
				a.state !== "passing" &&
				a.state !== "retiring" &&
				a.state !== "seated" &&
				!a.knownSequenceIds.includes(sequenceId),
		)!;
		expect(
			village.teachFromVisitor({ learnerId: learner.id, sequenceId, x: learner.x + 1.5, z: learner.z, facing: Math.PI }),
		).toBe(true);
		village.start();
		for (let i = 0; i < 60 * 90 && village.visitorRenderState; i++) village.advance(FRAME);
		village.advance(FRAME * 30);
		// Through storage and back, as the museum keeps it.
		const saved = JSON.parse(JSON.stringify(village.inputLog));
		expect(saved).toMatchObject({ seed: "museum-village", preset: "museum", opening: false });
		expect(saved.entries).toHaveLength(1);
		village.destroy();

		const back = createVillageState({
			rules,
			seed: "museum-village",
			preset: "museum",
			opening: false,
			replay: saved,
		});
		const memory = back.snapshot.world.memory;
		expect(memory).toMatchObject({ sequenceId });
		expect(back.snapshot.world.tick).toBe(saved.lastTick + rules.memory.carryOnTicks);
		// Its log carries on from the one it was built from.
		expect(back.inputLog.entries).toEqual(saved.entries);
		back.destroy();
	});

	it("never stages the opening again in a returned village", () => {
		const first = createVillageState({ rules, seed: "museum-village", preset: "museum" });
		expect(first.snapshot.world.opening).not.toBeNull();
		const log = first.inputLog;
		first.destroy();
		const back = createVillageState({ rules, seed: "museum-village", preset: "museum", replay: log });
		expect(back.snapshot.world.opening ?? null).toBeNull();
		expect(back.openingEnabled).toBe(true);
		back.destroy();
	});

	// Idle people idle: a rig plays a sequence only while the sim has its
	// avatar perform, practise, teach or learn. Anyone else stands in the
	// body's own idle with empty hands, never a held start pose.
	it("unloads the sequence and props of everyone who is not playing", async () => {
		const baseRules = loadVillageRules();
		const village = createVillageState({
			rules: baseRules,
			seed: "village-replay-v1",
			sequenceCatalogue: await buildVillageSequenceCatalogue(baseRules),
		});
		const playing = new Set(["teaching", "learning", "performing", "practicing"]);
		let checkedIdle = 0;
		let checkedPlaying = 0;
		village.start();
		// About four minutes of village, a tick or so per call.
		for (let i = 0; i < 2400; i++) {
			village.advance(0.1);
			for (const record of village.avatarList) {
				const inst = record.instanceState;
				if (playing.has(record.avatar.state)) {
					if (inst.hasSequence) checkedPlaying++;
					continue;
				}
				checkedIdle++;
				expect(inst.hasSequence, `${record.avatar.state} at tick ${village.snapshot.world.tick}`).toBe(false);
				expect(inst.bluePropState).toBeNull();
				expect(inst.redPropState).toBeNull();
			}
		}
		expect(checkedIdle).toBeGreaterThan(0);
		expect(checkedPlaying).toBeGreaterThan(0);
		village.destroy();
	}, 60_000);

	it("refuses a log for another village", () => {
		const log = createVillageState({ rules, seed: "museum-village", preset: "museum", opening: false }).inputLog;
		expect(() =>
			createVillageState({ rules, seed: "another-village", preset: "museum", opening: false, replay: log }),
		).toThrow();
	});
});
