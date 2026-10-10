import { describe, it, expect } from "vitest";
import { MovementSystem } from "#lib/features/village/engine/systems/movement-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { createDefaultConfig } from "#lib/features/village/engine/village-config.js";

function makeEntity(world: ReturnType<typeof createVillageWorld>) {
	return createAvatarEntity(world, {
		name: "Test",
		generation: 1,
		currentTick: 0,
		lifespanTicks: 600,
		arenaRadius: 8,
		personalityGenerator,
		traitMean: 0.5,
		traitStdDev: 0.15,
	});
}

describe("MovementSystem", () => {
	it("moves entity toward target", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new MovementSystem(config);

		entity.transform.x = 0;
		entity.transform.z = 0;
		entity.transform.targetX = 5;
		entity.transform.targetZ = 0;
		entity.transform.speed = 1;

		system.tick(world);

		expect(entity.transform.x).toBeGreaterThan(0);
	});

	it("stops when arriving at target", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new MovementSystem(config);

		entity.transform.x = 4.9;
		entity.transform.z = 0;
		entity.transform.targetX = 5;
		entity.transform.targetZ = 0;
		entity.transform.speed = 1;

		system.tick(world);

		expect(entity.transform.speed).toBe(0);
	});

	it("keeps entities within arena bounds", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const config = createDefaultConfig({ arenaRadius: 8 });
		const system = new MovementSystem(config);

		entity.transform.x = 7.5;
		entity.transform.z = 7.5;
		entity.transform.targetX = 20;
		entity.transform.targetZ = 20;
		entity.transform.speed = 5;

		system.tick(world);

		const dist = Math.sqrt(
			entity.transform.x ** 2 + entity.transform.z ** 2,
		);
		expect(dist).toBeLessThanOrEqual(config.arenaRadius + 0.1);
	});

	it("scales speed by age phase", () => {
		const world = createVillageWorld();
		const youthEntity = makeEntity(world);
		const elderEntity = makeEntity(world);
		const config = createDefaultConfig();
		const system = new MovementSystem(config);

		youthEntity.lifecycle.phase = "youth";
		elderEntity.lifecycle.phase = "elder";

		youthEntity.transform.x = 0;
		youthEntity.transform.z = 0;
		youthEntity.transform.targetX = 10;
		youthEntity.transform.targetZ = 0;
		youthEntity.transform.speed = 1;

		elderEntity.transform.x = 0;
		elderEntity.transform.z = 0;
		elderEntity.transform.targetX = 10;
		elderEntity.transform.targetZ = 0;
		elderEntity.transform.speed = 1;

		system.tick(world);

		expect(youthEntity.transform.x).toBeGreaterThan(
			elderEntity.transform.x,
		);
	});
});
