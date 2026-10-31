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
	lessonBeat,
	lessonPassAt,
	lessonPhaseTicks,
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
					// The learner joins on the very next beat, the first of a pass.
					if (lesson.clock >= lessonPhaseTicks(lesson, this.rules)!) {
						this.enterPhase(lesson, "mirror");
						this.followBeat(teacher, learner, lesson, currentTick);
					}
					break;
				case "mirror":
				case "fumble":
					this.followBeat(teacher, learner, lesson, currentTick);
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
	 * On each beat of the mirror and fumble phases, whose clock runs on
	 * unbroken from the first mirrored beat. On a pass boundary a learner who
	 * sat out comes back in, or, having it, the lesson ends. On a beat the
	 * learner plays: credit it, then see whether it goes wrong.
	 */
	private followBeat(
		teacher: VillageEntity,
		learner: VillageEntity,
		lesson: LessonComponent,
		currentTick: number,
	): void {
		const teaching = this.rules.teaching;
		if (lesson.clock % teaching.ticksPerStep !== 0) return;
		const beat = lessonBeat(lesson, this.rules);
		const { pass, within } = lessonPassAt(lesson, beat);
		const script = lesson.script;

		if (within === 0 && beat > 0) {
			if (lesson.phase === "fumble" && pass >= lesson.joinPass) {
				lesson.phase = "mirror";
				lesson.slipPass = null;
			}
			// The learner played the whole of the last pass with the teacher.
			const mayFinish = !script || script.fumbled;
			if (
				lesson.phase === "mirror" &&
				pass - 1 >= lesson.joinPass &&
				mayFinish &&
				learner.social.teachingProgress >= teaching.proficiencyThreshold
			) {
				this.completeTeaching(teacher, learner, currentTick);
				return;
			}
		}

		if (lesson.phase !== "mirror" || pass < lesson.joinPass || within >= lesson.stepCount) return;
		const step = lesson.learnerSteps++;
		learner.social.currentStepIndex = within;
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

		// A scripted lesson fumbles once, where the script says, and draws
		// nothing for it.
		if (script) {
			if (script.fumbled || step < script.fumbleAtStep) return;
			script.fumbled = true;
		} else {
			const fumbleChance =
				(1 - learner.social.teachingProgress) * teaching.fumbleBaseProbability;
			if (this.rng() >= fumbleChance) return;
		}

		// The learner plays on to the end of this pass, sits out the next and
		// comes back in on the boundary after; the teacher never stops.
		learner.social.frustrationLevel = Math.min(
			1,
			learner.social.frustrationLevel + teaching.frustrationPerFumble,
		);
		lesson.phase = "fumble";
		lesson.slipPass = pass;
		lesson.joinPass = pass + 1 + this.rules.lesson.sitOutPasses;
		this.emitter.emit({
			type: "teaching:fumble",
			learnerId: learner.id,
			step: within,
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
