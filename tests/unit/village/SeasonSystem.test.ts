import { describe, it, expect } from "vitest";
import { SeasonSystem } from "#lib/features/village/engine/systems/season-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import {
	SEASON_DURATION,
	SEASON_CYCLE,
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

const defaultConfig = {
	targetPopulation: 8,
	lifespanTicks: 600,
	ticksPerSecond: 10,
	traitDistribution: { mean: 0.5, stdDev: 0.15 },
	lossyTransmissionRate: 0.1,
	inventionRate: 0.005,
	arenaRadius: 8,
	youthPhaseRatio: 0.1,
	adultPhaseRatio: 0.7,
	elderPhaseRatio: 0.2,
};

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

describe("SeasonSystem", () => {
	it("changes season after SEASON_DURATION ticks", () => {
		const { emitter, events } = makeEmitter();
		const system = new SeasonSystem(defaultConfig, emitter);
		const world = createVillageWorld();

		expect(system.currentSeason).toBe("normal");

		for (let i = 0; i < SEASON_DURATION; i++) {
			system.tick(world, i);
		}

		// After SEASON_DURATION ticks, should advance to the next season in SEASON_CYCLE
		expect(system.currentSeason).toBe(SEASON_CYCLE[1]);
		expect(events["season:changed"]).toBeDefined();
		expect(events["season:changed"].length).toBe(1);
		expect(events["season:changed"][0][0]).toBe(SEASON_CYCLE[1]);
	});

	it("cycles through the full season cycle and repeats", () => {
		const { emitter } = makeEmitter();
		const system = new SeasonSystem(defaultConfig, emitter);
		const world = createVillageWorld();

		let tick = 0;
		// Walk through every season in the cycle
		for (let s = 0; s < SEASON_CYCLE.length; s++) {
			for (let i = 0; i < SEASON_DURATION; i++) {
				system.tick(world, tick++);
			}
			const expectedIndex = (s + 1) % SEASON_CYCLE.length;
			expect(system.currentSeason).toBe(SEASON_CYCLE[expectedIndex]);
		}

		// After a full cycle we should be back to SEASON_CYCLE[0] ("normal")
		expect(system.currentSeason).toBe(SEASON_CYCLE[0]);
	});

	it("triples invention rate during festival", () => {
		const { emitter } = makeEmitter();
		const system = new SeasonSystem(defaultConfig, emitter);

		expect(system.getInventionRateMultiplier()).toBe(1.0);

		// Force season to festival
		(system as unknown as { currentSeason: string }).currentSeason = "festival";
		expect(system.getInventionRateMultiplier()).toBe(3.0);
	});

	it("slows speed during winter", () => {
		const { emitter } = makeEmitter();
		const system = new SeasonSystem(defaultConfig, emitter);

		expect(system.getSpeedMultiplier()).toBe(1.0);

		(system as unknown as { currentSeason: string }).currentSeason = "winter";
		expect(system.getSpeedMultiplier()).toBe(0.6);

		// Also verify interaction radius shrinks in winter
		expect(system.getInteractionRadiusMultiplier()).toBe(0.7);
	});

	it("migration relocates half the eligible population", () => {
		const { emitter, events } = makeEmitter();
		const system = new SeasonSystem(defaultConfig, emitter);
		const world = createVillageWorld();

		const entities = [];
		for (let i = 0; i < 6; i++) {
			const e = makeEntity(world, `Avatar${i}`);
			e.social.state = "idle";
			// Record original positions
			e.transform.targetX = 0;
			e.transform.targetZ = 0;
			entities.push(e);
		}

		// Advance to the migration season
		// SEASON_CYCLE = ["normal", "festival", "normal", "winter", "normal", "migration"]
		// We need to tick through 5 full season durations to reach migration
		const migrationIndex = SEASON_CYCLE.indexOf("migration");
		let tick = 0;
		for (let s = 0; s < migrationIndex; s++) {
			for (let i = 0; i < SEASON_DURATION; i++) {
				system.tick(world, tick++);
			}
		}

		expect(system.currentSeason).toBe("migration");

		// Count entities that got relocated (have wandering state)
		const wandering = entities.filter((e) => e.social.state === "wandering");
		expect(wandering.length).toBe(3); // half of 6

		// Verify relocated entities have updated speed
		for (const e of wandering) {
			expect(e.transform.speed).toBe(1.5);
		}
	});
});
