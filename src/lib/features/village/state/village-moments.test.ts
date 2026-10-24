/**
 * Village moments (village-moments.ts) from the museum's seeded opening: each
 * opening moment fires once, in order, and the passing lands when the teacher
 * starts to pass.
 */

import { describe, expect, it } from "vitest";
import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";
import { loadVillageRules } from "../domain/village-rules";
import { VillageOrchestrator } from "../engine/village-orchestrator";
import { createVillageMomentTracker, type VillageMoment } from "./village-moments";

const rules = loadVillageRules("museum");

function runMuseumOpening(seconds = 150): { moments: VillageMoment[]; sim: VillageOrchestrator } {
	const sim = new VillageOrchestrator({
		rules,
		seed: "museum-village",
		avatarModels: DEPLOYED_CHARACTER_IDS,
		opening: true,
	});
	const track = createVillageMomentTracker(rules.seedSequenceIds);
	const moments = track(sim.snapshot.events, sim.snapshot);
	for (let i = 0; i < seconds * rules.ticksPerSecond; i++) {
		const next = sim.tick();
		moments.push(...track(next.events, next));
	}
	return { moments, sim };
}

describe("village moments", () => {
	const entry = new VillageOrchestrator({
		rules,
		seed: "museum-village",
		avatarModels: DEPLOYED_CHARACTER_IDS,
		opening: true,
	}).snapshot;
	const { moments } = runMuseumOpening();

	it("reports the opening's start, recognition and passing once each, in order", () => {
		const opening = moments.filter((m) => m.kind.startsWith("opening:")).map((m) => m.kind);
		expect(opening).toEqual(["opening:started", "opening:recognition", "opening:passing"]);
		expect(moments[0]).toEqual({ kind: "opening:started", tick: entry.world.tick });
	});

	it("puts the opening teacher's passing before anyone else's", () => {
		const passings = moments.filter((m) => m.kind === "opening:passing" || m.kind === "passing");
		expect(passings[0]!.kind).toBe("opening:passing");
		expect(passings[0]!.avatarId).toBe(entry.world.opening!.teacherId);
	});
});
