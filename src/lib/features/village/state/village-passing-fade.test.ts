import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { PASSING_FADE_SECONDS, passingFade, passingWindowSeconds } from "./village-passing-fade";

describe("passing fade", () => {
	it.each([
		["the lab", loadVillageRules()],
		["the museum", loadVillageRules("museum")],
	])("lets the glow go and then the full body fade finish at 1x in %s", (_label, rules) => {
		const window = passingWindowSeconds(rules.population.passingTicks, rules.ticksPerSecond, 1);
		const glowGone = passingFade(0.4, window);
		expect(glowGone.glow).toBe(0);
		expect(glowGone.body).toBe(1);
		// The body takes its full time and is gone before the sim removes it.
		expect(passingFade(0.4 + PASSING_FADE_SECONDS * 0.99, window).body).toBeGreaterThan(0);
		expect(passingFade(0.4 + PASSING_FADE_SECONDS, window).body).toBe(0);
		expect(0.4 + PASSING_FADE_SECONDS).toBeLessThan(window);
	});

	it("still finishes inside the window when the village runs fast", () => {
		const rules = loadVillageRules();
		for (const speed of [2, 5, 10]) {
			const window = passingWindowSeconds(rules.population.passingTicks, rules.ticksPerSecond, speed);
			expect(passingFade(window * 0.85, window)).toEqual({ glow: 0, body: 0 });
		}
	});
});
