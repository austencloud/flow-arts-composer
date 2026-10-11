import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VULCAN_CAVE_WINGS } from "#lib/features/museum/data/wing-declarations/vulcan-cave-wings.js";
import type { WingDeclaration } from "#lib/features/museum/data/wing-declarations/types.js";
import {
	validateWingDeclarations,
	type WingValidationContext,
} from "#lib/features/museum/data/wing-declarations/validate-wing-declarations.js";
import { RAW_MUSEUM_SEQUENCES } from "#lib/features/museum/data/museum-exhibit-sequences.js";
import { VULCAN_CAVE_ROOMS } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";

function buildContext(): WingValidationContext {
	const catalog = JSON.parse(
		readFileSync(resolve("static/data/hero/tnd-base-words.json"), "utf8")
	);
	const performersByRoom = Object.fromEntries(
		VULCAN_CAVE_ROOMS.map((room) => [
			room.id,
			(room.performers ?? []).map((performer) => performer.refId),
		])
	);
	return { catalog, rawSequences: RAW_MUSEUM_SEQUENCES, performersByRoom };
}

/** Deep-copies the manifests so mutation tests never touch the real data. */
function cloneWings(): WingDeclaration[] {
	return structuredClone(VULCAN_CAVE_WINGS) as WingDeclaration[];
}

describe("wing declaration grammar", () => {
	const context = buildContext();

	it("all six Vulcan Cave wings validate with zero errors", () => {
		const findings = validateWingDeclarations(VULCAN_CAVE_WINGS, context);
		const errors = findings.filter((finding) => finding.level === "error");
		expect(errors).toEqual([]);
	});

	it("every showcase station resolves today — only opener/viewpoint/ensemble may be pending", () => {
		const findings = validateWingDeclarations(VULCAN_CAVE_WINGS, context);
		expect(
			findings.filter((finding) => finding.code === "showcase-pending")
		).toEqual([]);
		for (const finding of findings.filter((f) => f.level === "pending")) {
			expect(finding.code).toBe("station-pending");
		}
	});

	it("rejects a case whose word disagrees with its catalog row", () => {
		const wings = cloneWings();
		wings[0]!.beats[2].cases[0]!.word = "BBBB";
		const findings = validateWingDeclarations(wings, context);
		expect(findings.some((f) => f.code === "word-mismatch")).toBe(true);
	});

	it("rejects a museum sequence that drifts from the catalog", () => {
		const wings = cloneWings();
		const drifted = structuredClone(RAW_MUSEUM_SEQUENCES);
		drifted["cave-water-seq-a"]!.steps[1]!.leftMotion.rotationDirection = "ccw";
		const findings = validateWingDeclarations(wings, {
			...context,
			rawSequences: drifted,
		});
		expect(findings.some((f) => f.code === "verbatim-mismatch")).toBe(true);
	});

	it("rejects duplicate case words within a wing", () => {
		const wings = cloneWings();
		wings[0]!.beats[2].cases[1] = structuredClone(wings[0]!.beats[2].cases[0]!);
		const findings = validateWingDeclarations(wings, context);
		expect(findings.some((f) => f.code === "duplicate-word")).toBe(true);
	});

	it("rejects an ensemble avatar parked on a showcase station", () => {
		const wings = cloneWings();
		wings[0]!.beats[2].cases[0]!.ensemble = [
			{ stationRef: "cave-water-a", prop: "club" },
		];
		const findings = validateWingDeclarations(wings, context);
		expect(findings.some((f) => f.code === "ensemble-on-showcase")).toBe(true);
	});

	it("rejects a non-static prop in an ensemble (JSON-era guard)", () => {
		const wings = cloneWings();
		wings[0]!.beats[2].cases[0]!.ensemble = [
			{ stationRef: "cave-water-ensemble-x", prop: "poi" as never },
		];
		const findings = validateWingDeclarations(wings, context);
		expect(findings.some((f) => f.code === "ensemble-prop")).toBe(true);
	});

	it("rejects a payoff naming an undeclared case", () => {
		const wings = cloneWings();
		wings[0]!.beats[3].visibleCases = ["ZZZZ"];
		const findings = validateWingDeclarations(wings, context);
		expect(findings.some((f) => f.code === "payoff-unknown-case")).toBe(true);
	});

	it("rejects a broken walk-order chain", () => {
		const wings = cloneWings();
		wings[0]!.beats[4].toWingId = "quarter-opp";
		const findings = validateWingDeclarations(wings, context);
		expect(findings.some((f) => f.code === "chain-broken")).toBe(true);
	});

	it("rejects a wrong case count for the category", () => {
		const wings = cloneWings();
		wings[0]!.beats[2].cases.pop();
		const findings = validateWingDeclarations(wings, context);
		expect(findings.some((f) => f.code === "case-count")).toBe(true);
	});
});
