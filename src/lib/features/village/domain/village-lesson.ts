/**
 * The lesson as choreography: which step each of the pair is playing on a
 * given tick of a lesson, worked out from the lesson's state and the rules
 * table. TeachingSystem moves the lesson along; the snapshot reports what
 * this says, so the browser and the Unreal port play the same thing.
 *
 * Everything plays at the village's tempo: a step is one beat
 * (teaching.ticksPerStep ticks, one beat at performance.tempoBpm). The
 * teacher plays the sequence pass after pass, never stopping mid-move. A
 * pass is the sequence's steps, plus one beat held at the end where the
 * sequence does not end where it starts, so the next pass starts from rest
 * instead of the hands jumping back to the start.
 *
 * In the mirror and fumble phases the clock runs on unbroken, so the
 * teacher's beat count is the clock's: the learner joins in unison on a
 * pass boundary, and after a slip plays on to the end of that pass (a join,
 * where the props are at rest on the grid), sits out the next
 * `lesson.sitOutPasses` and comes back in on the boundary after.
 */

import type { LessonComponent, LessonScript } from "./village-types";
import type { VillageRules } from "./village-rules";
import { sequenceStepCount } from "./village-campfire";
import { villagePhraseEntry } from "./village-phrase-table";
import { isClosedLoop } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";

/** A lesson at its very start: the teacher about to show the whole sequence. */
export function createLesson(
	rules: VillageRules,
	sequenceId: string,
	script: LessonScript | null = null,
): LessonComponent {
	const stepCount = sequenceStepCount(rules, sequenceId);
	// A sequence the phrase table does not know (one the visitor carried in)
	// may end anywhere, so it gets the held beat too.
	const joins = villagePhraseEntry(sequenceId)?.joins;
	return {
		phase: "demonstrate",
		clock: 0,
		stepCount,
		passSteps: stepCount + (joins && isClosedLoop(joins) ? 0 : 1),
		joinPass: 0,
		slipPass: null,
		learnerSteps: 0,
		script,
	};
}

export type LessonRole = "teacher" | "learner";

export interface LessonPose {
	// The step of the sequence being played; `stepCount` while holding the
	// sequence's end pose for the beat at the end of a pass; null while not
	// playing at all (hands empty).
	step: number | null;
	// Ticks into that step, always below teaching.ticksPerStep.
	stepTick: number;
	// True while the learner copies the teacher, mirrored as someone facing
	// them would.
	mirrored: boolean;
}

const HOLD: LessonPose = { step: null, stepTick: 0, mirrored: false };

/** How many ticks a phase lasts before the next begins; null when the phase ends on an event. */
export function lessonPhaseTicks(lesson: LessonComponent, rules: VillageRules): number | null {
	const pass = lesson.passSteps * rules.teaching.ticksPerStep;
	switch (lesson.phase) {
		case "demonstrate":
			return rules.lesson.demonstratePasses * pass;
		case "recognition":
			return rules.lesson.recognitionTicks;
		case "solo":
			return rules.lesson.soloPasses * pass;
		case "mirror":
		case "fumble":
			return null;
	}
}

/** Where a beat count falls: which pass, and which beat of it. */
export function lessonPassAt(lesson: LessonComponent, beat: number): { pass: number; within: number } {
	return { pass: Math.floor(beat / lesson.passSteps), within: beat % lesson.passSteps };
}

/** The beat being played on this tick of the phase. */
export function lessonBeat(lesson: LessonComponent, rules: VillageRules): number {
	return Math.floor(lesson.clock / rules.teaching.ticksPerStep);
}

/** Whether the learner plays the given pass of the mirror phase. */
export function learnerPlaysPass(lesson: LessonComponent, pass: number): boolean {
	return pass >= lesson.joinPass || pass === lesson.slipPass;
}

/** What one of the pair is doing on this tick of the lesson. */
export function lessonPose(
	lesson: LessonComponent,
	role: LessonRole,
	rules: VillageRules,
): LessonPose {
	const stepTick = lesson.clock % rules.teaching.ticksPerStep;
	const { pass, within } = lessonPassAt(lesson, lessonBeat(lesson, rules));
	const step = Math.min(within, lesson.stepCount);

	switch (lesson.phase) {
		case "demonstrate":
			return role === "teacher" ? { step, stepTick, mirrored: false } : HOLD;
		case "mirror":
		case "fumble":
			if (role === "teacher") return { step, stepTick, mirrored: false };
			return learnerPlaysPass(lesson, pass) ? { step, stepTick, mirrored: true } : HOLD;
		case "recognition":
			return HOLD;
		case "solo":
			return role === "learner" ? { step, stepTick, mirrored: false } : HOLD;
	}
}
