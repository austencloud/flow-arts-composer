/**
 * The boundary between the village sim and anything that draws it.
 *
 * Every tick the sim hands out one plain snapshot: arrays and primitives only,
 * no Map, no Set, no live avatar objects. The Threlte renderer reads only this,
 * the future Unreal renderer will read the same shape, and a run can be saved
 * or compared by serialising it. Because nothing the renderer holds is a live
 * sim object, a change in the sim (an avatar ageing, starting to teach, dying)
 * always arrives as a new value instead of being frozen inside a reactive
 * proxy.
 */

import type {
	AvatarBehaviorState,
	LearnedSequence,
	LessonComponent,
	LessonPhase,
	LifecyclePhase,
	PersonalityComponent,
	PopulationStats,
	VillageEntity,
	VillageEvent,
	VillageVisitor,
	VillageWorld,
} from "../domain/village-types";
import type { Monument } from "./systems/monument-system";
import type { VillageCampLayout, VillageSeat } from "../domain/village-campfire";
import type { VillageRules } from "../domain/village-rules";
import { lessonPose, type LessonRole } from "../domain/village-lesson";
import type { VillageOpening } from "./village-opening";

export interface VillageKnownSequenceSnapshot {
	sequenceId: string;
	proficiency: number;
	source: LearnedSequence["source"];
	learnedFrom: string | null;
	lastUsedTick: number;
}

export interface VillageAvatarSnapshot {
	id: string;
	name: string;
	modelId: string;
	x: number;
	z: number;
	// Radians in the sim's x/z plane, atan2(dz, dx): 0 faces +x.
	facing: number;
	phase: LifecyclePhase;
	age: number; // 0-1 of lifespan
	state: AvatarBehaviorState;
	// The sequence this avatar is playing right now, decided by the sim, and
	// the tick it started. Null when the avatar is not playing anything.
	activeSequenceId: string | null;
	playbackStartTick: number | null;
	// The lesson this avatar is part of, null outside one; see
	// domain/village-lesson.ts. lessonStep is the step of the sequence they
	// play this tick (null while holding still), lessonStepTick how many ticks
	// into it they are, lessonStepCount the sequence's length. A mirrored
	// learner copies the teacher as someone facing them would.
	lessonPhase: LessonPhase | null;
	lessonRole: LessonRole | null;
	lessonStep: number | null;
	lessonStepTick: number;
	lessonStepCount: number;
	lessonMirrored: boolean;
	partnerId: string | null;
	// Who taught them the sequence they are playing (or are being taught).
	teacherId: string | null;
	knownSequenceIds: string[];
	knownSequences: VillageKnownSequenceSnapshot[];
	propType: string;
	effectLook: string;
	generation: number;
	knowledgeGlow: number;
	personality: PersonalityComponent;
}

export interface VillageStoneSnapshot {
	sequenceId: string;
	x: number;
	z: number;
	// Living avatars who carry the sequence; the stone's light follows it.
	carrierCount: number;
	lit: boolean;
	generationsCarried: number;
	createdAtTick: number;
	// Who invented it; null for a seed the village was founded with.
	originName: string | null;
	// The sequence's colour (its seed's), shared by its threads and glow.
	colour: string;
	// Present, and true, only on the stone the visitor's teaching raised;
	// left out on the rest so a run with no visitor hashes as before.
	fromVisitor?: true;
}

// Fixed for the whole run; the same object every tick.
export interface VillageCampfireSnapshot {
	x: number;
	z: number;
	clearRadius: number;
	// Performers keep between these two distances from the fire.
	ringInnerRadius: number;
	ringOuterRadius: number;
	seats: VillageSeat[];
	audience: VillageSeat;
}

