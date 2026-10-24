import {
	createDefaultForestFireflyConfig,
	type ForestSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";
import type { VillageRules } from "../domain/village-rules";

// The night closes in round the clearing: by 25 m the ground and the tree
// ring (VillageTreeRing) have faded to this colour, which is also the sky at
// the horizon, so there is no line where the ground stops. The forest's own
// 0.024 only reached a quarter strength at 50 m, so the lit grass ran on to
// the sky. The museum's atmosphere uses it for the Room of Collaboration.
export const VILLAGE_FOG = { color: "#0e2229", density: 0.055 } as const;

// The forest's cool stage wash, turned down so the fire is the key light and
// this only fills. 14 rather than 8, so skin facing away from the fire still
// reads (with VillageFireLight on the fire side).
const STAGE_FILL_INTENSITY = 14;

/**
 * The firefly night, with the forest's own campfire (pit, chairs, flame,
 * smoke and light) moved to the village fire. Every village view uses this,
 * so the lab and the museum show the same place.
 */
export function createVillageForestConfig(rules: VillageRules): ForestSceneConfig {
	const base = createDefaultForestFireflyConfig();
	return {
		...base,
		sky: { ...base.sky, midColor: VILLAGE_FOG.color },
		fog: { ...VILLAGE_FOG },
		campfire: base.campfire && {
			...base.campfire,
			position: { x: rules.campfire.x, z: rules.campfire.z },
			// The stage clearing is level; the raised soil pocket is only at
			// the authored camp.
			groundOffset: 0,
		},
		lighting: base.lighting && {
			...base.lighting,
			stage: { ...base.lighting.stage, intensity: STAGE_FILL_INTENSITY },
		},
	};
}
