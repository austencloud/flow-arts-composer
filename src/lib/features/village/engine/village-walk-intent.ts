/**
 * Where each walker is headed and how fast, for the renderer only.
 *
 * The snapshot says where someone is each tick; a body that only knows that
 * can chase the last position, but it cannot see a stop coming, so every walk
 * ended in a slide. This hands the renderer the sim's own intent: the target
 * the movement system steers to and the metres it covers per tick. It is read
 * beside the snapshot, never inside it, so the replay hashes (and the C++
 * port's parity target) stay as they are.
 */

import type { VillageRules } from "../domain/village-rules";
import type { VillageWorld } from "../domain/village-types";
import { walkStepPerTick } from "./systems/movement-system";

export interface VillageWalkIntent {
	targetX: number;
	targetZ: number;
	/** Metres per tick the movement system moves them; 0 when they stand. */
	metresPerTick: number;
}

export function villageWalkIntents(
	world: VillageWorld,
	rules: VillageRules,
): Map<string, VillageWalkIntent> {
	const intents = new Map<string, VillageWalkIntent>();
	for (const entity of world.entities) {
		const { transform } = entity;
		const walking = transform.speed !== 0 && entity.social.state !== "passing";
		intents.set(entity.id, {
			targetX: transform.targetX,
			targetZ: transform.targetZ,
			metresPerTick: walking
				? walkStepPerTick(transform.speed, entity.lifecycle.phase, rules)
				: 0,
		});
	}
	return intents;
}
