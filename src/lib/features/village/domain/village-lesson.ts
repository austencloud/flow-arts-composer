/**
 * The lesson as choreography: which step each of the pair is playing on a
 * given tick of a lesson, worked out from the lesson's state and the rules
 * table. TeachingSystem moves the lesson along; the snapshot reports what
 * this says, so the browser and the Unreal port play the same thing.
 *
 * Step counts are "absolute" within a run of the mirror phase: the teacher's
 * nth step since the lesson's first mirror step, whichever step of the
 * sequence that lands on. The sequence loops, so a step index is the count
 * modulo the sequence's length.
 */

import type { LessonComponent, LessonScript } from "./village-types";
import type { VillageRules } from "./village-rules";
import { sequenceStepCount } from "./village-campfire";

/** A lesson at its very start: the teacher about to show the whole sequence. */
export function createLesson(
	rules: VillageRules,
	sequenceId: string,
	script: LessonScript | null = null,
): LessonComponent {
	return {
		phase: "demonstrate",
		clock: 0,
		stepCount: sequenceStepCount(rules, sequenceId),
		leadFrom: 0,
		missedStep: 0,
		script,
	};
}

export type LessonRole = "teacher" | "learner";

export interface LessonPose {
	// The step of the sequence being played, or null while holding still.
	step: number | null;
	// Ticks into that step (always below teaching.ticksPerStep, except during
	// a fumble, where it counts up through the whole stumble).
	stepTick: number;
	// True while the learner copies the teacher, mirrored as someone facing
	// them would.
	mirrored: boolean;
}

const HOLD: LessonPose = { step: null, stepTick: 0, mirrored: false };

/** How many ticks a phase lasts before the next begins; null when the phase ends on an event. */
export function lessonPhaseTicks(lesson: LessonComponent, rules: VillageRules): number | null {
	const pass = lesson.stepCount * rules.teaching.ticksPerStep;
	switch (lesson.phase) {
		case "demonstrate":
			return rules.lesson.demonstratePasses * pass;
		case "fumble":
			return rules.lesson.fumbleTicks;
		case "recognition":
			return rules.lesson.recognitionTicks;
		case "solo":
			return rules.lesson.soloPasses * pass;
		case "mirror":
			return null;
	}
}

/** The teacher's step count since this run of the mirror phase began, counted from leadFrom. */
export function mirrorTeacherCount(lesson: LessonComponent, rules: VillageRules): number {
	return lesson.leadFrom + Math.floor(lesson.clock / rules.teaching.ticksPerStep);
}

/** The learner's step count in the mirror phase, or null while they wait to come in. */
export function mirrorLearnerCount(lesson: LessonComponent, rules: VillageRules): number | null {
	const count = mirrorTeacherCount(lesson, rules) - rules.lesson.followSteps;
	return count >= lesson.leadFrom ? count : null;
}

/** What one of the pair is doing on this tick of the lesson. */
export function lessonPose(
	lesson: LessonComponent,
	role: LessonRole,
	rules: VillageRules,
): LessonPose {
	const ticksPerStep = rules.teaching.ticksPerStep;
	const n = lesson.stepCount;
	const stepTick = lesson.clock % ticksPerStep;
	const loopStep = (count: number) => ((count % n) + n) % n;

	switch (lesson.phase) {
		case "demonstrate":
			if (role === "learner") return HOLD;
			return { step: loopStep(Math.floor(lesson.clock / ticksPerStep)), stepTick, mirrored: false };
		case "mirror": {
			if (role === "teacher") {
				return { step: loopStep(mirrorTeacherCount(lesson, rules)), stepTick, mirrored: false };
			}
			const count = mirrorLearnerCount(lesson, rules);
			if (count === null) return HOLD;
			return { step: loopStep(count), stepTick, mirrored: true };
		}
		case "fumble":
			if (role === "teacher") return HOLD;
			return { step: loopStep(lesson.missedStep), stepTick: lesson.clock, mirrored: true };
		case "recognition":
			return HOLD;
		case "solo":
			if (role === "teacher") return HOLD;
			return { step: loopStep(Math.floor(lesson.clock / ticksPerStep)), stepTick, mirrored: false };
	}
}
