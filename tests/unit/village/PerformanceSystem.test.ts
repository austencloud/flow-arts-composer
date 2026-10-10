import { describe, it, expect } from "vitest";
import { PerformanceSystem } from "#lib/features/village/engine/systems/performance-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";
import {
	PERFORMANCE_ATTRACTION_RADIUS,
	JAM_WATCHER_THRESHOLD,
} from "#lib/features/village/domain/village-constants.js";
import type {
	VillageEventMap,
	VillageEventKey,
} from "#lib/features/village/domain/village-types.js";

function makeEmitter() {
	const events: Record<string, unknown[][]> = {};
	return {
		events,
		emitter: {
			emit<K extends VillageEventKey>(
				event: K,
				...args: Parameters<VillageEventMap[K]>
			) {
				if (!events[event]) events[event] = [];
				events[event].push(args);
			},
			on: () => {},
		},
	};
}

function makeEntity(
	world: ReturnType<typeof createVillageWorld>,
	name = "Test",
) {
	return createAvatarEntity(world, {
		name,
		generation: 1,
		currentTick: 0,
		lifespanTicks: 600,
		arenaRadius: 8,
		personalityGenerator,
		traitMean: 0.5,
		traitStdDev: 0.15,
	});
}

describe("PerformanceSystem", () => {
	it("idle entity becomes watcher near performer when curiosity > 0.3", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new PerformanceSystem(config, emitter);

		const performer = makeEntity(world, "Performer");
		performer.social.state = "performing";
		performer.transform.x = 0;
		performer.transform.z = 0;

		const watcher = makeEntity(world, "Watcher");
		watcher.social.state = "idle";
		watcher.personality.curiosity = 0.5;
		watcher.transform.x = 3;
		watcher.transform.z = 0;

		system.tick(world, 1);

		expect(watcher.social.state).toBe("watching");
		expect(watcher.social.partner).toBe(performer.id);
	});

	it("does not attract entity with low curiosity", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new PerformanceSystem(config, emitter);

		const performer = makeEntity(world, "Performer");
		performer.social.state = "performing";
		performer.transform.x = 0;
		performer.transform.z = 0;

		const bystander = makeEntity(world, "Bystander");
		bystander.social.state = "idle";
		bystander.personality.curiosity = 0.1;
		bystander.transform.x = 3;
		bystander.transform.z = 0;

		system.tick(world, 1);

		expect(bystander.social.state).toBe("idle");
	});

	it("does not attract entity outside attraction radius", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new PerformanceSystem(config, emitter);

		const performer = makeEntity(world, "Performer");
		performer.social.state = "performing";
		performer.transform.x = 0;
		performer.transform.z = 0;

		const farEntity = makeEntity(world, "Far");
		farEntity.social.state = "idle";
		farEntity.personality.curiosity = 0.9;
		farEntity.transform.x = PERFORMANCE_ATTRACTION_RADIUS + 2;
		farEntity.transform.z = 0;

		system.tick(world, 1);

		expect(farEntity.social.state).toBe("idle");
	});

	it("jam forms when 3+ watchers gather around performer", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter, events } = makeEmitter();
		const system = new PerformanceSystem(config, emitter);

		const performer = makeEntity(world, "Performer");
		performer.social.state = "performing";
		performer.social.inJam = false;
		performer.transform.x = 0;
		performer.transform.z = 0;
		performer.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 1,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// Create enough watchers to hit JAM_WATCHER_THRESHOLD
		const watchers = [];
		for (let i = 0; i < JAM_WATCHER_THRESHOLD; i++) {
			const w = makeEntity(world, `Watcher${i}`);
			w.social.state = "watching";
			w.social.partner = performer.id;
			w.personality.creativity = 0.8;
			w.transform.x = 1 + i;
			w.transform.z = 0;
			w.knowledge.knownSequences.set("seq1", {
				sequenceId: "seq1",
				sequenceData: null,
				proficiency: 0.8,
				source: "seed",
				learnedAt: 0,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: 0,
				style: { amplitudeScale: 1.0, tempoOffset: 0 },
			});
			watchers.push(w);
		}

		system.tick(world, 1);

		expect(performer.social.inJam).toBe(true);
		expect(system.activeJams.length).toBe(1);
		expect(events["jam:formed"]?.length).toBeGreaterThan(0);
	});

	it("jam dissolves when fewer than 2 performers or fewer than 4 total participants", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter, events } = makeEmitter();
		const system = new PerformanceSystem(config, emitter);

		const performer = makeEntity(world, "Performer");
		performer.social.state = "performing";
		performer.social.inJam = true;
		performer.transform.x = 0;
		performer.transform.z = 0;

		// Set up a jam with only one performer (below the < 2 threshold for dissolution)
		system.activeJams.push({
			centerX: 0,
			centerZ: 0,
			formedAtTick: 0,
			performerIds: new Set([performer.id]),
		});

		system.tick(world, 2);

		// Jam should dissolve since only 1 performer
		expect(system.activeJams.length).toBe(0);
		expect(performer.social.inJam).toBe(false);
		expect(performer.social.state).toBe("idle");
		expect(events["jam:dissolved"]?.length).toBeGreaterThan(0);
	});

	it("practice bonus applies to performing entities in jam", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new PerformanceSystem(config, emitter);

		const performer1 = makeEntity(world, "P1");
		const performer2 = makeEntity(world, "P2");

		performer1.social.state = "performing";
		performer1.social.inJam = true;
		performer1.social.performingSequenceId = "seq1";
		performer1.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 0.5,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		performer2.social.state = "performing";
		performer2.social.inJam = true;
		performer2.social.performingSequenceId = "seq2";
		performer2.knowledge.knownSequences.set("seq2", {
			sequenceId: "seq2",
			sequenceData: null,
			proficiency: 0.5,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// Create watchers so jam doesn't dissolve (need 4+ total participants)
		const w1 = makeEntity(world, "W1");
		w1.social.state = "jamming";
		const w2 = makeEntity(world, "W2");
		w2.social.state = "jamming";

		system.activeJams.push({
			centerX: 0,
			centerZ: 0,
			formedAtTick: 0,
			performerIds: new Set([performer1.id, performer2.id]),
		});

		system.tick(world, 10);

		const seq1 = performer1.knowledge.knownSequences.get("seq1");
		const seq2 = performer2.knowledge.knownSequences.get("seq2");

		expect(seq1!.proficiency).toBe(0.51); // 0.5 + 0.01
		expect(seq2!.proficiency).toBe(0.51);
		expect(seq1!.lastUsedTick).toBe(10);
	});
});
