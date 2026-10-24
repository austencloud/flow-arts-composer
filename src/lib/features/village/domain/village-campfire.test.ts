/**
 * The village's layout round its fire. These guard the things a screenshot
 * would not catch until someone noticed a prop swinging through a chair: the
 * sim's seats are where the campsite model draws its chairs, lanes leave room
 * for props and keep the audience's view open, and walkers never cut through
 * the fire.
 */

import { describe, expect, it } from "vitest";
import campsiteLayout from "../../../../../scripts/forest-campsite-layout.json";
import { loadVillageRules, parseVillageRules, VillageRulesError } from "./village-rules";
import rulesJson from "./village-rules.json";
import {
	isBehindFireFromAudience,
	isInAudienceGap,
	keepToClearing,
	lessonSpots,
	planCampLayout,
	sequenceColour,
} from "./village-campfire";
import { VillageOrchestrator } from "../engine/village-orchestrator";

const rules = loadVillageRules();
const layout = planCampLayout(rules);
const fire = rules.campfire;
// A staff swung at arm's length reaches about this far from the body.
const PROP_REACH = 1.5;

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
	Math.hypot(a.x - b.x, a.z - b.z);
const angleOf = (p: { x: number; z: number }) => Math.atan2(p.z - fire.z, p.x - fire.x);

