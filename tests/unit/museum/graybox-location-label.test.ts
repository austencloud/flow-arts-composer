import { describe, expect, it } from "vitest";
import { resolveLocationLabel } from "#lib/features/museum/components/graybox/resolve-location-label.js";
import { VULCAN_CAVE_WINGS } from "#lib/features/museum/data/wing-declarations/vulcan-cave-wings.js";

const labels = [
	{ label: "Flooded approach", whenZAbove: 22 },
	{ label: "Descent shaft", whenZAbove: 17 },
	{ label: "The drowned gallery", whenZAbove: -2 },
	{ label: "Fire threshold" },
];

describe("resolveLocationLabel", () => {
	it("takes the first entry whose threshold the player is above", () => {
		expect(resolveLocationLabel(labels, 33)).toBe("Flooded approach");
		expect(resolveLocationLabel(labels, 19)).toBe("Descent shaft");
		expect(resolveLocationLabel(labels, 0)).toBe("The drowned gallery");
	});

	it("falls back to the entry without a threshold", () => {
		expect(resolveLocationLabel(labels, -40)).toBe("Fire threshold");
	});

	it("treats the boundary as belonging to the lower band", () => {
		expect(resolveLocationLabel(labels, 22)).toBe("Descent shaft");
	});

	it("returns an empty string rather than throwing on an empty list", () => {
		expect(resolveLocationLabel([], 0)).toBe("");
	});

	it("every declared wing ends in a fallback entry", () => {
		for (const wing of VULCAN_CAVE_WINGS) {
			const last = wing.review.locationLabels.at(-1);
			expect(last?.whenZAbove, wing.wingId).toBeUndefined();
		}
	});
});
