import {
	VISITOR_ID,
	type LearnedSequence,
	type LessonComponent,
	type LessonPhase,
	type VillageEntity,
	type VillageWorld,
} from "../../domain/village-types";
import {
	createLesson,
	lessonPhaseTicks,
	mirrorLearnerCount,
} from "../../domain/village-lesson";
import type { VillageRules } from "../../domain/village-rules";
import type { VillageEventEmitter } from "../village-event-emitter";
import type { VillageRng } from "../village-rng";
import { dropFinishedVisitor, visitorAsTeacher } from "../village-visitor";

export class TeachingSystem {
	constructor(
		private rules: VillageRules,
		private emitter: VillageEventEmitter,
		private rng: VillageRng,
	) {}

	tick(world: VillageWorld, currentTick: number): void {
		dropFinishedVisitor(world);

		// A teacher whose learner has gone (passing, or out of the lesson)
		// stops; otherwise they would stand teaching nobody for ever.
		for (const teacher of world.entities) {
			if (teacher.social.state !== "teaching") continue;
			const learner = world.entities.find((e) => e.id === teacher.social.partner);
			if (learner?.social.state !== "learning" || learner.social.partner !== teacher.id) {
				this.resetToIdle(teacher);
			}
		}

		for (const learner of world.entities) {
			if (learner.social.state !== "learning") continue;

			const teacher = this.teacherOf(learner, world);
			if (teacher?.social.state !== "teaching") {
				this.resetToIdle(learner);
				continue;
			}

			// The lesson's first tick: the teacher starts showing the sequence.
			const lesson = learner.social.lesson;
			if (!lesson) {
				learner.social.lesson = createLesson(
					this.rules,
					learner.social.sequenceBeingTransferred!,
				);
				continue;
			}

			lesson.clock++;
			switch (lesson.phase) {
				case "demonstrate":
				case "fumble":
					// After a fumble the teacher leads again from the missed step.
					if (lesson.clock >= lessonPhaseTicks(lesson, this.rules)!) {
						if (lesson.phase === "fumble") lesson.leadFrom = lesson.missedStep;
						this.enterPhase(lesson, "mirror");
					}
					break;
				case "mirror":
					this.followStep(teacher, learner, lesson, currentTick);
					break;
				case "recognition":
					if (lesson.clock >= lessonPhaseTicks(lesson, this.rules)!) {
						this.enterPhase(lesson, "solo");
					}
					break;
				case "solo":
					this.rehearseSolo(learner, currentTick);
					if (lesson.clock >= lessonPhaseTicks(lesson, this.rules)!) {
						this.finishLesson(teacher, learner);
					}
					break;
			}
		}

		// The visitor's lesson ended this tick (finished, given up, or the
		// learner began to pass): the visitor is no longer teaching.
		dropFinishedVisitor(world);
	}

	// Partner "visitor" is the visitor's ghost, while their lesson is this one.
	private teacherOf(learner: VillageEntity, world: VillageWorld): VillageEntity | undefined {
		if (learner.social.partner === VISITOR_ID) {
			const visitor = world.visitor;
			return visitor?.learnerId === learner.id ? visitorAsTeacher(visitor, this.rules) : undefined;
		}
		return world.entities.find((e) => e.id === learner.social.partner);
	}

	private enterPhase(lesson: LessonComponent, phase: LessonPhase): void {
		lesson.phase = phase;
		lesson.clock = 0;
	}

