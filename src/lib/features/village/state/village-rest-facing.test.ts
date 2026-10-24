/**
 * Where an idle villager rests their gaze (village-rest-facing.ts), and the
 * capped turn that eases a body toward it.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "../engine/village-orchestrator";
import type { VillageAvatarSnapshot, VillageSnapshot } from "../engine/village-snapshot";
import { restFacing, turnToward } from "./village-rest-facing";

const base: VillageSnapshot = new VillageOrchestrator({
	rules: loadVillageRules(),
	seed: "rest-facing",
	avatarModels: ["ch01"],
	opening: false,
}).snapshot;
const fire = base.world.campfire;

function at(id: string, x: number, z: number, state: VillageAvatarSnapshot["state"], facing = 0): VillageAvatarSnapshot {
	return { ...base.avatars[0]!, id, x, z, state, facing, partnerId: null };
}

function scene(...avatars: VillageAvatarSnapshot[]): VillageSnapshot {
	return { ...base, avatars };
}

describe("village rest facing", () => {
	it("turns an idle person to the fire", () => {
		const idle = at("a", fire.x + 4, fire.z, "idle", 0);
		expect(restFacing(idle, scene(idle), 6)).toBeCloseTo(Math.PI);
	});

	it("turns them to a performer nearby instead, and ignores one out of range", () => {
		const idle = at("a", fire.x + 4, fire.z, "idle");
		const near = at("b", fire.x + 4, fire.z + 3, "performing");
		expect(restFacing(idle, scene(idle, near), 6)).toBeCloseTo(Math.PI / 2);
		const far = at("c", fire.x + 4, fire.z - 9, "performing");
		expect(restFacing(idle, scene(idle, far), 6)).toBeCloseTo(Math.PI);
	});

	it("keeps the sim's facing where the sim chose one", () => {
		const watcher = at("a", fire.x + 4, fire.z, "watching", 1.234);
		const near = at("b", fire.x + 4, fire.z + 3, "performing");
		expect(restFacing(watcher, scene(watcher, near), 6)).toBe(1.234);
		const seated = at("s", fire.x + 2, fire.z, "seated", -0.5);
		expect(restFacing(seated, scene(seated), 6)).toBe(-0.5);
	});

	it("turns the short way round, no further than the step", () => {
		expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
		expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
		// From just under +pi to just over -pi is a small step across the seam.
		expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1);
	});
});