export interface VillageWorldSnapshot {
	tick: number;
	generation: number;
	campfire: VillageCampfireSnapshot;
	stones: VillageStoneSnapshot[];
	stats: PopulationStats;
	// The staged opening while it plays (engine/village-opening.ts): its
	// lesson, then the teacher's walk to a chair and passing. Null once the
	// teacher has passed, and in a village started without it.
	opening: VillageOpening | null;
	// The visitor while they teach (engine/village-visitor.ts). The key is
	// left out, not null, at every other time, so a run with no visitor
	// serialises (and hashes) exactly as it did before visitors existed.
	visitor?: VillageVisitorSnapshot;
	// In a village the visitor came back to (a replayed input log), what
	// became of the sequence they taught. Left out in any other village, and
	// when they never finished teaching one.
	memory?: VillageMemorySnapshot;
}

export interface VillageMemorySnapshot {
	sequenceId: string;
	// The tick the visitor first finished teaching it.
	taughtTick: number;
	// Living people who carry it now, and the generations who have.
	carrierCount: number;
	generations: number;
	// Nobody carries it any more.
	lost: boolean;
}

/**
 * The visitor teaching: where they stand, whom they teach, and the
 * teacher's side of the lesson pose, the same fields an avatar carries.
 * The visitor is never in `avatars`.
 */
export interface VillageVisitorSnapshot {
	x: number;
	z: number;
	facing: number;
	sequenceId: string;
	learnerId: string;
	lessonPhase: LessonPhase | null;
	lessonStep: number | null;
	lessonStepTick: number;
	lessonStepCount: number;
	lessonMirrored: boolean;
}

export interface VillageSnapshot {
	world: VillageWorldSnapshot;
	avatars: VillageAvatarSnapshot[];
	// What happened during this tick, in the order it happened.
	events: VillageEvent[];
}

const PLAYING_STATES: ReadonlySet<AvatarBehaviorState> = new Set([
	"teaching",
	"learning",
	"performing",
	"practicing",
]);

/** The sequence an avatar is playing this tick, or null. */
export function resolveActiveSequenceId(entity: VillageEntity): string | null {
	const { state, sequenceBeingTransferred, activeSequenceId } = entity.social;
	if (!PLAYING_STATES.has(state)) return null;
	if (state === "teaching" || state === "learning") return sequenceBeingTransferred;
	return activeSequenceId;
}

function resolveTeacherId(entity: VillageEntity, activeSequenceId: string | null): string | null {
	if (entity.social.state === "learning") return entity.social.partner;
	if (!activeSequenceId) return null;
	return entity.knowledge.knownSequences.get(activeSequenceId)?.learnedFrom ?? null;
}

export interface BuildSnapshotInput {
	world: VillageWorld;
	tick: number;
	generation: number;
	monuments: readonly Monument[];
	events: readonly VillageEvent[];
	stats: PopulationStats;
	// When each avatar's current playback began, from the orchestrator.
	playbackStartTicks: ReadonlyMap<string, number>;
	campfire: VillageCampfireSnapshot;
	colourOf: (sequenceId: string) => string;
	rules: VillageRules;
	opening: VillageOpening | null;
	memory?: VillageMemorySnapshot | null;
}

interface LessonFields {
	lessonPhase: LessonPhase | null;
	lessonRole: LessonRole | null;
	lessonStep: number | null;
	lessonStepTick: number;
	lessonStepCount: number;
	lessonMirrored: boolean;
}

const NO_LESSON: LessonFields = {
	lessonPhase: null,
	lessonRole: null,
	lessonStep: null,
	lessonStepTick: 0,
	lessonStepCount: 0,
	lessonMirrored: false,
};

// The learner holds the lesson; the teacher reads it through them.
function lessonFields(
	entity: VillageEntity,
	byId: ReadonlyMap<string, VillageEntity>,
	rules: VillageRules,
): LessonFields {
	let lesson: LessonComponent | null = null;
	let role: LessonRole | null = null;
	if (entity.social.state === "learning") {
		lesson = entity.social.lesson;
		role = "learner";
	} else if (entity.social.state === "teaching" && entity.social.partner) {
		const learner = byId.get(entity.social.partner);
		if (learner?.social.state === "learning") lesson = learner.social.lesson;
		role = "teacher";
	}
	if (!lesson || !role) return NO_LESSON;
	const pose = lessonPose(lesson, role, rules);
	return {
		lessonPhase: lesson.phase,
		lessonRole: role,
		lessonStep: pose.step,
		lessonStepTick: pose.stepTick,
		lessonStepCount: lesson.stepCount,
		lessonMirrored: pose.mirrored,
	};
}

