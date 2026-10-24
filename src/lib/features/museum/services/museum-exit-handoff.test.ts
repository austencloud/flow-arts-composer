/**
 * The gift-shop exit leaves with what the visitor carries, named by whom they
 * taught it to, and with the spiral when the pocket is empty.
 */

import { describe, expect, it } from "vitest";
import {
	ARCHIVE_EXIT_NAME,
	chooseExitHandoff,
	exitSequenceName,
	visitorLearnerName,
} from "./museum-exit-handoff";

const SPIRAL = "gallery-spiral-seq";
const OOGA = { sequenceId: "codex-ooga-seq", label: "OOGA" };

function avatar(name: string, sequenceId: string, learnedFrom: string | null) {
	return {
		name,
		knownSequences: [
			{ sequenceId, proficiency: 1, source: "taught" as const, learnedFrom, lastUsedTick: 0 },
		],
	};
}

describe("exitSequenceName", () => {
	it("names the learner once the visitor has taught it", () => {
		expect(exitSequenceName("OOGA", "Reed")).toBe("OOGA, taught to Reed");
	});

	it("is the Archive's name before anyone learned it", () => {
		expect(exitSequenceName("OOGA", null)).toBe(ARCHIVE_EXIT_NAME);
	});

	it("shows a repeated word simplified", () => {
		expect(exitSequenceName("OOGAOOGA", "Reed")).toBe("OOGA, taught to Reed");
	});
});

describe("chooseExitHandoff", () => {
	it("hands over the pocket's sequence, named by lineage", () => {
		expect(chooseExitHandoff({ pocket: OOGA, exitSequenceId: SPIRAL, learnerName: "Reed" })).toEqual(
			{ sequenceId: "codex-ooga-seq", name: "OOGA, taught to Reed" },
		);
	});

	it("hands over an untaught pocket as from the Archive", () => {
		expect(chooseExitHandoff({ pocket: OOGA, exitSequenceId: SPIRAL, learnerName: null })).toEqual({
			sequenceId: "codex-ooga-seq",
			name: ARCHIVE_EXIT_NAME,
		});
	});

	it("falls back to the spiral when the pocket is empty", () => {
		expect(chooseExitHandoff({ pocket: null, exitSequenceId: SPIRAL, learnerName: "Reed" })).toEqual(
			{ sequenceId: SPIRAL, name: ARCHIVE_EXIT_NAME },
		);
	});

	it("falls back to the spiral for a sequence the museum cannot build", () => {
		const pocket = { sequenceId: "not-an-exhibit", label: "ABC" };
		expect(chooseExitHandoff({ pocket, exitSequenceId: SPIRAL, learnerName: "Reed" }).sequenceId).toBe(
			SPIRAL,
		);
	});
});

describe("visitorLearnerName", () => {
	it("finds the living villager who learned it from the visitor", () => {
		const avatars = [
			avatar("Ash", "codex-ooga-seq", "avatar-3"),
			avatar("Reed", "codex-ooga-seq", "visitor"),
		];
		expect(visitorLearnerName(avatars, "codex-ooga-seq")).toBe("Reed");
	});

	it("falls back to the name heard when the lesson finished", () => {
		const avatars = [avatar("Ash", "codex-ooga-seq", "avatar-3")];
		expect(visitorLearnerName(avatars, "codex-ooga-seq", ["Reed"])).toBe("Reed");
	});

	it("is null when the visitor taught nobody that sequence", () => {
		const avatars = [avatar("Reed", "other-seq", "visitor")];
		expect(visitorLearnerName(avatars, "codex-ooga-seq")).toBeNull();
	});
});