	/**
	 * At each step boundary of the mirror phase: credit the step the learner
	 * just finished, finish the lesson if that was enough, otherwise see
	 * whether the step they are starting goes wrong.
	 */
	private followStep(
		teacher: VillageEntity,
		learner: VillageEntity,
		lesson: LessonComponent,
		currentTick: number,
	): void {
		const teaching = this.rules.teaching;
		if (lesson.clock % teaching.ticksPerStep !== 0) return;
		const count = mirrorLearnerCount(lesson, this.rules);
		if (count === null) return;
		const script = lesson.script;

		if (count - 1 >= lesson.leadFrom) {
			learner.social.teachingProgress +=
				learner.personality.learnSpeed *
				teacher.personality.patience *
				this.teacherQuality(teacher, learner) *
				(0.5 + this.rng()) *
				this.rules.lesson.progressPerStep;
			learner.social.frustrationLevel = Math.max(
				0,
				learner.social.frustrationLevel - teaching.frustrationDecay,
			);
			const mayFinish = !script || script.fumbled;
			if (mayFinish && learner.social.teachingProgress >= teaching.proficiencyThreshold) {
				this.completeTeaching(teacher, learner, currentTick);
				return;
			}
		}

		// A scripted lesson fumbles once, where the script says, and draws
		// nothing for it.
		if (script) {
			if (script.fumbled || count < script.fumbleAtStep) return;
			script.fumbled = true;
		} else {
			const fumbleChance =
				(1 - learner.social.teachingProgress) * teaching.fumbleBaseProbability;
			if (this.rng() >= fumbleChance) return;
		}

		learner.social.frustrationLevel = Math.min(
			1,
			learner.social.frustrationLevel + teaching.frustrationPerFumble,
		);
		lesson.missedStep = count;
		learner.social.currentStepIndex = count % lesson.stepCount;
		this.enterPhase(lesson, "fumble");
		this.emitter.emit({
			type: "teaching:fumble",
			learnerId: learner.id,
			step: learner.social.currentStepIndex,
		});

		if (
			!script &&
			learner.social.frustrationLevel > teaching.giveUpFrustration &&
			this.rng() < (1 - teacher.personality.patience) * teaching.giveUpImpatience
		) {
			this.resetToIdle(learner);
			this.resetToIdle(teacher);
		}
	}

	// Playing it alone keeps it fresh, as practising does.
	private rehearseSolo(learner: VillageEntity, currentTick: number): void {
		const learned = learner.knowledge.knownSequences.get(learner.social.sequenceBeingTransferred!);
		if (!learned) return;
		learned.lastUsedTick = currentTick;
		learned.proficiency = Math.min(
			1,
			learned.proficiency + this.rules.social.rehearsalGainPerTick,
		);
	}

	private finishLesson(teacher: VillageEntity, learner: VillageEntity): void {
		for (const entity of [learner, teacher]) {
			entity.social.state = "idle";
			entity.social.idleTimer = 0;
			entity.social.partner = null;
			entity.social.sequenceBeingTransferred = null;
			entity.social.lesson = null;
			entity.social.teachingProgress = 0;
			entity.social.currentStepIndex = 0;
			entity.social.interactionCooldown = this.rules.social.interactionCooldownTicks;
		}
	}

	/**
	 * How well this teacher can pass this sequence on, from the floor (barely
	 * knows it) to 1 (knows it perfectly). It slows the lesson and caps what
	 * the learner walks away with.
	 */
	private teacherQuality(teacher: VillageEntity, learner: VillageEntity): number {
		const id = learner.social.sequenceBeingTransferred;
		const proficiency = id ? (teacher.knowledge.knownSequences.get(id)?.proficiency ?? 0) : 0;
		const floor = this.rules.teaching.teacherQualityFloor;
		return floor + (1 - floor) * proficiency;
	}

	private completeTeaching(
		teacher: VillageEntity,
		learner: VillageEntity,
		currentTick: number,
	): void {
		const sequenceId = learner.social.sequenceBeingTransferred!;
		const teacherKnowledge = teacher.knowledge.knownSequences.get(sequenceId);
		if (!teacherKnowledge) {
			this.resetToIdle(learner);
			this.resetToIdle(teacher);
			return;
		}

		const learned: LearnedSequence = {
			sequenceId,
			proficiency: Math.min(1, learner.social.teachingProgress) * this.teacherQuality(teacher, learner),
			source: "taught",
			learnedAt: currentTick,
			learnedFrom: teacher.id,
			lineage: [...teacherKnowledge.lineage, teacher.id],
			lastUsedTick: currentTick,
		};
		learner.knowledge.knownSequences.set(sequenceId, learned);

		teacherKnowledge.lastUsedTick = currentTick;
		teacher.personality.ego = Math.min(
			1,
			teacher.personality.ego + this.rules.teaching.egoGainPerLesson,
		);

		this.emitter.emit({
			type: "teaching:completed",
			teacherId: teacher.id,
			learnerId: learner.id,
			sequenceId,
		});

		// A beat of recognition, then the learner plays it alone while the
		// teacher watches; both stay in the lesson until that is done.
		this.enterPhase(learner.social.lesson!, "recognition");
	}

	private resetToIdle(entity: VillageEntity): void {
		entity.social.state = "idle";
		entity.social.partner = null;
		entity.social.teachingProgress = 0;
		entity.social.sequenceBeingTransferred = null;
		entity.social.frustrationLevel = 0;
		entity.social.currentStepIndex = 0;
		entity.social.lesson = null;
		entity.social.idleTimer = 0;
		entity.social.interactionCooldown = this.rules.social.interactionCooldownTicks;
	}
}
