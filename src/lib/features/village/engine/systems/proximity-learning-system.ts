import { VISITOR_ID, type VillageEntity, type VillageWorld } from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";

/**
 * Youths pick up what they see played nearby, just by standing near it. The
 * visitor counts while they teach: after every villager, a youth near them
 * (other than the learner) absorbs what they show, as from a teacher with no
 * lineage.
 */
export class ProximityLearningSystem {
	// Partial absorption progress, keyed `${youthId}:${sequenceId}`.
	private absorptionProgress = new Map<string, number>();

	constructor(private rules: VillageRules) {}

	tick(world: VillageWorld, currentTick: number): void {
		for (const youth of world.entities) {
			if (youth.lifecycle.phase !== "youth") continue;
			if (youth.social.state === "passing") continue;

			for (const adult of world.entities) {
				if (adult.id === youth.id) continue;
				if (
					adult.social.state !== "performing" &&
					adult.social.state !== "practicing" &&
					adult.social.state !== "teaching"
				)
					continue;

				const activeSeqId =
					adult.social.sequenceBeingTransferred ?? adult.social.activeSequenceId;
				if (!activeSeqId) continue;
				const source = adult.knowledge.knownSequences.get(activeSeqId);
				this.absorb(youth, adult.transform, activeSeqId, adult.id, source?.lineage ?? [], currentTick);
			}

			// The visitor's own learner learns it from the lesson, at the end of
			// mirror like any lesson, not by watching it.
			const visitor = world.visitor;
			if (visitor && youth.id !== visitor.learnerId) {
				this.absorb(youth, visitor, visitor.sequenceId, VISITOR_ID, [], currentTick);
			}
		}

		// Forget half-absorbed progress once the youth grows up or dies.
		const youthIds = new Set<string>();
		for (const e of world.entities) {
			if (e.lifecycle.phase === "youth") youthIds.add(e.id);
		}
		for (const key of this.absorptionProgress.keys()) {
			if (!youthIds.has(key.split(":")[0]!)) this.absorptionProgress.delete(key);
		}
	}

	private absorb(
		youth: VillageEntity,
		at: { x: number; z: number },
		sequenceId: string,
		sourceId: string,
		sourceLineage: readonly string[],
		currentTick: number,
	): void {
		const { radius, absorptionRate, absorptionThreshold } = this.rules.proximityLearning;
		const dx = youth.transform.x - at.x;
		const dz = youth.transform.z - at.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist > radius) return;
		if (youth.knowledge.knownSequences.has(sequenceId)) return;

		const key = `${youth.id}:${sequenceId}`;
		const progress =
			(this.absorptionProgress.get(key) ?? 0) + (1 - dist / radius) * absorptionRate;

		if (progress >= absorptionThreshold) {
			youth.knowledge.knownSequences.set(sequenceId, {
				sequenceId,
				proficiency: absorptionThreshold,
				source: "taught",
				learnedAt: currentTick,
				learnedFrom: sourceId,
				lineage: [...sourceLineage, sourceId],
				lastUsedTick: currentTick,
			});
			this.absorptionProgress.delete(key);
		} else {
			this.absorptionProgress.set(key, progress);
		}
	}
}
