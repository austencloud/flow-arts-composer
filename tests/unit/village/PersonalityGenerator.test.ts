import { describe, it, expect } from "vitest";
import { generatePersonality } from "#lib/features/village/services/personality-generator.js";

describe("PersonalityGenerator", () => {
	it("generates all five traits", () => {
		const personality = generatePersonality(0.5, 0.15);
		expect(personality).toHaveProperty("learnSpeed");
		expect(personality).toHaveProperty("sociability");
		expect(personality).toHaveProperty("creativity");
		expect(personality).toHaveProperty("patience");
		expect(personality).toHaveProperty("curiosity");
	});

	it("clamps all traits between 0 and 1", () => {
		for (let i = 0; i < 100; i++) {
			const personality = generatePersonality(0.5, 0.5);
			for (const value of Object.values(personality)) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
		}
	});

	it("produces varied traits (not all identical)", () => {
		const personality = generatePersonality(0.5, 0.15);
		const values = Object.values(personality);
		const allSame = values.every((v) => v === values[0]);
		expect(allSame).toBe(false);
	});

	it("respects mean — high mean produces higher average traits", () => {
		let highSum = 0;
		let lowSum = 0;
		const runs = 200;
		for (let i = 0; i < runs; i++) {
			const high = generatePersonality(0.8, 0.1);
			const low = generatePersonality(0.2, 0.1);
			highSum += Object.values(high).reduce((a, b) => a + b, 0);
			lowSum += Object.values(low).reduce((a, b) => a + b, 0);
		}
		expect(highSum / runs).toBeGreaterThan(lowSum / runs);
	});
});
