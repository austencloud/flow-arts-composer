import type { VillageWorld } from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";
import type { VillageEventEmitter } from "../village-event-emitter";

export class DecaySystem {
	constructor(
		private rules: VillageRules,
		private emitter: VillageEventEmitter,
	) {}

	tick(world: VillageWorld, currentTick: number): void {
		const decay = this.rules.decay;
		for (const entity of world.entities) {
			if (entity.social.state === "passing") continue;

			for (const [seqId, learned] of entity.knowledge.knownSequences) {
				const elapsed = currentTick - learned.lastUsedTick;
				if (elapsed <= decay.graceTicks) continue;

				// Patient avatars forget slower; structurally memorable sequences fade slower
				const patienceModifier = 1 - entity.personality.patience * decay.patienceDamping;
				const structureBonus = this.getStructuralMemorability(seqId);
				const decayRate = decay.perTick * patienceModifier * (1 - structureBonus);

				learned.proficiency = Math.max(decay.floor, learned.proficiency - decayRate);

				if (learned.proficiency < decay.forgetThreshold) {
					entity.knowledge.knownSequences.delete(seqId);
					this.emitter.emit({
						type: "sequence:forgotten",
						avatarId: entity.id,
						sequenceId: seqId,
					});
				}
			}
		}
	}

	/**
	 * Sequences with internal repetition (mirrored, inverted, rewound) are easier
	 * to rehearse in your head, so they fade slower.
	 */
	private getStructuralMemorability(sequenceId: string): number {
		const structural = sequenceId
			.split(":")
			.filter((m) => m === "mirror" || m === "invert" || m === "rewind");
		return Math.min(
			this.rules.decay.structuralBonusMax,
			structural.length * this.rules.decay.structuralBonusPerTransform,
		);
	}
}
