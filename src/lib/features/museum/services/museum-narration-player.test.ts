/**
 * K's second line in the Room of Collaboration waits for the opening
 * teacher's passing, driven by the museum's seeded opening.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";
import { loadVillageRules } from "#lib/features/village/domain/village-rules.js";
import { VillageOrchestrator } from "#lib/features/village/engine/village-orchestrator.js";
import { createVillageMomentTracker } from "#lib/features/village/state/village-moments.js";
import { MuseumNarrationPlayer } from "./museum-narration-player.svelte";

const rules = loadVillageRules("museum");
const TICK_MS = 1000 / rules.ticksPerSecond;
const SECOND_LINE = "The Order had a name for this room too. I threw it out.";

/** Run the seeded opening tick by tick in real (fake) time, feeding its
 * moments to the player. Returns each caption seen with the moments so far. */
function playOpening(player: MuseumNarrationPlayer, seconds = 150) {
	const sim = new VillageOrchestrator({
		rules,
		seed: "museum-village",
		avatarModels: DEPLOYED_CHARACTER_IDS,
		opening: true,
	});
	const track = createVillageMomentTracker(rules.seedSequenceIds);
	const heard: string[] = [];
	const seen: Array<{ line: string; heard: string[] }> = [];
	const look = () => {
		const line = player.current?.line;
		if (line && seen.at(-1)?.line !== line) seen.push({ line, heard: [...heard] });
	};
	const feed = (moments: ReturnType<typeof track>) => {
		for (const moment of moments) {
			heard.push(moment.kind);
			player.villageMoment(moment.kind);
		}
		look();
	};
	feed(track(sim.snapshot.events, sim.snapshot));
	for (let i = 0; i < seconds * rules.ticksPerSecond; i++) {
		vi.advanceTimersByTime(TICK_MS);
		const next = sim.tick();
		feed(track(next.events, next));
	}
	return seen;
}

describe("narration on village moments", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("plays K's second line as the opening teacher passes, not before", () => {
		const player = new MuseumNarrationPlayer();
		player.enterRoom("collaboration");
		const seen = playOpening(player);

		expect(seen.map((s) => s.line)).toEqual(["Go on. Outside.", SECOND_LINE]);
		const second = seen[1]!;
		expect(second.heard.at(-1)).toBe("opening:passing");
		expect(second.heard).toContain("opening:recognition");
	});

	it("stays quiet when the passing happens while the visitor is elsewhere", () => {
		const player = new MuseumNarrationPlayer();
		player.enterRoom("gift-shop");
		const seen = playOpening(player);
		expect(seen.map((s) => s.line)).not.toContain(SECOND_LINE);
	});
});

describe("narration names what the visitor carries", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("plays K's carried line with the pocket's word", () => {
		let carried: string | undefined = "ZEPHYR";
		const player = new MuseumNarrationPlayer(undefined, () => carried);
		player.enterRoom("collaboration");
		player.skip();
		player.villageMoment("visitor:taught");
		expect(player.current?.line).toBe("There. ZEPHYR is in two people now.");

		carried = undefined;
		const plain = new MuseumNarrationPlayer(undefined, () => carried);
		plain.enterRoom("collaboration");
		plain.skip();
		plain.villageMoment("visitor:taught");
		expect(plain.current?.line).toBe("There. Now it's in two people.");
	});
});
