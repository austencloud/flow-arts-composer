/**
 * The village standing stone's rock: heavy, dark and rough, lit by the
 * fire's own warmth, with the sequence colour only as a thin glowing vein.
 *
 * The Poly Haven coast_rocks_05 (CC0) ships as pale, smooth limestone. Left
 * alone and given a broad emissive wash it reads as a glowing ghost, so this
 * turns the shipped material into dark weathered stone instead:
 *  - the diffuse is multiplied down to a dark warm grey (the texture's grain
 *    stays), fully rough, no metal, almost no environment sheen;
 *  - only the front faces draw (the GLB is double sided, which let the inside
 *    of the slab show through as a second, see-through layer);
 *  - the emissive colour is multiplied by a vein mask in the fragment shader,
 *    so a lit stone shows a few thin wandering lines of its colour and the
 *    rest of the rock stays dark.
 *
 * The vein is injected with onBeforeCompile on every clone with the same
 * source, so three.js shares one program between all stones, and a stone's glow
 * changes only the emissiveIntensity uniform (no recompile).
 */
import { Color, DoubleSide, FrontSide, type MeshStandardMaterial } from "three";

/** The shipped diffuse multiplied by this: dark, slightly warm grey. */
export const STONE_TINT = new Color(0.4, 0.37, 0.34);
export const STONE_ROUGHNESS = 1;
export const STONE_ENV_INTENSITY = 0.12;
export const STONE_NORMAL_SCALE = 1.6;

const VEIN_VARYING = "varying vec3 vStonePos;";

/** 0 across the rock, 1 along a few thin wandering lines. Object space. */
export const STONE_VEIN_GLSL = /* glsl */ `
varying vec3 vStonePos;
float stoneVein(vec3 p) {
	float warp = sin(p.x * 5.0 + p.z * 4.0) * 0.9 + sin(p.x * 11.0 - p.y * 3.0) * 0.35;
	float line = abs(sin(p.y * 7.0 + warp));
	float vein = 1.0 - smoothstep(0.0, 0.1, line);
	// Fade the veins out toward the top and bottom so they read as seams
	// inside the rock, not stripes painted on it.
	float body = smoothstep(-0.9, -0.3, p.y) * (1.0 - smoothstep(0.3, 0.9, p.y));
	return vein * (0.35 + 0.65 * body);
}
`;

function injectVein(shader: { vertexShader: string; fragmentShader: string }): void {
	shader.vertexShader = shader.vertexShader
		.replace("#include <common>", `#include <common>\n${VEIN_VARYING}`)
		.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvStonePos = position;");
	shader.fragmentShader = shader.fragmentShader
		.replace("#include <common>", `#include <common>\n${STONE_VEIN_GLSL}`)
		.replace(
			"#include <emissivemap_fragment>",
			"#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= stoneVein(vStonePos);",
		);
}

/**
 * Turn a clone of the shipped rock material into village stone. Returns the
 * same material for chaining. Emissive starts at 0 (a dark stone).
 */
export function makeStoneMaterial(material: MeshStandardMaterial, veinColour: string): MeshStandardMaterial {
	material.color.multiply(STONE_TINT);
	material.roughness = STONE_ROUGHNESS;
	material.metalness = 0;
	material.envMapIntensity = STONE_ENV_INTENSITY;
	material.normalScale.setScalar(STONE_NORMAL_SCALE);
	if (material.side === DoubleSide) material.side = FrontSide;
	material.transparent = false;
	material.opacity = 1;
	material.emissive.set(veinColour);
	material.emissiveIntensity = 0;
	material.onBeforeCompile = injectVein;
	material.customProgramCacheKey = () => "village-stone-vein";
	return material;
}
