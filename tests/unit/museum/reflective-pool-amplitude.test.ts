import { describe, expect, it } from "vitest";
import {
	REFLECTIVE_POOL_DEFAULTS,
	ReflectivePoolShader,
} from "#lib/shared/3d/environments/primitives/reflective-pool-shader.js";

describe("reflective pool amplitude ramp", () => {
	it("defaults to a uniform surface, so existing pools are unchanged", () => {
		expect(REFLECTIVE_POOL_DEFAULTS.waveAmplitudeStart).toBe(1);
		expect(REFLECTIVE_POOL_DEFAULTS.waveAmplitudeEnd).toBe(1);
		expect(ReflectivePoolShader.uniforms.uWaveAmplitude.value.x).toBe(1);
		expect(ReflectivePoolShader.uniforms.uWaveAmplitude.value.y).toBe(1);
	});

	it("applies the ramp across the plane's own length before any wave is used", () => {
		const source = ReflectivePoolShader.fragmentShader;
		expect(source).toContain("uniform vec2 uWaveAmplitude;");
		expect(source).toContain(
			"float amplitude = mix( uWaveAmplitude.x, uWaveAmplitude.y, vPlaneUv.x );"
		);
		// The normal, the glint and the foam wobble all read the ramped wave.
		expect(source).toContain("h *= amplitude;");
		expect(source).toContain("dx *= amplitude;");
		expect(source).toContain("dz *= amplitude;");
	});
});
