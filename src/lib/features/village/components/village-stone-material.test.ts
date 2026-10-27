import { describe, expect, it } from "vitest";
import { DoubleSide, FrontSide, MeshStandardMaterial } from "three";
import { makeStoneMaterial, STONE_ROUGHNESS } from "./village-stone-material";

function shipped(): MeshStandardMaterial {
	return new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.2, side: DoubleSide });
}

describe("makeStoneMaterial", () => {
	it("makes dark, rough, front-faced, unlit rock", () => {
		const m = makeStoneMaterial(shipped(), "#a8d672");
		expect(m.color.r).toBeLessThan(0.5);
		expect(m.roughness).toBe(STONE_ROUGHNESS);
		expect(m.metalness).toBe(0);
		expect(m.side).toBe(FrontSide);
		expect(m.transparent).toBe(false);
		expect(m.emissiveIntensity).toBe(0);
	});

	it("injects the vein mask into the emissive term only", () => {
		const m = makeStoneMaterial(shipped(), "#a8d672");
		const shader = {
			vertexShader: "#include <common>\n#include <begin_vertex>",
			fragmentShader: "#include <common>\n#include <emissivemap_fragment>",
		};
		m.onBeforeCompile!(shader as never, undefined as never);
		expect(shader.vertexShader).toContain("vStonePos = position;");
		expect(shader.fragmentShader).toContain("totalEmissiveRadiance *= stoneVein(vStonePos);");
		expect(m.customProgramCacheKey!()).toBe("village-stone-vein");
	});
});
