import { describe, it, expect } from "vitest";
import { CircleSystem } from "#lib/features/village/engine/systems/circle-system.js";
import {
	createVillageWorld,
	createAvatarEntity,
} from "#lib/features/village/engine/village-world.js";
import * as personalityGenerator from "#lib/features/village/services/personality-generator.js";
import { CIRCLE_RADIUS } from "#lib/features/village/domain/village-constants.js";
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

describe("CircleSystem", () => {
	it("forms a circle when 3+ same-affinity performers are nearby", () => {
		const world = createVillageWorld();
		const { emitter, events } = makeEmitter();
		const system = new CircleSystem(emitter);

		const a = makeEntity(world, "A");
		const b = makeEntity(world, "B");
		const c = makeEntity(world, "C");

		a.effect.affinity = "fire";
		b.effect.affinity = "fire";
		c.effect.affinity = "fire";

		a.social.state = "performing";
		b.social.state = "performing";
		c.social.state = "performing";

		a.transform.x = 0;
		a.transform.z = 0;
		b.transform.x = 1;
		b.transform.z = 0;
		c.transform.x = 0;
		c.transform.z = 1;

		system.tick(world, 1);

		expect(system.circles).toHaveLength(1);
		expect(system.circles[0].affinity).toBe("fire");
		expect(system.circles[0].memberIds.size).toBe(3);
		expect(events["circle:formed"]).toHaveLength(1);
	});

	it("does not form a circle with mixed affinities", () => {
		const world = createVillageWorld();
		const { emitter, events } = makeEmitter();
		const system = new CircleSystem(emitter);

		const a = makeEntity(world, "A");
		const b = makeEntity(world, "B");
		const c = makeEntity(world, "C");

		a.effect.affinity = "fire";
		b.effect.affinity = "led";
		c.effect.affinity = "charcoal";

		a.social.state = "performing";
		b.social.state = "performing";
		c.social.state = "performing";

		a.transform.x = 0;
		a.transform.z = 0;
		b.transform.x = 1;
		b.transform.z = 0;
		c.transform.x = 0;
		c.transform.z = 1;

		system.tick(world, 1);

		expect(system.circles).toHaveLength(0);
		expect(events["circle:formed"]).toBeUndefined();
	});

	it("dissolves circle when performers stop performing", () => {
		const world = createVillageWorld();
		const { emitter, events } = makeEmitter();
		const system = new CircleSystem(emitter);

		const a = makeEntity(world, "A");
		const b = makeEntity(world, "B");
		const c = makeEntity(world, "C");

		a.effect.affinity = "led";
		b.effect.affinity = "led";
		c.effect.affinity = "led";

		a.social.state = "performing";
		b.social.state = "performing";
		c.social.state = "performing";

		a.transform.x = 0;
		a.transform.z = 0;
		b.transform.x = 1;
		b.transform.z = 0;
		c.transform.x = 0;
		c.transform.z = 1;

		// Form the circle
		system.tick(world, 1);
		expect(system.circles).toHaveLength(1);

		// All go idle
		a.social.state = "idle";
		b.social.state = "idle";
		c.social.state = "idle";

		system.tick(world, 2);

		expect(system.circles).toHaveLength(0);
		expect(events["circle:dissolved"]).toHaveLength(1);
	});

	it("does not cluster entities beyond CIRCLE_RADIUS", () => {
		const world = createVillageWorld();
		const { emitter } = makeEmitter();
		const system = new CircleSystem(emitter);

		const a = makeEntity(world, "A");
		const b = makeEntity(world, "B");
		const c = makeEntity(world, "C");

		a.effect.affinity = "trails";
		b.effect.affinity = "trails";
		c.effect.affinity = "trails";

		a.social.state = "performing";
		b.social.state = "performing";
		c.social.state = "performing";

		// a and b are close, but c is far away
		a.transform.x = 0;
		a.transform.z = 0;
		b.transform.x = 1;
		b.transform.z = 0;
		c.transform.x = CIRCLE_RADIUS + 5;
		c.transform.z = 0;

		system.tick(world, 1);

		// Only 2 within range of pivot — not enough for a circle
		expect(system.circles).toHaveLength(0);
	});
});
