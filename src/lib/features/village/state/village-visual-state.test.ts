/**
 * What the room shows for the visitor's gift (village-visual-state.svelte.ts):
 * the sequence goes by the word the visitor carried in, not the exhibit's
 * full spelling, and a lesson from the visitor hangs the taught caption by
 * the visitor's stone.
 */

import { describe, expect, it } from "vitest";
import { loadVillageRules } from "../domain/village-rules";
import { createVillageState } from "./village-state.svelte";
import { createVillageVisualState, followVillage, villageWord } from "./village-visual-state.svelte";

const rules = loadVillageRules("museum");
const OOGA = rules.visitor.sequences[0]!.sequenceId;
const FRAME = 1 / 60;

describe("villageWord", () => {
	it("names the visitor's sequence and its variations by the decode reveal", () => {
		expect(villageWord(OOGA)).toBe("OOGA");
		expect(villageWord(`${OOGA}:mirror`)).toBe("OOGA");
	});

	it("leaves founding sequences on their seed word", () => {
		const seed = rules.seedSequenceIds[0]!;
		expect(villageWord(seed)).not.toBe("a sequence");
		expect(villageWord(seed)).not.toBe("OOGA");
	});
});

describe("the taught caption", () => {
	it("hangs the story's own line by the visitor's stone when the lesson completes", () => {
		const village = createVillageState({ rules, seed: "museum-village", opening: false });
		const visual = createVillageVisualState();
		followVillage(village, visual);
		const learner = village.snapshot.avatars.find(
			(a) =>
				a.state !== "passing" &&
				a.state !== "retiring" &&
				a.state !== "seated" &&
				!a.knownSequenceIds.includes(OOGA),
		)!;
		expect(
			village.teachFromVisitor({
				learnerId: learner.id,
				sequenceId: OOGA,
				x: learner.x + 1.5,
				z: learner.z,
				facing: Math.PI,
			}),
		).toBe(true);
		village.start();
		// The motion wait (no catalogue here) plus the lesson.
		for (let i = 0; i < 60 * 40 && visual.caption?.kind !== "taught"; i++) village.advance(FRAME);

		const caption = visual.caption;
		expect(caption?.kind).toBe("taught");
		expect(caption?.text).toBe(`${learner.name} learned OOGA from you.`);
		const stone = village.snapshot.world.stones.find((s) => s.fromVisitor);
		expect(stone).toBeDefined();
		expect(caption).toMatchObject({ x: stone!.x, z: stone!.z, sequenceId: OOGA });
		expect(visual.story.some((line) => line.text.includes("OOYGDA"))).toBe(false);
		village.destroy();
	});
});
