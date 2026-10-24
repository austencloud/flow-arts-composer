import type { LifecyclePhase, VillageWorld } from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";

export function lifecyclePhaseAt(age: number, rules: VillageRules): LifecyclePhase {
	if (age < rules.phases.youth) return "youth";
	if (age < rules.phases.youth + rules.phases.adult) return "adult";
	return "elder";
}

export class LifecycleSystem {
	constructor(private rules: VillageRules) {}

	tick(world: VillageWorld, currentTick: number): void {
		for (const entity of world.entities) {
			if (entity.social.state === "passing") continue;

			const elapsed = currentTick - entity.lifecycle.birthTick;
			entity.lifecycle.currentAge = Math.min(1, elapsed / entity.lifecycle.lifespan);

			entity.lifecycle.phase = lifecyclePhaseAt(entity.lifecycle.currentAge, this.rules);

			// Natural ego decay: humility through aging
			entity.personality.ego = Math.max(
				0,
				entity.personality.ego - this.rules.social.egoDecayPerTick,
			);

			entity.lifecycle.knowledgeGlow = Math.min(
				1,
				entity.knowledge.knownSequences.size /
					Math.max(1, entity.knowledge.maxCapacity),
			);

			if (elapsed >= entity.lifecycle.lifespan) {
				entity.social.state = "passing";
				entity.social.partner = null;
				entity.social.idleTimer = 0;
			}
		}
	}
}
