/**
 * The village cue list (village-sound-cues.json) covers every opening moment
 * and visitor moment with small, well-formed cues.
 */

import { describe, expect, it } from "vitest";
import { VILLAGE_MOMENTS } from "#lib/features/village/state/village-moments.js";
import cueTable from "./village-sound-cues.json";
import { VILLAGE_SOUND_EFFECTS, cuesForMoment } from "./village-sound-cues";

describe("village sound cues", () => {
	it("maps every village moment", () => {
		for (const moment of VILLAGE_MOMENTS) {
			expect(cuesForMoment(moment).length, moment).toBeGreaterThan(0);
		}
	});

	it("names only known moments and effects, at quiet levels with sane times", () => {
		for (const cue of cueTable.cues) {
			expect(VILLAGE_MOMENTS).toContain(cue.moment);
			expect(VILLAGE_SOUND_EFFECTS).toContain(cue.effect);
			expect(cue.level).toBeGreaterThan(0);
			expect(cue.level).toBeLessThanOrEqual(0.6);
			for (const seconds of [cue.attack, cue.hold, cue.release]) {
				expect(seconds).toBeGreaterThanOrEqual(0);
				expect(seconds).toBeLessThanOrEqual(10);
			}
		}
	});

	it("is plain JSON, so another engine can read it unchanged", () => {
		expect(JSON.parse(JSON.stringify(cueTable))).toEqual(cueTable);
	});
});
