/**
 * The Water wing's payoff view, locked as arithmetic.
 *
 * The Gate 1 board promises that all three cases read at once from inside the
 * Fire threshold, each doubled in the channel. C's reflected head lands the
 * closest to the channel's east edge, so it is the first thing that breaks when
 * a fixture moves. If the bounce assertions fail, the promised view no longer
 * holds — that is a Gate 1 finding, not a number to tune away.
 */
import { describe, expect, it } from "vitest";
import {
	buildDrownedGalleryLayout,
	CAUSEWAY_Y,
	EYE_ABOVE_FLOOR,
	GROTTO_WATERLINE_Y,
	SHELF_Y,
	inRectClosed,
} from "$lib/features/museum/data/drowned-gallery-terrain";
import { buildVulcanCaveFloorPlan } from "$lib/features/museum/data/vulcan-cave-floor-plan";

const layout = buildDrownedGalleryLayout(buildVulcanCaveFloorPlan().grid)!;

/**
 * Where the visitor takes the last look: the centre of the walk-through gap in
 * the east threshold, read off the layout instead of written down here.
 *
 * It was written down as (24.5, 17.25) when this test was committed. The
 * compiled cave grid has since translated the wing +10 m in z, which left the
 * stand in the channel a few metres from the cases and reported the payoff view
 * as broken while every measurement inside the wing was intact. Derived, the
 * assertions below reproduce the numbers this test was committed with: 39.1
 * deg of spread, cases at 12.7-21.4 m, 0.36 m of bounce margin.
 */
const STAND = {
	...layout.probes.thresholdOpening,
	y: CAUSEWAY_Y + EYE_ABOVE_FLOOR,
};
/** Head height of a performer standing on the shelf. */
const HEAD_Y = SHELF_Y + 1.7;

const showcases = ["AAAA", "BBBB", "CCCC"].map((word) => {
	const fixture = layout.exhibitFixtures.find(
		(candidate) => candidate.id === `case-showcase-${word}`
	);
	if (!fixture) throw new Error(`no showcase for ${word}`);
	return { word, x: fixture.centre.x, z: fixture.centre.z };
});

const bearing = (target: { x: number; z: number }) =>
	(Math.atan2(target.x - STAND.x, target.z - STAND.z) * 180) / Math.PI;

const distance = (target: { x: number; z: number }) =>
	Math.hypot(target.x - STAND.x, target.z - STAND.z);

/**
 * The mirrored head sits HEAD_Y - waterline below the surface; the bounce is
 * where the eye-to-mirror-image ray crosses the water plane.
 */
const bouncePoint = (target: { x: number; z: number }) => {
	const eyeAbove = STAND.y - GROTTO_WATERLINE_Y;
	const headAbove = HEAD_Y - GROTTO_WATERLINE_Y;
	const t = eyeAbove / (eyeAbove + headAbove);
	return {
		x: STAND.x + (target.x - STAND.x) * t,
		z: STAND.z + (target.z - STAND.z) * t,
	};
};

describe("the doorway payoff", () => {
	it("holds all three cases inside a single field of view", () => {
		const bearings = showcases.map((showcase) => bearing(showcase));
		const spread = Math.max(...bearings) - Math.min(...bearings);
		expect(spread).toBeGreaterThan(30);
		expect(spread).toBeLessThan(55);
	});

	it("keeps every case within a readable distance", () => {
		for (const showcase of showcases) {
			expect(distance(showcase)).toBeGreaterThan(10);
			expect(distance(showcase)).toBeLessThan(24);
		}
	});

	it("bounces all three reflections inside the channel surface", () => {
		for (const showcase of showcases) {
			const bounce = bouncePoint(showcase);
			expect(
				inRectClosed(layout.channel, bounce.x, bounce.z),
				`${showcase.word} bounce at (${bounce.x.toFixed(2)}, ${bounce.z.toFixed(2)})`
			).toBe(true);
		}
	});

	it("flags how little margin the east-most bounce has", () => {
		const eastMost = showcases[2]!;
		const bounce = bouncePoint(eastMost);
		const margin = layout.channel.maxX - bounce.x;
		// Recorded, not asserted tight: this is the number that breaks first.
		expect(margin).toBeGreaterThan(0.15);
	});
});
