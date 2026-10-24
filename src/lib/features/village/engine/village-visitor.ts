/**
 * The museum visitor as a teacher. They are not an entity: `world.visitor`
 * holds where they stand, what they teach and to whom, and only while the
 * lesson runs. TeachingSystem stands a ghost teacher in for them each tick
 * (visitorAsTeacher), so the learner goes through the ordinary lesson:
 * demonstrate, mirror, one fumble on `visitor.fumbleAtStep`, recognition,
 * solo. What they learn records "visitor" as its teacher and its lineage.
 *
 * A port reproduces a visitor lesson by doing what startVisitorLesson does,
 * between two ticks, and by treating partner "visitor" the way
 * TeachingSystem and ProximityLearningSystem do here.
 */

import {
	VISITOR_ID,
	type AvatarBehaviorState,
	type VillageEntity,
	type VillageVisitor,
	type VillageWorld,
} from "../domain/village-types";
import type { VillageRules } from "../domain/village-rules";
import { createLesson } from "../domain/village-lesson";
import type { SocialSystem } from "./systems/social-system";

export interface VisitorLessonRequest {
	learnerId: string;
	sequenceId: string;
	// Where the visitor stands, in sim space, and which way they face.
	x: number;
	z: number;
	facing: number;
}

// Someone sitting out their end, or passing, is past being taught.
const UNTEACHABLE_STATES: ReadonlySet<AvatarBehaviorState> = new Set([
	"passing",
	"retiring",
	"seated",
]);

/** True when the visitor carries this sequence. */
export function isVisitorSequence(rules: VillageRules, sequenceId: string): boolean {
	return rules.visitor.sequences.some((s) => s.sequenceId === sequenceId);
}

/** Whether this villager could learn the sequence from the visitor right now. */
export function canLearnFromVisitor(entity: VillageEntity, sequenceId: string): boolean {
	return (
		!UNTEACHABLE_STATES.has(entity.social.state) &&
		!entity.knowledge.knownSequences.has(sequenceId)
	);
}

/**
 * Starts the lesson: the learner drops whatever they were doing, stops where
 * they stand, turns to the visitor and starts an ordinary lesson whose one
 * fumble is scripted. Whoever they were busy with notices on their own next
 * pass, as with any partner who leaves. Draws nothing.
 */
export function startVisitorLesson(
	world: VillageWorld,
	rules: VillageRules,
	social: SocialSystem,
	request: VisitorLessonRequest,
): boolean {
	const learner = world.entities.find((e) => e.id === request.learnerId);
	if (!learner || !isVisitorSequence(rules, request.sequenceId)) return false;
	if (!canLearnFromVisitor(learner, request.sequenceId)) return false;

	const visitor: VillageVisitor = {
		x: request.x,
		z: request.z,
		facing: request.facing,
		sequenceId: request.sequenceId,
		learnerId: learner.id,
	};
	world.visitor = visitor;

	learner.social.partner = VISITOR_ID;
	learner.social.activeSequenceId = null;
	learner.social.idleTimer = 0;
	learner.transform.targetX = learner.transform.x;
	learner.transform.targetZ = learner.transform.z;
	learner.transform.speed = 0;
	social.startLesson(visitorAsTeacher(visitor, rules), learner, request.sequenceId);
	learner.social.lesson = createLesson(rules, request.sequenceId, {
		fumbleAtStep: rules.visitor.fumbleAtStep,
		fumbled: false,
	});
	return true;
}

/** Ends the visitor's lesson now; the learner goes back to ordinary life. */
export function cancelVisitorLesson(world: VillageWorld, rules: VillageRules): void {
	const visitor = world.visitor;
	if (!visitor) return;
	world.visitor = null;
	const learner = world.entities.find((e) => e.id === visitor.learnerId);
	if (learner?.social.state !== "learning" || learner.social.partner !== VISITOR_ID) return;
	learner.social.state = "idle";
	learner.social.partner = null;
	learner.social.teachingProgress = 0;
	learner.social.sequenceBeingTransferred = null;
	learner.social.frustrationLevel = 0;
	learner.social.currentStepIndex = 0;
	learner.social.lesson = null;
	learner.social.idleTimer = 0;
	learner.social.interactionCooldown = rules.social.interactionCooldownTicks;
}

/** Clears `world.visitor` once its learner is no longer learning from them. */
export function dropFinishedVisitor(world: VillageWorld): void {
	const visitor = world.visitor;
	if (!visitor) return;
	const learner = world.entities.find((e) => e.id === visitor.learnerId);
	if (learner?.social.state !== "learning" || learner.social.partner !== VISITOR_ID) {
		world.visitor = null;
	}
}

/**
 * A stand-in teacher built fresh from `world.visitor`: knows the sequence at
 * `visitor.proficiency`, with no lineage of its own, and has
 * `visitor.patience`. Anything the lesson writes to it (ego, last used) is
 * thrown away with it.
 */
export function visitorAsTeacher(visitor: VillageVisitor, rules: VillageRules): VillageEntity {
	const { x, z, facing, sequenceId, learnerId } = visitor;
	return {
		id: VISITOR_ID,
		identity: {
			name: VISITOR_ID,
			generation: 0,
			avatarModelId: "",
			propType: "",
			effectLook: "",
		},
		knowledge: {
			knownSequences: new Map([
				[
					sequenceId,
					{
						sequenceId,
						proficiency: rules.visitor.proficiency,
						source: "seed",
						learnedAt: 0,
						learnedFrom: null,
						lineage: [],
						lastUsedTick: 0,
					},
				],
			]),
			maxCapacity: 1,
		},
		personality: {
			learnSpeed: 0,
			sociability: 0,
			creativity: 0,
			patience: rules.visitor.patience,
			curiosity: 0,
			ego: 0,
		},
		lifecycle: { birthTick: 0, currentAge: 0, lifespan: 1, phase: "adult", knowledgeGlow: 0 },
		social: {
			state: "teaching",
			partner: learnerId,
			teachingProgress: 0,
			sequenceBeingTransferred: sequenceId,
			activeSequenceId: null,
			currentStepIndex: 0,
			lesson: null,
			frustrationLevel: 0,
			idleTimer: 0,
			interactionCooldown: 0,
		},
		transform: { x, z, facingAngle: facing, targetX: x, targetZ: z, speed: 0 },
	};
}
