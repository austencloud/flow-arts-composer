import type {
	LearnedSequence,
	VillageEntity,
	VillageWorld,
} from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";
import type { VillageEventEmitter } from "../village-event-emitter";
import { pickFrom, type VillageRng } from "../village-rng";
import { createAvatarEntity, removeFromWorld } from "../village-world";

export interface PopulationSystemOptions {
	rules: VillageRules;
	emitter: VillageEventEmitter;
	avatarModels: readonly string[];
	// Draws for a newborn's own traits.
	identityRng: VillageRng;
	// Draws for population-level choices (inheritance).
	populationRng: VillageRng;
	// Runs while the dead avatar is still in the world, so the funeral can see
	// who stood nearby and what they knew.
	onDeath: (deceased: VillageEntity) => void;
}

/**
 * Births and deaths.
 *
 * Generations: the founders are generation 1, and a newborn belongs to the
 * generation after the oldest one still alive. The village's generation is
 * the oldest generation alive, so it moves on exactly when the last member of
 * a generation dies: a real turnover, not "a tick in which someone died".
 */
export class PopulationSystem {
	private generation = 1;
	private nameIndex = 0;
	private nextAvatarNumber = 1;

	constructor(private options: PopulationSystemOptions) {}

	get currentGeneration(): number {
		return this.generation;
	}

	/**
	 * Founds the village: a full cohort already standing in the ring round the
	 * fire, the first few each holding one seed sequence at full proficiency.
	 */
	spawnFounders(world: VillageWorld, seedSequenceIds: readonly string[]): void {
		const { rules } = this.options;
		for (let i = 0; i < rules.population.target; i++) {
			const seedId = seedSequenceIds[i];
			const seeds = new Map<string, LearnedSequence>();
			if (seedId) {
				seeds.set(seedId, {
					sequenceId: seedId,
					proficiency: rules.population.seedProficiency,
					source: "seed",
					learnedAt: 0,
					learnedFrom: null,
					lineage: [],
					lastUsedTick: 0,
				});
			}
			this.spawn(
				world,
				0,
				rules.campfire.ringInnerRadius,
				rules.campfire.ringOuterRadius,
				seeds,
			);
		}
	}

	tick(world: VillageWorld, currentTick: number): void {
		const { rules, emitter } = this.options;

		const toRemove: VillageEntity[] = [];
		for (const entity of world.entities) {
			if (entity.social.state === "passing") {
				entity.social.idleTimer++;
				if (entity.social.idleTimer > rules.population.passingTicks) {
					toRemove.push(entity);
				}
			}
		}

		for (const entity of toRemove) {
			emitter.emit({
				type: "entity:died",
				avatarId: entity.id,
				x: entity.transform.x,
				z: entity.transform.z,
			});
			this.options.onDeath(entity);
			removeFromWorld(world, entity);
		}

		const radius = rules.arena.radius;
		for (let count = world.entities.length; count < rules.population.target; count++) {
			const newborn = this.spawn(
				world,
				currentTick,
				radius * rules.arena.newbornRadiusMinRatio,
				radius,
			);
			this.maybeInherit(world, newborn, currentTick);
		}

		// After the births, so a village that lost everyone at once still
		// moves on to its newborns' generation.
		if (toRemove.length > 0) this.updateGeneration(world);
	}

	private oldestGenerationAlive(world: VillageWorld): number {
		let oldest = Infinity;
		for (const entity of world.entities) {
			oldest = Math.min(oldest, entity.identity.generation);
		}
		return Number.isFinite(oldest) ? oldest : this.generation;
	}

	private updateGeneration(world: VillageWorld): void {
		const oldest = this.oldestGenerationAlive(world);
		if (oldest > this.generation) {
			this.generation = oldest;
			this.options.emitter.emit({ type: "generation:changed", generation: oldest });
		}
	}

	private spawn(
		world: VillageWorld,
		currentTick: number,
		spawnRadiusMin: number,
		spawnRadiusMax: number,
		seedSequences?: Map<string, LearnedSequence>,
	): VillageEntity {
		const { rules } = this.options;
		const names = rules.names;
		const name = names[this.nameIndex % names.length]!;
		this.nameIndex++;

		const entity = createAvatarEntity(world, this.options.identityRng, {
			id: `avatar-${this.nextAvatarNumber++}`,
			name,
			generation: currentTick === 0 ? 1 : this.oldestGenerationAlive(world) + 1,
			currentTick,
			rules,
			avatarModels: this.options.avatarModels,
			spawnRadiusMin,
			spawnRadiusMax,
			seedSequences,
		});
		this.options.emitter.emit({
			type: "entity:born",
			avatarId: entity.id,
			generation: entity.identity.generation,
		});
		return entity;
	}

	// A living elder may hand the newborn the sequence they know best. Not
	// guaranteed, so a line can still end with its last carrier.
	private maybeInherit(world: VillageWorld, newborn: VillageEntity, currentTick: number): void {
		const { rules, populationRng: rng, emitter } = this.options;
		const elders = world.entities.filter(
			(e) =>
				e.id !== newborn.id &&
				e.lifecycle.phase === "elder" &&
				e.social.state !== "passing" &&
				e.knowledge.knownSequences.size > 0,
		);
		if (elders.length === 0) return;
		if (rng() >= rules.population.inheritChance) return;

		const elder = pickFrom(rng, elders);
		let best: LearnedSequence | null = null;
		for (const seq of elder.knowledge.knownSequences.values()) {
			if (!best || seq.proficiency > best.proficiency) best = seq;
		}
		if (!best) return;

		newborn.knowledge.knownSequences.set(best.sequenceId, {
			sequenceId: best.sequenceId,
			proficiency: rules.population.inheritProficiency,
			source: "inherited",
			learnedAt: currentTick,
			learnedFrom: elder.id,
			lineage: [...best.lineage, elder.id],
			lastUsedTick: currentTick,
		});
		emitter.emit({
			type: "sequence:inherited",
			avatarId: newborn.id,
			elderId: elder.id,
			sequenceId: best.sequenceId,
		});
	}
}