describe("village campfire layout", () => {
	it("stands every stone past the fire from the audience, beyond the clearing's rim", () => {
		for (const preset of [rules, loadVillageRules("museum")]) {
			for (const stone of preset.stones) {
				expect(isBehindFireFromAudience(stone, preset), stone.sequenceId).toBe(true);
			}
			expect(isBehindFireFromAudience(preset.visitor.stone, preset), "visitor").toBe(true);
		}
		// The old spots beside the audience, and a point in front of the fire, fail.
		expect(isBehindFireFromAudience({ x: 8.08, z: 2.94 }, rules)).toBe(false);
		expect(isBehindFireFromAudience({ x: 0, z: 4 }, rules)).toBe(false);
		// Past the fire but inside the clearing, where people walk, fails too.
		expect(isBehindFireFromAudience({ x: 0, z: -6 }, rules)).toBe(false);
		// The lesson pair must stand nearer than any stone.
		for (const stone of rules.stones) {
			expect(distance(stone, layout.audience)).toBeGreaterThan(
				fire.audienceDistance + rules.arena.radius,
			);
		}
	});

	it("seats people exactly where the campsite model puts its chairs", () => {
		const zone = campsiteLayout.communalZone;
		expect(fire.seatRadius).toBe(zone.seatRadius);
		expect(fire.seatAnglesDegrees).toEqual(zone.chairAnglesDegrees);
		expect(fire.clearRadius).toBe(campsiteLayout.fire.clearedFuelRadius);
		for (const seat of layout.seats) {
			expect(distance(seat, fire)).toBeCloseTo(zone.seatRadius, 6);
			// Facing the fire: a step forward goes toward the centre.
			const ahead = { x: seat.x + Math.cos(seat.facing), z: seat.z + Math.sin(seat.facing) };
			expect(distance(ahead, fire)).toBeLessThan(distance(seat, fire));
		}
	});

	it("keeps a performer's prop clear of the seats, the fire and the clearing's edge", () => {
		expect(fire.ringInnerRadius - PROP_REACH).toBeGreaterThan(fire.seatRadius);
		expect(fire.ringOuterRadius).toBeLessThanOrEqual(rules.arena.radius);
	});

	it("gives every performer a lane wide enough for two props, outside the audience's view", () => {
		const museum = loadVillageRules("museum");
		expect(layout.lanes.length).toBeGreaterThanOrEqual(museum.population.target);
		for (const lane of layout.lanes) {
			expect(isInAudienceGap(lane.angle, fire)).toBe(false);
			const r = distance(lane, fire);
			expect(r).toBeGreaterThan(fire.ringInnerRadius);
			expect(r).toBeLessThan(fire.ringOuterRadius);
		}
		const sorted = [...layout.lanes].sort((a, b) => a.angle - b.angle);
		for (let i = 1; i < sorted.length; i++) {
			expect(distance(sorted[i]!, sorted[i - 1]!)).toBeGreaterThanOrEqual(2 * PROP_REACH);
		}
		expect(distance(layout.audience, fire)).toBeGreaterThan(fire.ringOuterRadius + PROP_REACH);
	});

	it("stands each stone outside the performers' reach, off the audience's line, and not on one ring", () => {
		const radii = rules.stones.map((stone) => distance(stone, fire));
		for (const stone of rules.stones) {
			expect(distance(stone, fire)).toBeGreaterThan(fire.ringOuterRadius + PROP_REACH);
			expect(isInAudienceGap(angleOf(stone), fire)).toBe(false);
		}
		expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.5);
		expect(new Set(rules.stones.map((s) => s.colour)).size).toBe(rules.stones.length);
	});

	it("stands the visitor's stone behind the founders' four, clear of each, in its own colour", () => {
		const visitor = rules.visitor.stone;
		expect(distance(visitor, fire)).toBeGreaterThan(Math.max(...rules.stones.map((s) => distance(s, fire))));
		for (const stone of rules.stones) {
			expect(distance(visitor, stone), stone.sequenceId).toBeGreaterThan(1.5);
		}
		expect(isInAudienceGap(angleOf(visitor), fire)).toBe(false);
		expect(rules.stones.map((s) => s.colour)).not.toContain(visitor.colour);
	});

	it("colours a variation like its seed", () => {
		const seed = rules.seedSequenceIds[0]!;
		expect(sequenceColour(rules, `${seed}:mirror`)).toBe(sequenceColour(rules, seed));
		expect(sequenceColour(rules, "not-a-seed")).toBeNull();
	});

	it("walks someone round the fire, never through it", () => {
		let at = { x: fire.x + 5.6, z: fire.z };
		const target = { x: fire.x - 5.6, z: fire.z + 0.01 };
		const step = rules.movement.stepPerTick;
		let closest = Infinity;
		for (let i = 0; i < 200 && distance(at, target) > step; i++) {
			const dx = target.x - at.x;
			const dz = target.z - at.z;
			const len = Math.hypot(dx, dz);
			at = keepToClearing(
				{ x: at.x + (dx / len) * step, z: at.z + (dz / len) * step },
				target,
				step,
				rules,
			);
			closest = Math.min(closest, distance(at, fire));
		}
		expect(distance(at, target)).toBeLessThanOrEqual(step);
		expect(closest).toBeGreaterThanOrEqual(fire.ringInnerRadius - 1e-9);
	});

	it("meets a lesson pair side by side on the ring, never in the audience's view", () => {
		const spacing = rules.movement.personalSpaceRadius;
		// Straight across the fire, and both right in front of the audience.
		const pairs = [
			[{ x: 5.6, z: 0 }, { x: -5.6, z: 0 }],
			[{ x: -1, z: 5.6 }, { x: 1, z: 5.6 }],
		];
		for (const [a, b] of pairs) {
			const [spotA, spotB] = lessonSpots(a!, b!, spacing, rules);
			expect(distance(spotA, spotB)).toBeCloseTo(spacing, 1);
			for (const spot of [spotA, spotB]) {
				const r = distance(spot, fire);
				expect(r).toBeGreaterThan(fire.ringInnerRadius);
				expect(r).toBeLessThan(fire.ringOuterRadius);
				expect(isInAudienceGap(angleOf(spot), fire)).toBe(false);
			}
		}
	});

	it("keeps everyone out of the fire and anyone playing in the ring, over a long run", () => {
		const museum = loadVillageRules("museum");
		const sim = new VillageOrchestrator({ rules: museum, seed: "campfire-ring", avatarModels: ["x-bot"] });
		const playing = new Set(["teaching", "learning", "performing", "practicing"]);
		const slack = museum.movement.arrivalThreshold + 0.05;
		for (let t = 0; t < museum.population.lifespanTicks * 3; t++) {
			const snapshot = sim.tick();
			for (const avatar of snapshot.avatars) {
				const r = distance(avatar, fire);
				// Elders sit by the fire and their students stand near them;
				// nobody walks into it.
				expect(r).toBeGreaterThanOrEqual(fire.clearRadius - 1e-9);
				expect(r).toBeLessThanOrEqual(museum.arena.radius + 1e-9);
				if (playing.has(avatar.state)) {
					expect(r).toBeGreaterThanOrEqual(fire.ringInnerRadius - 1e-9);
					expect(r).toBeLessThanOrEqual(fire.ringOuterRadius + slack);
				}
			}
		}
	});

	it("exposes the fire, seats and audience spot in every snapshot", () => {
		const sim = new VillageOrchestrator({ rules, seed: "campfire-snapshot", avatarModels: ["x-bot"] });
		const { campfire, stones } = sim.tick().world;
		expect(campfire.seats).toEqual(layout.seats);
		expect({ x: campfire.x, z: campfire.z }).toEqual({ x: fire.x, z: fire.z });
		expect(campfire.audience).toEqual(layout.audience);
		expect(stones.map((s) => [s.sequenceId, s.x, s.z, s.colour])).toEqual(
			rules.stones.map((s) => [s.sequenceId, s.x, s.z, s.colour]),
		);
		// Plain data: survives a round trip through JSON unchanged.
		expect(JSON.parse(JSON.stringify(campfire))).toEqual(campfire);
	});

	it("rejects a stone list that misses a seed or a bad colour", () => {
		const { presets: _p, ...base } = structuredClone(rulesJson) as Record<string, any>;
		const missing = structuredClone(base);
		missing.stones.pop();
		expect(() => parseVillageRules(missing)).toThrow(VillageRulesError);
		const badColour = structuredClone(base);
		badColour.stones[0].colour = "gold";
		expect(() => parseVillageRules(badColour)).toThrow(VillageRulesError);
		const inverted = structuredClone(base);
		inverted.campfire.ringInnerRadius = 9;
		expect(() => parseVillageRules(inverted)).toThrow(VillageRulesError);
	});
});
