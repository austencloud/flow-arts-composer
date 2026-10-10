import { describe, it, expect } from "vitest";
import { PropSystem } from "#lib/features/village/engine/systems/prop-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { PROP_WEAR_PROFILES } from "#lib/features/village/domain/village-constants.js";
import type {
	VillageEventMap,
	VillageEventKey,
	PropArtifact,
} from "#lib/features/village/domain/village-types.js";

function makeEmitter() {
	const events: Record<string, unknown[][]> = {};
	const handlers: Record<string, Function[]> = {};
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
			on<K extends VillageEventKey>(event: K, handler: VillageEventMap[K]) {
				if (!handlers[event]) handlers[event] = [];
				handlers[event].push(handler as Function);
			},
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

function makeProp(overrides: Partial<PropArtifact> = {}): PropArtifact {
	return {
		id: "prop-1",
		propType: "staff",
		createdAtTick: 0,
		createdBy: "maker-1",
		ownershipChain: ["entity-1"],
		totalStepsPerformed: 0,
		wear: 0,
		favoriteSequenceId: null,
		customHue: 0,
		broken: false,
		...overrides,
	};
}

describe("PropSystem", () => {
	it("accumulates wear during performing", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter } = makeEmitter();
		const system = new PropSystem(emitter);

		const prop = makeProp();
		entity.prop.heldProp = prop;
		entity.social.state = "performing";

		system.tick(world, 1);

		const staffWearRate = PROP_WEAR_PROFILES["staff"].wearRate;
		expect(prop.wear).toBeCloseTo(staffWearRate);
		expect(prop.totalStepsPerformed).toBe(1);
	});

	it("breaks prop when wear >= 1.0", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter, events } = makeEmitter();
		const system = new PropSystem(emitter);

		const staffWearRate = PROP_WEAR_PROFILES["staff"].wearRate;
		const prop = makeProp({ wear: 1.0 - staffWearRate / 2 });
		entity.prop.heldProp = prop;
		entity.social.state = "performing";

		system.tick(world, 1);

		expect(prop.broken).toBe(true);
		expect(entity.prop.heldProp).toBeNull();
		expect(system.propWall).toHaveLength(1);
		expect(system.propWall[0]).toBe(prop);
		expect(events["prop:broken"]?.length).toBe(1);
	});

	it("drops prop on entity death", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter, events } = makeEmitter();
		const system = new PropSystem(emitter);

		const prop = makeProp();
		entity.prop.heldProp = prop;
		entity.transform.x = 3;
		entity.transform.z = 5;

		system.onEntityDied(entity);

		expect(system.droppedProps).toHaveLength(1);
		expect(system.droppedProps[0].artifact).toBe(prop);
		expect(system.droppedProps[0].x).toBe(3);
		expect(system.droppedProps[0].z).toBe(5);
		expect(events["prop:dropped"]?.length).toBe(1);
	});

	it("propless entity picks up nearby dropped prop", () => {
		const world = createVillageWorld();
		const entity = makeEntity(world);
		const { emitter, events } = makeEmitter();
		const system = new PropSystem(emitter);

		// Entity has no prop and is near the drop
		entity.prop.heldProp = null;
		entity.transform.x = 1;
		entity.transform.z = 1;
		entity.social.state = "wandering";

		const prop = makeProp();
		system.droppedProps.push({
			artifact: prop,
			x: 1.5,
			z: 1,
			droppedAtTick: 0,
		});

		system.tick(world, 1);

		expect(entity.prop.heldProp).toBe(prop);
		expect(prop.ownershipChain).toContain(entity.id);
		expect(system.droppedProps).toHaveLength(0);
		expect(events["prop:pickedUp"]?.length).toBe(1);
	});
});
