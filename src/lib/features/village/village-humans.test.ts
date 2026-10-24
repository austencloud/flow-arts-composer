/**
 * The village draws its people only from the human characters: no grey
 * mannequin or see-through X Bot, no creature, across many villages and
 * their births, and the museum preloads exactly that list.
 */

import { describe, expect, it } from "vitest";
import {
	HUMAN_CHARACTER_IDS,
	humanCharacterFor,
} from "#lib/shared/3d/performers/human-character-roster.js";
import { VISITOR_ID } from "./domain/village-types";
import { VILLAGE_AVATAR_MODELS } from "#lib/features/museum/services/museum-village-manager.js";
import { loadVillageRules } from "./domain/village-rules";
import { createVillageState } from "./state/village-state.svelte";

const humans = new Set<string>(HUMAN_CHARACTER_IDS);

describe("village people", () => {
	it("are only humans across 20 seeds, births included", () => {
		const rules = loadVillageRules("museum");
		const worn = new Set<string>();
		let births = 0;
		for (let i = 1; i <= 20; i++) {
			const village = createVillageState({ rules, seed: `village-lab-${i}`, opening: false });
			const seen = new Set<string>();
			village.setSpeed(20);
			village.start();
			// About 2,000 ticks: past the founders' lifespans, so newborns show.
			for (let frame = 0; frame < 45; frame++) {
				village.advance(0.25);
				for (const avatar of village.snapshot.avatars) {
					seen.add(avatar.id);
					worn.add(avatar.modelId);
				}
			}
			births += seen.size;
			village.destroy();
		}
		expect(births).toBeGreaterThan(20 * 6);
		for (const model of worn) expect(humans, model).toContain(model);
	});

	it("preloads the same list the village draws from", () => {
		expect([...VILLAGE_AVATAR_MODELS]).toEqual([...HUMAN_CHARACTER_IDS]);
	});

	it("gives the visitor a human body, the same one every time", () => {
		const body = humanCharacterFor(VISITOR_ID);
		expect(humans).toContain(body);
		expect(humanCharacterFor(VISITOR_ID)).toBe(body);
		// The pick spreads over the roster rather than always landing on one.
		const picks = new Set(Array.from({ length: 60 }, (_, i) => humanCharacterFor(`key-${i}`)));
		expect(picks.size).toBeGreaterThan(HUMAN_CHARACTER_IDS.length / 2);
	});
});
