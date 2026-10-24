import type { VillageWorld, LearnedSequence } from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";
import type { VillageCatalogueEntry } from "../../domain/village-catalogue";
import type { VillageEventEmitter } from "../village-event-emitter";
import { pickFrom, type VillageRng } from "../village-rng";

/**
 * An inventor turns a seed they know into one of its catalogue variations
 * (mirrored, rotated, played backwards...) and performs it straight away, so
 * the invention is something a visitor sees, not just a new id.
 */
export class RecombinationSystem {
	// Variations reachable from each sequence, in catalogue order.
	private variationsOf = new Map<string, string[]>();

	constructor(
		private rules: VillageRules,
		private emitter: VillageEventEmitter,
		private rng: VillageRng,
		catalogue: readonly VillageCatalogueEntry[],
	) {
		for (const entry of catalogue) {
			if (!entry.parentId) continue;
			const list = this.variationsOf.get(entry.parentId) ?? [];
			list.push(entry.id);
			this.variationsOf.set(entry.parentId, list);
		}
	}

	tick(world: VillageWorld, currentTick: number): void {
		for (const entity of world.entities) {
			if (entity.social.state !== "inventing") continue;

			const known = entity.knowledge.knownSequences;
			const sources = [...known.values()].filter((seq) =>
				(this.variationsOf.get(seq.sequenceId) ?? []).some((id) => !known.has(id)),
			);

			entity.social.idleTimer = 0;
			entity.social.interactionCooldown = this.rules.social.interactionCooldownTicks;

			if (sources.length === 0 || known.size >= entity.knowledge.maxCapacity) {
				entity.social.state = "idle";
				continue;
			}

			const source = pickFrom(this.rng, sources);
			const fresh = this.variationsOf.get(source.sequenceId)!.filter((id) => !known.has(id));
			const inventedId = pickFrom(this.rng, fresh);

			const learned: LearnedSequence = {
				sequenceId: inventedId,
				proficiency: this.rules.invention.inventedProficiency,
				source: "invented",
				learnedAt: currentTick,
				learnedFrom: null,
				lineage: [],
				lastUsedTick: currentTick,
			};
			known.set(inventedId, learned);
			this.emitter.emit({
				type: "sequence:invented",
				avatarId: entity.id,
				sequenceId: inventedId,
			});

			entity.social.state = "performing";
			entity.social.activeSequenceId = inventedId;
		}
	}
}