function visitorSnapshot(
	visitor: VillageVisitor,
	byId: ReadonlyMap<string, VillageEntity>,
	rules: VillageRules,
): VillageVisitorSnapshot {
	// The learner's lesson starts on TeachingSystem's next pass.
	const lesson = byId.get(visitor.learnerId)?.social.lesson ?? null;
	const pose = lesson ? lessonPose(lesson, "teacher", rules) : null;
	return {
		x: visitor.x,
		z: visitor.z,
		facing: visitor.facing,
		sequenceId: visitor.sequenceId,
		learnerId: visitor.learnerId,
		lessonPhase: lesson?.phase ?? null,
		lessonStep: pose?.step ?? null,
		lessonStepTick: pose?.stepTick ?? 0,
		lessonStepCount: lesson?.stepCount ?? 0,
		lessonMirrored: pose?.mirrored ?? false,
	};
}

export function campfireSnapshot(layout: VillageCampLayout): VillageCampfireSnapshot {
	return {
		x: layout.fire.x,
		z: layout.fire.z,
		clearRadius: layout.fire.clearRadius,
		ringInnerRadius: layout.ringInnerRadius,
		ringOuterRadius: layout.ringOuterRadius,
		seats: layout.seats,
		audience: layout.audience,
	};
}

export function buildVillageSnapshot(input: BuildSnapshotInput): VillageSnapshot {
	const byId = new Map(input.world.entities.map((e) => [e.id, e]));
	const avatars = input.world.entities.map((entity): VillageAvatarSnapshot => {
		const activeSequenceId = resolveActiveSequenceId(entity);
		const known = [...entity.knowledge.knownSequences.values()];
		return {
			id: entity.id,
			name: entity.identity.name,
			modelId: entity.identity.avatarModelId,
			x: entity.transform.x,
			z: entity.transform.z,
			facing: entity.transform.facingAngle,
			phase: entity.lifecycle.phase,
			age: entity.lifecycle.currentAge,
			state: entity.social.state,
			activeSequenceId,
			playbackStartTick: activeSequenceId
				? (input.playbackStartTicks.get(entity.id) ?? input.tick)
				: null,
			...lessonFields(entity, byId, input.rules),
			partnerId: entity.social.partner,
			teacherId: resolveTeacherId(entity, activeSequenceId),
			knownSequenceIds: known.map((k) => k.sequenceId),
			knownSequences: known.map((k) => ({
				sequenceId: k.sequenceId,
				proficiency: k.proficiency,
				source: k.source,
				learnedFrom: k.learnedFrom,
				lastUsedTick: k.lastUsedTick,
			})),
			propType: entity.identity.propType,
			effectLook: entity.identity.effectLook,
			generation: entity.identity.generation,
			knowledgeGlow: entity.lifecycle.knowledgeGlow,
			personality: { ...entity.personality },
		};
	});

	return {
		world: {
			tick: input.tick,
			generation: input.generation,
			campfire: input.campfire,
			stones: input.monuments.map((m) => ({
				sequenceId: m.sequenceId,
				x: m.worldX,
				z: m.worldZ,
				carrierCount: m.carrierCount,
				lit: m.carrierCount > 0,
				generationsCarried: m.cohortsSurvived.length,
				createdAtTick: m.createdAtTick,
				originName: m.originName,
				colour: input.colourOf(m.sequenceId),
				...(m.fromVisitor ? { fromVisitor: true as const } : {}),
			})),
			stats: { ...input.stats },
			opening: input.opening,
			...(input.world.visitor
				? { visitor: visitorSnapshot(input.world.visitor, byId, input.rules) }
				: {}),
			...(input.memory ? { memory: { ...input.memory } } : {}),
		},
		avatars,
		events: [...input.events],
	};
}
