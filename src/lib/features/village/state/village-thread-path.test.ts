/**
 * Thread shape (village-thread-path.ts): low, short, and dark wherever it
 * would cross a chair, the fire or a body.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { planCampLayout } from "../domain/village-campfire";
import {
	THREAD_ARC_HEIGHT,
	THREAD_BASE_HEIGHT,
	THREAD_CLEARANCE,
	THREAD_SEGMENTS,
	writeThreadPath,
} from "./village-thread-path";

const rules = loadVillageRules("museum");
const layout = planCampLayout(rules);
const positions = new Float32Array((THREAD_SEGMENTS + 1) * 3);
const brightness = new Float32Array(THREAD_SEGMENTS + 1);

function obstaclesFor(people: { x: number; z: number }[]): Float32Array {
	const circles = [
		...layout.seats.map((s) => [s.x, s.z, THREAD_CLEARANCE.chair]),
		[layout.fire.x, layout.fire.z, THREAD_CLEARANCE.fire],
		...people.map((p) => [p.x, p.z, THREAD_CLEARANCE.body]),
	];
	return new Float32Array(circles.flat());
}

function draw(a: { x: number; z: number }, b: { x: number; z: number }, bystanders: { x: number; z: number }[] = []) {
	const obstacles = obstaclesFor([a, b, ...bystanders]);
	writeThreadPath(a.x, a.z, b.x, b.z, obstacles, obstacles.length / 3, positions, brightness);
	return obstacles;
}

function litPoints() {
	const lit: { x: number; y: number; z: number }[] = [];
	for (let s = 0; s <= THREAD_SEGMENTS; s++) {
		if (brightness[s]! > 0) lit.push({ x: positions[s * 3]!, y: positions[s * 3 + 1]!, z: positions[s * 3 + 2]! });
	}
	return lit;
}

describe("lineage thread path", () => {
	it("keeps every lit point clear of chairs, the fire and bodies, across the camp", () => {
		// Pairs across the fire, past a chair and beside one, with a bystander between.
		const pairs: [{ x: number; z: number }, { x: number; z: number }][] = layout.seats.flatMap((seat) => [
			[{ x: seat.x * 1.8, z: seat.z * 1.8 }, { x: -seat.x * 1.8, z: -seat.z * 1.8 }],
			[{ x: seat.x * 0.7, z: seat.z * 0.7 }, { x: seat.x * 1.5, z: seat.z * 1.5 }],
			[{ x: seat.x + 0.6, z: seat.z + 0.6 }, { x: seat.x - 0.6, z: seat.z - 0.6 }],
		]);
		for (const [a, b] of pairs) {
			const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
			const obstacles = draw(a, b, [mid]);
			for (const p of litPoints()) {
				for (let o = 0; o < obstacles.length / 3; o++) {
					const d = Math.hypot(p.x - obstacles[o * 3]!, p.z - obstacles[o * 3 + 1]!);
					expect(d).toBeGreaterThan(obstacles[o * 3 + 2]!);
				}
			}
		}
	});

	it("stays near the ground", () => {
		draw({ x: 6, z: 0 }, { x: 0, z: 6 });
		for (let s = 0; s <= THREAD_SEGMENTS; s++) {
			expect(positions[s * 3 + 1]!).toBeLessThanOrEqual(THREAD_BASE_HEIGHT + THREAD_ARC_HEIGHT + 1e-6);
		}
	});

	it("fades out in the middle of a long span, but lights a short one through", () => {
		draw({ x: 6, z: 0 }, { x: 0, z: 6 });
		expect(brightness[THREAD_SEGMENTS / 2]).toBe(0);
		draw({ x: 5.5, z: 1.5 }, { x: 5.5, z: 3 });
		expect(brightness[THREAD_SEGMENTS / 2]!).toBeGreaterThan(0.2);
	});
});
