import { describe, expect, it } from "vitest";
import type { VillageEvent } from "../domain/village-types";
import { describeVillageEvents, lossCaption, type VillageStoryContext } from "./village-story";

const names: Record<string, string> = { a1: "Wren", a2: "Birch", a3: "Moss" };
const ctx = (knew: Record<string, string[]> = {}): VillageStoryContext => ({
	nameOf: (id) => names[id] ?? "Someone",
	wordOf: (id) => (id.startsWith("seed-a") ? "ABAB" : "DCBA"),
	knewBefore: (id) => knew[id] ?? [],
	isSeed: (id) => !id.includes(":"),
});

describe("village story", () => {
	it("tells a lesson, a variation and a birth in plain words", () => {
		const events: VillageEvent[] = [
			{ type: "teaching:completed", tick: 1, teacherId: "a1", learnerId: "a2", sequenceId: "seed-a" },
			{ type: "sequence:invented", tick: 2, avatarId: "a2", sequenceId: "seed-a:mirror" },
			{ type: "entity:born", tick: 3, avatarId: "a3", generation: 2 },
			{ type: "sequence:inherited", tick: 3, avatarId: "a3", elderId: "a1", sequenceId: "seed-a:rewind" },
		];
		expect(describeVillageEvents(events, ctx()).map((l) => l.text)).toEqual([
			"Wren taught Birch the sequence ABAB.",
			"Birch made up a mirrored ABAB.",
			"Moss was born knowing ABAB played backwards, from Wren.",
		]);
	});

	it("says whether a founding sequence died with its last carrier or was forgotten", () => {
		const died: VillageEvent[] = [
			{ type: "entity:died", tick: 9, avatarId: "a1", x: 0, z: 0 },
			{ type: "sequence:extinct", tick: 9, sequenceId: "seed-b" },
		];
		const lines = describeVillageEvents(died, ctx({ a1: ["seed-b"] }));
		expect(lines.map((l) => l.text)).toEqual([
			"Wren has died.",
			"The last person who knew DCBA has died.",
		]);
		expect(lines[1]!.kind).toBe("loss");

		const forgotten = describeVillageEvents([died[1]!], ctx());
		expect(forgotten[0]!.text).toBe("Nobody remembers DCBA now.");
		expect(lossCaption("DCBA")).toBe("Nobody learned DCBA in time.");
	});
});

describe("village story, for what the visitor brought", () => {
	const yours = (): VillageStoryContext => ({
		...ctx({ a1: ["ooga"] }),
		wordOf: (id) => (id === "ooga" ? "OOGA" : "ABAB"),
		isSeed: () => false,
		fromVisitor: (id) => id === "ooga",
	});

	it("speaks to the visitor about their lesson, its spread and its end", () => {
		const events: VillageEvent[] = [
			{ type: "teaching:completed", tick: 1, teacherId: "visitor", learnerId: "a1", sequenceId: "ooga" },
			{ type: "monument:placed", tick: 1, sequenceId: "ooga", x: 0, z: -9.9 },
			{ type: "teaching:completed", tick: 5, teacherId: "a1", learnerId: "a2", sequenceId: "ooga" },
			{ type: "entity:died", tick: 9, avatarId: "a1", x: 0, z: 0 },
			{ type: "sequence:extinct", tick: 9, sequenceId: "ooga" },
			{ type: "sequence:extinct", tick: 12, sequenceId: "ooga" },
		];
		expect(describeVillageEvents(events, yours()).map((l) => l.text)).toEqual([
			"Wren learned OOGA from you.",
			"A stone is lit for OOGA.",
			"Wren taught Birch OOGA, which you brought.",
			"Wren has died.",
			"The last person who knew OOGA, which you brought, has died.",
			"Nobody remembers OOGA, which you brought.",
		]);
	});
});
