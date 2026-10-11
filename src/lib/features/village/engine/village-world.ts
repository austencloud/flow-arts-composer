import { World } from "miniplex";
import type {
	VillageEntity,
	AvatarVisualTraits,
	LearnedSequence,
} from "../domain/village-types";
import type * as PersonalityGeneratorModule from "../services/personality-generator";
import { VILLAGE_PROP_TYPES, EFFECT_AFFINITIES } from "../domain/village-constants";
import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";

// Only assign avatars whose GLB is actually deployed. The chXX Mixamo models
// aren't on R2 yet and 404 (see deployed-characters.ts), so picking one floods the
// console and renders nothing. This list self-expands as chXX land on R2.
const AVATAR_MODELS: string[] = DEPLOYED_CHARACTER_IDS;

export function createVillageWorld(): World<VillageEntity> {
	return new World<VillageEntity>();
}

export interface CreateAvatarOptions {
	name: string;
	generation: number;
	currentTick: number;
	lifespanTicks: number;
	arenaRadius: number;
	personalityGenerator: typeof PersonalityGeneratorModule;
	traitMean: number;
	traitStdDev: number;
	seedSequences?: Map<string, LearnedSequence>;
}

export function createAvatarEntity(
	world: World<VillageEntity>,
	options: CreateAvatarOptions,
): VillageEntity {
	const angle = Math.random() * Math.PI * 2;
	const radius = options.arenaRadius * (0.8 + Math.random() * 0.2);

	const visualTraits: AvatarVisualTraits = {
		skinTone: Math.random(),
		hairColor: Math.random(),
		heightScale: 0.9 + Math.random() * 0.2,
	};

	const personality = options.personalityGenerator.generatePersonality(
		options.traitMean,
		options.traitStdDev,
	);

	// Pick a model not already used by any living entity
	const usedModels = new Set(
		world.entities.map((e) => e.identity.avatarModelId),
	);
	const available = AVATAR_MODELS.filter((m) => !usedModels.has(m));
	const pool = available.length > 0 ? available : AVATAR_MODELS;
	const avatarModelId =
		pool[Math.floor(Math.random() * pool.length)] ?? "x-bot";

	const entity: VillageEntity = {
		id: `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		identity: {
			name: options.name,
			visualTraits,
			generation: options.generation,
			avatarModelId,
			role: "spinner",
		},
		knowledge: {
			knownSequences: options.seedSequences ?? new Map(),
			maxCapacity: 5 + Math.floor(personality.curiosity * 5),
		},
		personality,
		lifecycle: {
			birthTick: options.currentTick,
			currentAge: 0,
			lifespan: options.lifespanTicks * (0.8 + Math.random() * 0.4),
			phase: "youth",
			knowledgeGlow: 0,
		},
		social: {
			state: "idle",
			partner: null,
			teachingProgress: 0,
			sequenceBeingTransferred: null,
			performingSequenceId: null,
			inJam: false,
			currentStepIndex: 0,
			frustrationLevel: 0,
			idleTimer: 0,
			interactionCooldown: 0,
		},
		transform: {
			x: Math.cos(angle) * radius,
			z: Math.sin(angle) * radius,
			facingAngle: angle + Math.PI,
			targetX: 0,
			targetZ: 0,
			speed: 0,
		},
		prop: {
			heldProp: {
				id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				propType:
					VILLAGE_PROP_TYPES[
						Math.floor(Math.random() * VILLAGE_PROP_TYPES.length)
					]!,
				createdAtTick: options.currentTick,
				createdBy: "",
				ownershipChain: [],
				totalStepsPerformed: 0,
				wear: 0,
				favoriteSequenceId: null,
				customHue: Math.floor(Math.random() * 360),
				broken: false,
			},
			propPreference:
				VILLAGE_PROP_TYPES[
					Math.floor(Math.random() * VILLAGE_PROP_TYPES.length)
				]!,
		},
		effect: {
			affinity: EFFECT_AFFINITIES[Math.floor(Math.random() * EFFECT_AFFINITIES.length)]!,
			affinityStrength: 0.5 + Math.random() * 0.5,
			exposureHistory: new Map(),
		},
	};

	// Fix up prop references now that entity.id is known
	entity.prop.heldProp!.createdBy = entity.id;
	entity.prop.heldProp!.ownershipChain = [entity.id];
	entity.prop.heldProp!.propType = entity.prop.propPreference;

	world.add(entity);
	return entity;
}
