import { describe, it, expect } from "vitest";
import { SocialSystem } from "#lib/features/village/engine/systems/social-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";
import { IDLE_THRESHOLD_BASE } from "#lib/features/village/domain/village-constants.js";
import type { VillageEventEmitter } from "#lib/features/village/engine/village-event-emitter.js";
import { VillageDecisionEngine } from "#lib/features/village/engine/llm/village-decision-engine.js";
import type { Season } from "#lib/features/village/domain/village-types.js";

const mockEmitter: VillageEventEmitter = {
	emit: () => {},
	on: () => {},
};

// SocialSystem now takes a VillageDecisionEngine + a season accessor. A freshly
// constructed engine defaults to disabled (`enabled === false`) with no pending
// decisions, so `consumeDecision` returns null and `handleIdle` takes the exact
// deterministic `rollIdleDecision` path these tests have always exercised — no
// fabricated mock returns, just the engine's real no-LLM default state.
function makeDecisionEngine(): VillageDecisionEngine {
	return new VillageDecisionEngine();
}

const getCurrentSeason = (): Season => "normal";

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

describe("SocialSystem", () => {
	it("increments idle timer when idle", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new SocialSystem(config, mockEmitter, makeDecisionEngine(), getCurrentSeason);
		entity.social.state = "idle";
		entity.social.idleTimer = 0;

		system.tick(world, 1);

		expect(entity.social.idleTimer).toBe(1);
	});

	it("transitions from idle to seeking/wandering/performing after threshold", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new SocialSystem(config, mockEmitter, makeDecisionEngine(), getCurrentSeason);
		entity.social.state = "idle";
		entity.social.idleTimer = IDLE_THRESHOLD_BASE + 1;
		entity.social.interactionCooldown = 0;

		system.tick(world, 1);

		expect(["seeking", "wandering", "performing"]).toContain(
			entity.social.state,
		);
	});

	it("decrements interaction cooldown each tick", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new SocialSystem(config, mockEmitter, makeDecisionEngine(), getCurrentSeason);
		entity.social.state = "idle";
		entity.social.interactionCooldown = 5;

		system.tick(world, 1);

		expect(entity.social.interactionCooldown).toBe(4);
	});

	it("pairs two seeking entities that are close", () => {
		const world = createVillageWorld();
		const entity1 = makeEntity(world, "A");
		const entity2 = makeEntity(world, "B");
		const config = createDefaultConfig();
		const system = new SocialSystem(config, mockEmitter, makeDecisionEngine(), getCurrentSeason);

		// Place far enough apart that they need to walk toward each other
		entity1.transform.x = 0;
		entity1.transform.z = 0;
		entity2.transform.x = 3;
		entity2.transform.z = 0;
		entity1.social.state = "seeking";
		entity2.social.state = "seeking";
		entity1.social.interactionCooldown = 0;
		entity2.social.interactionCooldown = 0;

		entity1.knowledge.knownSequences.set("seq1", {
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

		system.tick(world, 1);

		expect(entity1.social.state).toBe("approaching");
		expect(entity2.social.state).toBe("approaching");
		expect(entity1.social.partner).toBe(entity2.id);
		expect(entity2.social.partner).toBe(entity1.id);
	});

	it("transitions wandering entity back to idle on arrival", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new SocialSystem(config, mockEmitter, makeDecisionEngine(), getCurrentSeason);

		entity.social.state = "wandering";
		entity.transform.speed = 0;

		system.tick(world, 1);

		expect(entity.social.state).toBe("idle");
	});

	it("does not transition entities in passing state", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new SocialSystem(config, mockEmitter, makeDecisionEngine(), getCurrentSeason);

		entity.social.state = "passing";

		system.tick(world, 1);

		expect(entity.social.state).toBe("passing");
	});
});
