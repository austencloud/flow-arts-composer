import { describe, expect, it } from "vitest";
import type { VillageAvatarSnapshot } from "#lib/features/village/engine/village-snapshot.js";
import { loadVillageRules } from "#lib/features/village/domain/village-rules.js";
import {
	findFacingVillager,
	villageToWorld,
	worldToVillage,
	yawToVillageFacing,
} from "./museum-village-visitor";

const centre = { x: 40, z: 12 };
const rules = loadVillageRules("museum");

function villager(id: string, x: number, z: number, extra: Partial<VillageAvatarSnapshot> = {}) {
	return {
		id,
		name: id,
		x,
		z,
		state: "idle",
		phase: "adult",
		age: 20,
		lessonRole: null,
		knownSequenceIds: [],
		...extra,
	} as unknown as VillageAvatarSnapshot;
}

// Stand the visitor at a village point, looking toward another village point,
// and express both in museum world space the way the HUD sees them.
function visitorAt(from: { x: number; z: number }, toward: { x: number; z: number }) {
	const at = villageToWorld(centre, from.x, from.z);
	const target = villageToWorld(centre, toward.x, toward.z);
	return {
		playerX: at.x,
		playerZ: at.z,
		playerYaw: Math.atan2(target.x - at.x, target.z - at.z),
	};
}

describe("village room turn", () => {
	it("round-trips world and village space", () => {
		const world = villageToWorld(centre, 3, -7);
		const back = worldToVillage(centre, world.x, world.z);
		expect(back.x).toBeCloseTo(3);
		expect(back.z).toBeCloseTo(-7);
	});

	it("puts the village audience side (+z) toward the room's west (-x)", () => {
		const world = villageToWorld(centre, 0, 11);
		expect(world.x).toBeCloseTo(centre.x - 11);
		expect(world.z).toBeCloseTo(centre.z);
	});

	it("turns a museum yaw into a sim facing", () => {
		// Facing museum east (+x) is facing the fire from the audience: village -z.
		expect(yawToVillageFacing(Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
	});
});

describe("findFacingVillager", () => {
	const sequenceId = "codex-ooga-seq";

	it("picks the nearest eligible villager in front", () => {
		const avatars = [villager("far", 2, 0), villager("near", 1.2, 0.2)];
		const found = findFacingVillager({
			avatars,
			centre,
			sequenceId,
			rules,
			...visitorAt({ x: 0, z: 0 }, { x: 1, z: 0 }),
		});
		expect(found?.avatar.id).toBe("near");
		expect(found?.visitorX).toBeCloseTo(0);
		expect(found?.visitorZ).toBeCloseTo(0);
		expect(found?.visitorFacing).toBeCloseTo(0);
	});

	it("ignores villagers behind, beside or out of reach", () => {
		const avatars = [
			villager("behind", -1, 0),
			villager("beside", 0, 1.5),
			villager("far", 3, 0),
		];
		expect(
			findFacingVillager({ avatars, centre, sequenceId, rules, ...visitorAt({ x: 0, z: 0 }, { x: 1, z: 0 }) }),
		).toBeNull();
	});

	it("skips busy villagers and those who already know the sequence", () => {
		const avatars = [
			villager("teaching", 1, 0, { state: "teaching" }),
			villager("in-lesson", 1.1, 0, { lessonRole: "learner" } as Partial<VillageAvatarSnapshot>),
			villager("knows", 1.2, 0, { knownSequenceIds: [sequenceId] }),
			villager("free", 2, 0),
		];
		const found = findFacingVillager({
			avatars,
			centre,
			sequenceId,
			rules,
			...visitorAt({ x: 0, z: 0 }, { x: 1, z: 0 }),
		});
		expect(found?.avatar.id).toBe("free");
	});

	it("shows no prompt when everyone in front is busy or already carries it", () => {
		const avatars = [
			villager("seated", 1, 0, { state: "seated" }),
			villager("knows", 1.2, 0, { knownSequenceIds: [sequenceId] }),
			villager("free-behind", -1, 0),
		];
		expect(
			findFacingVillager({ avatars, centre, sequenceId, rules, ...visitorAt({ x: 0, z: 0 }, { x: 1, z: 0 }) }),
		).toBeNull();
	});

	it("prefers whoever will live to pass it on: a youth, then the youngest adult", () => {
		const facing = visitorAt({ x: 0, z: 0 }, { x: 1, z: 0 });
		const elder = villager("elder", 1, 0, { phase: "elder", age: 70 });
		const older = villager("older", 1.2, 0, { age: 40 });
		const younger = villager("younger", 2, 0.3, { age: 22 });
		const youth = villager("youth", 2.2, -0.3, { phase: "youth", age: 9 });
		const pick = (avatars: VillageAvatarSnapshot[]) =>
			findFacingVillager({ avatars, centre, sequenceId, rules, ...facing });
		expect(pick([elder, older, younger, youth])?.avatar.id).toBe("youth");
		expect(pick([elder, older, younger])?.avatar.id).toBe("younger");
		expect(pick([elder, older, younger])?.distance).toBeCloseTo(Math.hypot(2, 0.3));
		// A youth behind the visitor does not count.
		expect(pick([older, villager("youth-behind", -1, 0, { phase: "youth" })])?.avatar.id).toBe("older");
	});
});
