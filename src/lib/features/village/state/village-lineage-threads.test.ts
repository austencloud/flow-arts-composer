import { describe, expect, it } from "vitest";
import type { VillageAvatarSnapshot } from "../engine/village-snapshot";
import {
	elderGlows,
	lineageGlows,
	lineageThreadOpacity,
	updateLineageThreads,
	LINEAGE_THREAD_LINGER_SECONDS as LINGER,
} from "./village-lineage-threads";

const colourOf = (id: string) => (id.startsWith("seed-a") ? "#e9c46a" : null);

function avatar(
	id: string,
	x: number,
	options: { learnedFrom?: string; state?: VillageAvatarSnapshot["state"] } = {},
): VillageAvatarSnapshot {
	const knownSequences = options.learnedFrom
		? [
				{
					sequenceId: "seed-a:mirror",
					proficiency: 0.8,
					source: "taught" as const,
					learnedFrom: options.learnedFrom,
					lastUsedTick: 0,
				},
			]
		: [];
	return {
		id,
		x,
		z: 0,
		state: options.state ?? "idle",
		knownSequences,
		knownSequenceIds: knownSequences.map((k) => k.sequenceId),
	} as VillageAvatarSnapshot;
}

describe("lineage threads", () => {
	it("appears while both live, lingers where the teacher fell, then is gone", () => {
		const teacher = avatar("wren", 5);
		const learner = avatar("birch", -5, { learnedFrom: "wren" });

		let threads = updateLineageThreads([], [teacher, learner], colourOf, 0);
		expect(threads).toHaveLength(1);
		expect(threads[0]).toMatchObject({ learnerId: "birch", teacherId: "wren", colour: "#e9c46a" });
		expect(lineageThreadOpacity(threads[0]!, 0)).toBe(1);
		expect(lineageGlows([teacher, learner], colourOf).size).toBe(0);

		// The teacher starts passing at t=10, then is removed from the village.
		threads = updateLineageThreads(threads, [{ ...teacher, x: 6, state: "passing" }, learner], colourOf, 10);
		expect(threads[0]!.fadingSince).toBe(10);
		threads = updateLineageThreads(threads, [learner], colourOf, 11);
		expect(threads).toHaveLength(1);
		expect(threads[0]).toMatchObject({ teacherX: 6, fadingSince: 10 });
		expect(lineageThreadOpacity(threads[0]!, 10 + LINGER / 2)).toBeCloseTo(0.5);
		expect(lineageGlows([learner], colourOf).get("birch")).toBe("#e9c46a");

		threads = updateLineageThreads(threads, [learner], colourOf, 10 + LINGER);
		expect(threads).toHaveLength(0);
		// The learner keeps the glow after the thread is gone.
		expect(lineageGlows([learner], colourOf).get("birch")).toBe("#e9c46a");
	});

	it("draws nothing for a teacher who was gone before the pair was ever seen", () => {
		const learner = avatar("birch", -5, { learnedFrom: "wren" });
		expect(updateLineageThreads([], [learner], colourOf, 0)).toHaveLength(0);
	});

	it("drops a thread at once when the learner dies, and ignores founders' seeds", () => {
		const teacher = avatar("wren", 5);
		const learner = avatar("birch", -5, { learnedFrom: "wren" });
		const threads = updateLineageThreads([], [teacher, learner], colourOf, 0);
		expect(
			updateLineageThreads(threads, [teacher, { ...learner, state: "passing" }], colourOf, 1),
		).toHaveLength(0);
		expect(updateLineageThreads([], [teacher, avatar("moss", 0)], colourOf, 0)).toHaveLength(0);
	});

	it("lights an elder by the fire in the colour of what they know best, until they are gone", () => {
		const colours = (id: string) => (id.startsWith("seed-a") ? "#e9c46a" : id.startsWith("seed-b") ? "#5cc8b8" : null);
		const knows = (state: VillageAvatarSnapshot["state"]) => ({
			...avatar("ash", 3, { state }),
			knownSequences: [
				{ sequenceId: "seed-a", proficiency: 0.4, source: "seed" as const, learnedFrom: null, lastUsedTick: 0 },
				{ sequenceId: "seed-b:flip", proficiency: 0.9, source: "taught" as const, learnedFrom: "x", lastUsedTick: 0 },
			],
		});
		for (const state of ["retiring", "seated", "passing"] as const) {
			expect(elderGlows([knows(state)], colours).get("ash")).toBe("#5cc8b8");
		}
		expect(elderGlows([knows("idle")], colours).size).toBe(0);
	});
});

describe("lineage threads to the visitor", () => {
	const learner = avatar("reed", -2, { learnedFrom: "visitor" });

	it("reach the visitor while they are in the room, then go dark, and leave no glow", () => {
		let threads = updateLineageThreads([], [learner], colourOf, 0, { visitor: { x: 1, z: 2 } });
		expect(threads).toHaveLength(1);
		expect(threads[0]).toMatchObject({ teacherId: "visitor", teacherX: 1, teacherZ: 2, fadingSince: null });

		threads = updateLineageThreads(threads, [learner], colourOf, 3, { visitor: { x: 4, z: 0 } });
		expect(threads[0]).toMatchObject({ teacherX: 4, teacherZ: 0 });

		// They leave: the thread holds where they last stood and fades.
		threads = updateLineageThreads(threads, [learner], colourOf, 5);
		expect(threads[0]).toMatchObject({ teacherX: 4, fadingSince: 5 });
		expect(lineageThreadOpacity(threads[0]!, 5 + LINGER / 2)).toBeCloseTo(0.5);
		expect(updateLineageThreads(threads, [learner], colourOf, 5 + LINGER)).toHaveLength(0);

		expect(lineageGlows([learner], colourOf).size).toBe(0);
	});

	it("never appear for a visitor who was not in the room", () => {
		expect(updateLineageThreads([], [learner], colourOf, 0)).toHaveLength(0);
	});
});
