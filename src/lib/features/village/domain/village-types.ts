export interface IdentityComponent {
	name: string;
	// Founders are 1. A newborn is one more than the oldest generation still
	// alive when it arrives, so the number rises only when a whole generation
	// has died out (see PopulationSystem).
	generation: number;
	avatarModelId: string;
	// What the avatar spins and how it lights up. Plain identity picked at
	// birth; the renderer draws them, nothing in the sim changes them.
	propType: string;
	effectLook: string;
}

export interface LearnedSequence {
	sequenceId: string;
	proficiency: number; // 0-1
	source: "seed" | "taught" | "inherited" | "invented" | "fragmented" | "gifted";
	learnedAt: number; // simulation tick
	learnedFrom: string | null; // avatar id
	lineage: string[]; // chain of avatar ids, oldest first
	lastUsedTick: number;
}

export interface KnowledgeComponent {
	// Insertion order is part of the simulation: several rules take "the first
	// sequence the teacher knows that the learner does not".
	knownSequences: Map<string, LearnedSequence>;
	maxCapacity: number;
}

export interface PersonalityComponent {
	learnSpeed: number; // 0-1
	sociability: number; // 0-1
	creativity: number; // 0-1
	patience: number; // 0-1
	curiosity: number; // 0-1
	ego: number; // 0-1, grows from teaching, gates teaching willingness
}

export type LifecyclePhase = "youth" | "adult" | "elder";

export interface LifecycleComponent {
	birthTick: number;
	currentAge: number; // 0-1 normalized
	lifespan: number; // ticks
	phase: LifecyclePhase;
	knowledgeGlow: number; // 0-1 derived from knowledge breadth
}

export type AvatarBehaviorState =
	| "idle"
	| "wandering"
	| "seeking"
	| "approaching"
	| "teaching"
	| "learning"
	| "practicing"
	| "performing"
	| "socializing"
	| "inventing"
	| "passing"
	| "watching"
	| "mourning"
	// Near the end of life: walking slowly to a seat by the fire, then
	// sitting there until they pass.
	| "retiring"
	| "seated"
	// A student keeping a seated teacher company.
	| "attending";

/**
 * Where a lesson is. The teacher shows the whole sequence while the learner
 * watches; then the learner copies it one step behind, mirrored as a person
 * facing them would; a fumble stops both for a moment and the teacher leads
 * again from the step that was missed; once the learner has it, both pause,
 * and the learner plays it once alone while the teacher watches.
 */
export type LessonPhase = "demonstrate" | "mirror" | "fumble" | "recognition" | "solo";

export interface LessonComponent {
	phase: LessonPhase;
	// Ticks since the phase began.
	clock: number;
	// Steps in the sequence being taught.
	stepCount: number;
	// The teacher's step count at the start of this run of the mirror phase.
	// Starts at 0 and moves to the missed step after each fumble.
	leadFrom: number;
	// The learner step that was fumbled; the restart begins here.
	missedStep: number;
	// Set only for the staged opening lesson: it fumbles once, on this
	// learner step, never by chance, and cannot end before that fumble.
	script: LessonScript | null;
}

export interface LessonScript {
	fumbleAtStep: number;
	fumbled: boolean;
}

export interface SocialComponent {
	state: AvatarBehaviorState;
	partner: string | null;
	teachingProgress: number;
	sequenceBeingTransferred: string | null;
	// The sequence played while performing or practicing.
	activeSequenceId: string | null;
	currentStepIndex: number;
	// The lesson's choreography, held by the learner; null outside a lesson.
	lesson: LessonComponent | null;
	frustrationLevel: number;
	idleTimer: number;
	interactionCooldown: number;
}

export interface VillageTransformComponent {
	x: number;
	z: number;
	facingAngle: number;
	targetX: number;
	targetZ: number;
	speed: number;
}

export interface VillageEntity {
	id: string;
	identity: IdentityComponent;
	knowledge: KnowledgeComponent;
	personality: PersonalityComponent;
	lifecycle: LifecycleComponent;
	social: SocialComponent;
	transform: VillageTransformComponent;
}

/**
 * The living population. A plain ordered list: removal keeps the order of
 * the survivors, and every system walks it front to back, so a C++ port that
 * does the same reproduces the run.
 */
export interface VillageWorld {
	entities: VillageEntity[];
	// The museum visitor while they teach someone; null otherwise. Not an
	// entity: they never age, never count toward the population and are never
	// in `entities`. See engine/village-visitor.ts.
	visitor: VillageVisitor | null;
}

// The partner id, teacher id and lineage entry a visitor lesson uses.
export const VISITOR_ID = "visitor";

export interface VillageVisitor {
	x: number;
	z: number;
	// Radians, atan2(dz, dx), as an avatar's facing.
	facing: number;
	sequenceId: string;
	learnerId: string;
}

/**
 * Everything the sim reports happening, as plain records the renderer and the
 * replay fixture can read. Ids only; no live avatar objects cross over.
 */
export type VillageEventInput =
	| { type: "entity:born"; avatarId: string; generation: number }
	| { type: "entity:died"; avatarId: string; x: number; z: number }
	| {
			type: "teaching:started";
			teacherId: string;
			learnerId: string;
			sequenceId: string;
	  }
	| {
			type: "teaching:completed";
			teacherId: string;
			learnerId: string;
			sequenceId: string;
	  }
	| { type: "teaching:fumble"; learnerId: string; step: number }
	| { type: "sequence:invented"; avatarId: string; sequenceId: string }
	| {
			type: "sequence:inherited";
			avatarId: string;
			elderId: string;
			sequenceId: string;
	  }
	| { type: "sequence:extinct"; sequenceId: string }
	| { type: "sequence:forgotten"; avatarId: string; sequenceId: string }
	| { type: "generation:changed"; generation: number }
	| { type: "funeral:started"; avatarId: string; mournerIds: string[] }
	| { type: "monument:placed"; sequenceId: string; x: number; z: number }
	| { type: "monument:dimmed"; sequenceId: string }
	| { type: "monument:relit"; sequenceId: string };

export type VillageEvent = VillageEventInput & { tick: number };

export type VillageEventType = VillageEventInput["type"];

export interface PopulationStats {
	alive: number;
	averageAge: number;
	totalKnowledge: number;
	uniqueSequences: number;
	extinctionCount: number;
	currentGeneration: number;
}
