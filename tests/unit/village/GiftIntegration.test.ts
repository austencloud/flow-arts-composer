import { describe, it, expect, vi } from "vitest";
import { SocialSystem } from "#lib/features/village/engine/systems/social-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";
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

describe("GiftIntegration", () => {
	it("high-sociability entity gifts during socializing", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter, events } = makeEmitter();
		const system = new SocialSystem(config, emitter);

		const gifter = makeEntity(world, "Gifter");
		const receiver = makeEntity(world, "Receiver");

		gifter.personality.sociability = 0.95;
		gifter.social.state = "socializing";
		gifter.social.partner = receiver.id;
		gifter.social.idleTimer = 0;
		receiver.social.state = "socializing";
		receiver.social.partner = gifter.id;
		receiver.social.idleTimer = 0;

		gifter.knowledge.knownSequences.set("gift-seq", {
			sequenceId: "gift-seq",
			sequenceData: null,
			proficiency: 0.8,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		// Force Math.random to always return a low value (triggering the gift)
		vi.spyOn(Math, "random").mockReturnValue(0.001);

		system.tick(world, 100);

		vi.restoreAllMocks();

		const gifted = receiver.knowledge.knownSequences.get("gift-seq");
		expect(gifted).toBeDefined();
		expect(gifted!.source).toBe("gifted");
		expect(gifted!.proficiency).toBeCloseTo(0.8 * 0.4, 5);
		expect(gifted!.learnedFrom).toBe(gifter.id);
		expect(gifted!.lineage).toContain(gifter.id);
	});

	it("gifted sequence has reduced proficiency (40% of original)", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new SocialSystem(config, emitter);

		const gifter = makeEntity(world, "Gifter");
		const receiver = makeEntity(world, "Receiver");

		gifter.personality.sociability = 0.95;
		gifter.social.state = "socializing";
		gifter.social.partner = receiver.id;
		gifter.social.idleTimer = 0;
		receiver.social.state = "socializing";
		receiver.social.partner = gifter.id;
		receiver.social.idleTimer = 0;

		const originalProficiency = 0.6;
		gifter.knowledge.knownSequences.set("seq-gift", {
			sequenceId: "seq-gift",
			sequenceData: null,
			proficiency: originalProficiency,
			source: "taught",
			learnedAt: 0,
			learnedFrom: null,
			lineage: ["prev-teacher"],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		vi.spyOn(Math, "random").mockReturnValue(0.001);

		system.tick(world, 50);

		vi.restoreAllMocks();

		const gifted = receiver.knowledge.knownSequences.get("seq-gift");
		expect(gifted).toBeDefined();
		expect(gifted!.proficiency).toBeCloseTo(originalProficiency * 0.4, 5);
	});

	it("no gift if gifter sociability is too low", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new SocialSystem(config, emitter);

		const gifter = makeEntity(world, "Gifter");
		const receiver = makeEntity(world, "Receiver");

		gifter.personality.sociability = 0.5; // below 0.8 threshold
		gifter.social.state = "socializing";
		gifter.social.partner = receiver.id;
		gifter.social.idleTimer = 0;
		receiver.social.state = "socializing";
		receiver.social.partner = gifter.id;
		receiver.social.idleTimer = 0;

		gifter.knowledge.knownSequences.set("seq1", {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed",
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		});

		vi.spyOn(Math, "random").mockReturnValue(0.001);

		system.tick(world, 50);

		vi.restoreAllMocks();

		expect(receiver.knowledge.knownSequences.has("seq1")).toBe(false);
	});

	it("no gift if receiver already knows the sequence", () => {
		const world = createVillageWorld();
		const config = createDefaultConfig();
		const { emitter } = makeEmitter();
		const system = new SocialSystem(config, emitter);

		const gifter = makeEntity(world, "Gifter");
		const receiver = makeEntity(world, "Receiver");

		gifter.personality.sociability = 0.95;
		gifter.social.state = "socializing";
		gifter.social.partner = receiver.id;
		gifter.social.idleTimer = 0;
		receiver.social.state = "socializing";
		receiver.social.partner = gifter.id;
		receiver.social.idleTimer = 0;

		const sharedSeq = {
			sequenceId: "seq1",
			sequenceData: null,
			proficiency: 1.0,
			source: "seed" as const,
			learnedAt: 0,
			learnedFrom: null,
			lineage: [],
			lastUsedTick: 0,
			style: { amplitudeScale: 1.0, tempoOffset: 0 },
		};

		gifter.knowledge.knownSequences.set("seq1", { ...sharedSeq });
		receiver.knowledge.knownSequences.set("seq1", { ...sharedSeq });

		const receiverProfBefore = receiver.knowledge.knownSequences.get("seq1")!.proficiency;

		vi.spyOn(Math, "random").mockReturnValue(0.001);

		system.tick(world, 50);

		vi.restoreAllMocks();

		// Proficiency should remain unchanged (no overwrite with gift)
		expect(receiver.knowledge.knownSequences.get("seq1")!.proficiency).toBe(
			receiverProfBefore,
		);
	});
});
