/**
 * The village ambience's mix and seeded loops (village-ambience.ts): the fire
 * is louder and brighter near it, never gone, and the loops repeat exactly.
 */

import { describe, expect, it } from "vitest";
import { crackleSamples, cricketSamples, villageAmbienceMix } from "./village-ambience";

describe("village ambience mix", () => {
	it("is louder and brighter near the fire", () => {
		const near = villageAmbienceMix(1);
		const middle = villageAmbienceMix(8);
		const far = villageAmbienceMix(20);
		expect(near.fireGain).toBeGreaterThan(middle.fireGain);
		expect(middle.fireGain).toBeGreaterThan(far.fireGain);
		expect(near.fireLowpassHz).toBeGreaterThan(far.fireLowpassHz);
		expect(far.fireGain).toBeGreaterThan(0);
		expect(villageAmbienceMix(500).fireGain).toBeGreaterThan(0);
	});

	it("keeps the night bed quieter than the fire up close, and steady", () => {
		const near = villageAmbienceMix(1);
		const far = villageAmbienceMix(20);
		expect(near.nightGain).toBeLessThan(near.fireGain);
		expect(far.nightGain / near.nightGain).toBeLessThan(1.4);
	});
});

describe("village ambience loops", () => {
	it("are seeded, bounded and not silent", () => {
		for (const make of [crackleSamples, cricketSamples]) {
			const a = make(8000);
			expect(make(8000)).toEqual(a);
			let peak = 0;
			for (const s of a) peak = Math.max(peak, Math.abs(s));
			expect(peak).toBeGreaterThan(0.1);
			expect(peak).toBeLessThanOrEqual(1.2);
		}
	});
});
