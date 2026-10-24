import type { VillageEntity, VillageWorld } from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";
import type { VillageEventEmitter } from "../village-event-emitter";

export interface Monument {
	sequenceId: string;
	worldX: number;
	worldZ: number;
	createdAtTick: number;
	// Who invented it; null for a seed the village was founded with.
	originName: string | null;
	// Generations that have carried the sequence, in the order first seen.
	cohortsSurvived: number[];
	// Living avatars who know it right now. The dying (passing) do not count,
	// so a stone goes dark as its last carrier starts to pass.
	carrierCount: number;
	extinctAtTick: number | null;
	// True for the stone a visitor's first lesson raises.
	fromVisitor: boolean;
}

/**
 * Standing stones. Every seed sequence has one from the first tick, where the
 * rules table stands it at the clearing's edge; an invention earns one where it was invented once
 * enough generations have carried it. A stone's light follows how many living
 * avatars carry its sequence and goes dark at zero.
 *
 * A sequence the visitor carries gets its stone, in the rules' visitor slot,
 * on the tick the visitor first finishes teaching it. From then on it lights
 * and dims like any other.
 */
export class MonumentSystem {
	monuments: Monument[] = [];
	private sequenceOrigins = new Map<
		string,
		{ x: number; z: number; name: string; generation: number }
	>();

	constructor(
		private rules: VillageRules,
		private emitter: VillageEventEmitter,
		seedSequenceIds: readonly string[],
	) {
		for (const sequenceId of seedSequenceIds) {
			// The rules guarantee one stone per seed.
			const stone = rules.stones.find((s) => s.sequenceId === sequenceId)!;
			this.monuments.push({
				sequenceId,
				worldX: stone.x,
				worldZ: stone.z,
				createdAtTick: 0,
				originName: null,
				cohortsSurvived: [],
				carrierCount: 0,
				extinctAtTick: null,
				fromVisitor: false,
			});
		}
	}

	// Sequences the visitor has finished teaching, waiting for their stone.
	private visitorTaught: string[] = [];

	recordVisitorLesson(sequenceId: string): void {
		if (!this.visitorTaught.includes(sequenceId)) this.visitorTaught.push(sequenceId);
	}

	recordInvention(inventor: VillageEntity, sequenceId: string): void {
		this.sequenceOrigins.set(sequenceId, {
			x: inventor.transform.x,
			z: inventor.transform.z,
			name: inventor.identity.name,
			generation: inventor.identity.generation,
		});
	}

	tick(world: VillageWorld, currentTick: number): void {
		const carriers = new Map<string, { count: number; cohorts: Set<number> }>();
		for (const entity of world.entities) {
			if (entity.social.state === "passing") continue;
			for (const seqId of entity.knowledge.knownSequences.keys()) {
				let entry = carriers.get(seqId);
				if (!entry) {
					entry = { count: 0, cohorts: new Set() };
					carriers.set(seqId, entry);
				}
				entry.count++;
				entry.cohorts.add(entity.identity.generation);
			}
		}

		for (const sequenceId of this.visitorTaught) {
			if (this.monuments.some((m) => m.sequenceId === sequenceId)) continue;
			const { x, z } = this.rules.visitor.stone;
			this.monuments.push({
				sequenceId,
				worldX: x,
				worldZ: z,
				createdAtTick: currentTick,
				originName: null,
				cohortsSurvived: [],
				carrierCount: 0,
				extinctAtTick: null,
				fromVisitor: true,
			});
			this.emitter.emit({ type: "monument:placed", sequenceId, x, z });
		}
		this.visitorTaught = [];

		for (const monument of this.monuments) {
			const entry = carriers.get(monument.sequenceId);
			monument.carrierCount = entry?.count ?? 0;
			for (const c of entry?.cohorts ?? []) {
				if (!monument.cohortsSurvived.includes(c)) monument.cohortsSurvived.push(c);
			}
			if (monument.carrierCount === 0 && monument.extinctAtTick === null) {
				monument.extinctAtTick = currentTick;
				this.emitter.emit({ type: "monument:dimmed", sequenceId: monument.sequenceId });
			} else if (monument.carrierCount > 0 && monument.extinctAtTick !== null) {
				monument.extinctAtTick = null;
				this.emitter.emit({ type: "monument:relit", sequenceId: monument.sequenceId });
			}
		}

		for (const [seqId, entry] of carriers) {
			if (entry.cohorts.size < this.rules.monument.generationThreshold) continue;
			if (this.monuments.some((m) => m.sequenceId === seqId)) continue;
			const origin = this.sequenceOrigins.get(seqId);
			if (!origin) continue;
			this.monuments.push({
				sequenceId: seqId,
				worldX: origin.x,
				worldZ: origin.z,
				createdAtTick: currentTick,
				originName: origin.name,
				cohortsSurvived: [...entry.cohorts],
				carrierCount: entry.count,
				extinctAtTick: null,
				fromVisitor: false,
			});
			this.emitter.emit({
				type: "monument:placed",
				sequenceId: seqId,
				x: origin.x,
				z: origin.z,
			});
		}
	}
}
