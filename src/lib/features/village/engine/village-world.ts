import type {
	VillageEntity,
	VillageWorld,
	LearnedSequence,
} from "../domain/village-types";
import type { VillageRules } from "../domain/village-rules";
import { generatePersonality } from "../services/personality-generator";
import { pickFrom, type VillageRng } from "./village-rng";

export function createVillageWorld(): VillageWorld {
	return { entities: [], visitor: null };
}

/** Removes one avatar and keeps everyone else in their current order. */
export function removeFromWorld(world: VillageWorld, entity: VillageEntity): void {
	const index = world.entities.indexOf(entity);
	if (index >= 0) world.entities.splice(index, 1);
}

export interface CreateAvatarOptions {
	id: string;
	name: string;
	generation: number;
	currentTick: number;
	rules: VillageRules;
	// Newborns appear somewhere on the ring between these two distances from
	// the fire.
	spawnRadiusMin: number;
	spawnRadiusMax: number;
	// Rig models the renderer can actually load. Changing this list changes
	// which model an avatar wears, never any other choice in the run.
	avatarModels: readonly string[];
	seedSequences?: Map<string, LearnedSequence>;
}

/**
 * Creates one newborn and adds it to the world. Draws come from the identity
 * stream in a fixed order (position, personality, model, prop, look, lifespan)
 * so the order is part of the replay contract.
 */
export function createAvatarEntity(
	world: VillageWorld,
	rng: VillageRng,
	options: CreateAvatarOptions,
): VillageEntity {
	const { rules } = options;
	const angle = rng() * Math.PI * 2;
	// sqrt keeps newborns spread evenly over the ring instead of bunched
	// toward its inner edge.
	const { spawnRadiusMin: rMin, spawnRadiusMax: rMax } = options;
	const radius = Math.sqrt(rMin * rMin + rng() * (rMax * rMax - rMin * rMin));

	const personality = generatePersonality(
		rng,
		rules.population.traitMean,
		rules.population.traitStdDev,
	);

	// Prefer a model nobody alive is wearing, so two avatars rarely look alike.
	const usedModels = new Set(world.entities.map((e) => e.identity.avatarModelId));
	const available = options.avatarModels.filter((m) => !usedModels.has(m));
	const pool = available.length > 0 ? available : options.avatarModels;
	const modelDraw = rng();
	const avatarModelId =
		pool.length > 0 ? pool[Math.floor(modelDraw * pool.length)]! : "x-bot";

	const propType = pickFrom(rng, rules.propTypes);
	const effectLook = pickFrom(rng, rules.effectLooks);
	const { lifespanJitterMin, lifespanJitterMax } = rules.population;
	const lifespan =
		rules.population.lifespanTicks *
		(lifespanJitterMin + rng() * (lifespanJitterMax - lifespanJitterMin));

	const x = rules.campfire.x + Math.cos(angle) * radius;
	const z = rules.campfire.z + Math.sin(angle) * radius;

	const entity: VillageEntity = {
		id: options.id,
		identity: {
			name: options.name,
			generation: options.generation,
			avatarModelId,
			propType,
			effectLook,
		},
		knowledge: {
			knownSequences: options.seedSequences ?? new Map(),
			maxCapacity:
				rules.population.capacityBase +
				Math.floor(personality.curiosity * rules.population.capacityCuriosityBonus),
		},
		personality,
		lifecycle: {
			birthTick: options.currentTick,
			currentAge: 0,
			lifespan,
			phase: "youth",
			knowledgeGlow: 0,
		},
		social: {
			state: "idle",
			partner: null,
			teachingProgress: 0,
			sequenceBeingTransferred: null,
			activeSequenceId: null,
			currentStepIndex: 0,
			lesson: null,
			frustrationLevel: 0,
			idleTimer: 0,
			interactionCooldown: 0,
		},
		transform: {
			x,
			z,
			facingAngle: angle + Math.PI,
			targetX: x,
			targetZ: z,
			speed: 0,
		},
	};

	world.entities.push(entity);
	return entity;
}
