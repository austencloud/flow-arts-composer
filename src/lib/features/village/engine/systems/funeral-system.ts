import type { VillageEntity, VillageWorld } from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";
import type { VillageEventEmitter } from "../village-event-emitter";

export class FuneralSystem {
	constructor(
		private rules: VillageRules,
		private emitter: VillageEventEmitter,
	) {}

	onDeath(deceased: VillageEntity, world: VillageWorld, currentTick: number): void {
		const funeral = this.rules.funeral;

		// Did anything they knew die with them? (The orchestrator announces the
		// extinction itself, once, at the end of the tick.)
		let lostSomething = false;
		for (const seqId of deceased.knowledge.knownSequences.keys()) {
			const carried = world.entities.some(
				(e) => e.id !== deceased.id && e.knowledge.knownSequences.has(seqId),
			);
			if (!carried) lostSomething = true;
		}

		// A learner cut off mid-lesson keeps whatever they had absorbed so far.
		if (deceased.social.state === "teaching" && deceased.social.partner) {
			const learner = world.entities.find((e) => e.id === deceased.social.partner);
			if (learner?.social.sequenceBeingTransferred) {
				const seqId = learner.social.sequenceBeingTransferred;
				const teacherKnowledge = deceased.knowledge.knownSequences.get(seqId);
				if (teacherKnowledge && !learner.knowledge.knownSequences.has(seqId)) {
					learner.knowledge.knownSequences.set(seqId, {
						sequenceId: seqId,
						proficiency: learner.social.teachingProgress,
						source: "fragmented",
						learnedAt: currentTick,
						learnedFrom: deceased.id,
						lineage: [...teacherKnowledge.lineage, deceased.id],
						lastUsedTick: currentTick,
					});
				}
				learner.social.state = "idle";
				learner.social.partner = null;
				learner.social.sequenceBeingTransferred = null;
			}
		}

		// A lesson already under way carries on: stopping it would let the
		// death take a second sequence with it. Elders sitting out their own
		// last moments stay in their seats.
		const mourners: VillageEntity[] = [];
		for (const entity of world.entities) {
			if (entity.id === deceased.id) continue;
			if (
				entity.social.state === "passing" ||
				entity.social.state === "teaching" ||
				entity.social.state === "learning" ||
				entity.social.state === "retiring" ||
				entity.social.state === "seated"
			)
				continue;
			const dist = Math.sqrt(
				(entity.transform.x - deceased.transform.x) ** 2 +
					(entity.transform.z - deceased.transform.z) ** 2,
			);
			if (dist <= funeral.radius) {
				entity.social.state = "mourning";
				entity.social.partner = null;
				entity.social.activeSequenceId = null;
				entity.social.idleTimer = 0;
				entity.transform.speed = 0;
				entity.transform.facingAngle = Math.atan2(
					deceased.transform.z - entity.transform.z,
					deceased.transform.x - entity.transform.x,
				);
				mourners.push(entity);
			}
		}

		// Students still on their way to the seat stop waiting for them.
		for (const entity of world.entities) {
			if (entity.social.state === "attending" && entity.social.partner === deceased.id) {
				entity.social.state = "idle";
				entity.social.partner = null;
				entity.social.idleTimer = 0;
			}
		}

		if (mourners.length > 0) {
			this.emitter.emit({
				type: "funeral:started",
				avatarId: deceased.id,
				mournerIds: mourners.map((m) => m.id),
			});
		}

		// Knowledge panic: when something is lost, curious bystanders go looking
		// for whoever still knows things.
		if (lostSomething) {
			for (const entity of world.entities) {
				if (entity.id === deceased.id) continue;
				if (
					entity.social.state === "mourning" ||
					entity.social.state === "passing" ||
					entity.social.state === "retiring" ||
					entity.social.state === "seated"
				)
					continue;
				if (entity.personality.curiosity < funeral.panicCuriosityMin) continue;
				const dist = Math.sqrt(
					(entity.transform.x - deceased.transform.x) ** 2 +
						(entity.transform.z - deceased.transform.z) ** 2,
				);
				if (dist <= funeral.radius * funeral.panicRadiusScale) {
					entity.social.state = "seeking";
					entity.social.idleTimer = 0;
					entity.social.interactionCooldown = 0;
				}
			}
		}
	}
}
