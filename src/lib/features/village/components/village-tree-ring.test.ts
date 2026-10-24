import { describe, expect, it } from "vitest";
import {
	groundFalloffAlpha,
	isInTreeRingOpening,
	planVillageTreeRing,
	VILLAGE_GROUND_FALLOFF,
} from "./village-tree-ring";

const centre = { x: 0, z: 0 };

function allTrees() {
	return [...planVillageTreeRing(centre).values()].flat();
}

describe("village tree ring", () => {
	it("stands every trunk outside the 15 m walkable floor and inside 22 m", () => {
		const trees = allTrees();
		expect(trees.length).toBeGreaterThan(40);
		for (const tree of trees) {
			const r = Math.hypot(tree.x, tree.z);
			expect(r).toBeGreaterThanOrEqual(15);
			expect(r).toBeLessThanOrEqual(22);
		}
	});

	it("leaves the door openings clear", () => {
		for (const tree of allTrees()) {
			const degrees = ((Math.atan2(tree.z, tree.x) * 180) / Math.PI + 360) % 360;
			expect(isInTreeRingOpening(degrees)).toBe(false);
		}
		expect(isInTreeRingOpening(90)).toBe(true);
		expect(isInTreeRingOpening(359)).toBe(true);
		expect(isInTreeRingOpening(45)).toBe(false);
	});

	it("closes the rest of the circle: no wall-side gap wider than 30 degrees", () => {
		const angles = allTrees()
			.filter((tree) => tree.renderedHeightMeters > 8)
			.map((tree) => ((Math.atan2(tree.z, tree.x) * 180) / Math.PI + 360) % 360)
			.sort((a, b) => a - b);
		for (let i = 1; i < angles.length; i++) {
			const mid = (angles[i]! + angles[i - 1]!) / 2;
			if (isInTreeRingOpening(mid)) continue;
			expect(angles[i]! - angles[i - 1]!).toBeLessThan(30);
		}
	});

	it("plants the same trees every time, so the lab and the museum match", () => {
		expect(planVillageTreeRing(centre)).toEqual(planVillageTreeRing(centre));
	});

	it("darkens the ground only past the fire's reach", () => {
		expect(groundFalloffAlpha(VILLAGE_GROUND_FALLOFF.innerRadius)).toBe(0);
		expect(groundFalloffAlpha(5)).toBe(0);
		expect(groundFalloffAlpha(VILLAGE_GROUND_FALLOFF.fullRadius)).toBeCloseTo(
			VILLAGE_GROUND_FALLOFF.opacity,
		);
		expect(groundFalloffAlpha(18)).toBeGreaterThan(0);
		expect(groundFalloffAlpha(18)).toBeLessThan(VILLAGE_GROUND_FALLOFF.opacity);
	});
});
