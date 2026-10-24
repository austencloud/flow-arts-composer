import { describe, expect, it } from "vitest";
import { MuseumAtmosphere } from "./museum-atmosphere";
import { VILLAGE_FOG } from "#lib/features/village/components/village-forest-config.js";

function settle(atmosphere: MuseumAtmosphere, roomFog: typeof VILLAGE_FOG | null) {
	for (let i = 0; i < 400; i++) atmosphere.update("outdoor", true, 1 / 60, false, roomFog);
}

describe("MuseumAtmosphere room fog", () => {
	it("brings in the village's night in the Room of Collaboration and lets it go at the door", () => {
		const atmosphere = new MuseumAtmosphere();
		settle(atmosphere, VILLAGE_FOG);
		expect(atmosphere.fog.density).toBeCloseTo(VILLAGE_FOG.density, 3);
		expect(`#${atmosphere.fog.color.getHexString()}`).toBe(VILLAGE_FOG.color);

		settle(atmosphere, null);
		// The outdoor wing's own fog.
		expect(atmosphere.fog.density).toBeCloseTo(0.008, 3);
	});
});
