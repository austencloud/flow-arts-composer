/**
 * The staged opening: what a visitor sees in their first minute or so.
 *
 * Before the pre-run, founder i of n starts at age i / n * founderAgeSpread
 * (their birth tick moves back by that share of their own lifespan). Births
 * only follow deaths, so a village founded all at once stays in step for
 * many lifespans; spreading the founders is what staggers the ages. Then
 * the orchestrator lets the world live `prologue.preRunTicks` ticks unseen,
 * so the visitor walks into a village with history. On the entry tick this
 * director does four things and nothing else:
 *
 *   1. Picks the teacher: the oldest living carrier of a seed sequence at
 *      least `prologue.teacherMinAge` old, or failing that the oldest of any
 *      age (ties go to the first in world order), teaching the seed they know
 *      best that a youth lacks. The learner is the youngest who does not
 *      know it (ties: first in world order). If no youth lacks any seed the
 *      teacher knows, anyone younger will do. Nobody in the middle of
 *      passing is picked. No random draws; if nobody fits, the village
 *      opens unstaged.
 *   2. Stands them in the performers' ring on the audience's side,
 *      `lessonDistance` out along the audience's line, side by side across
 *      it, one personal space apart, facing each other (so the audience
 *      sees both in profile), and
 *      starts an ordinary lesson whose one fumble falls on learner step
 *      `prologue.fumbleAtStep`.
 *   3. Keeps the teacher's age at `passing.retireAge` for as long as the
 *      lesson lasts, so they neither pass mid-lesson nor wander off after
 *      it: the ordinary retirement rule sends them to a chair the tick after
 *      the lesson ends, and their students (the learner among them) gather.
 *   4. Clears the window: everyone else lives `prologue.clearTicks` ticks
 *      longer (their lifespan grows by it), and anyone already sitting out
 *      their end, or passing, gets up. Moving every death by the same amount
 *      keeps them as spaced out as the pre-run left them; moving only the
 *      ones inside the window would pile them up just after it.
 *
 * Once the teacher has passed, the director is done and the ordinary rules
 * run on. A port reproduces the opening by doing exactly these steps in this
 * order on the entry tick, and step 3 before LifecycleSystem on every tick of
 * the lesson.
 */

import type { VillageEntity, VillageWorld } from "../domain/village-types";
import type { VillageRules } from "../domain/village-rules";
import { createLesson } from "../domain/village-lesson";
import { lifecyclePhaseAt } from "./systems/lifecycle-system";
import type { SocialSystem } from "./systems/social-system";

// "lesson" until the teacher's lesson ends; "passing" while they walk to a
// chair, sit and pass.
export type VillageOpeningPhase = "lesson" | "passing";

export interface VillageOpening {
	phase: VillageOpeningPhase;
	teacherId: string;
	learnerId: string;
	sequenceId: string;
}

const DEG = Math.PI / 180;

export class OpeningDirector {
	private opening: VillageOpening | null = null;

	constructor(
		private rules: VillageRules,
		private social: SocialSystem,
	) {}

	get current(): VillageOpening | null {
		return this.opening;
	}

	/** Runs once, on the founding tick, before the pre-run. */
	staggerFounders(world: VillageWorld): void {
		const count = world.entities.length;
		world.entities.forEach((founder, index) => {
			const { lifecycle } = founder;
			lifecycle.birthTick = -(index / count) * this.rules.prologue.founderAgeSpread * lifecycle.lifespan;
			this.setAge(founder, 0);
		});
	}

	/** Runs once, on the entry tick, after the pre-run. */
	stage(world: VillageWorld, tick: number): void {
		const minAge = this.rules.prologue.teacherMinAge;
		const cast =
			this.pickCast(world, minAge, true) ??
			this.pickCast(world, minAge, false) ??
			this.pickCast(world, 0, true) ??
			this.pickCast(world, 0, false);
		if (!cast) return;
		const { teacher, learner, sequenceId } = cast;

		this.clearWindow(world, tick, teacher);
		for (const entity of [teacher, learner]) this.release(entity, world);
		this.holdTeacherAge(teacher, tick);
		this.placePair(teacher, learner);

		teacher.social.partner = learner.id;
		learner.social.partner = teacher.id;
		this.social.startLesson(teacher, learner, sequenceId);
		learner.social.lesson = createLesson(this.rules, sequenceId, {
			fumbleAtStep: this.rules.prologue.fumbleAtStep,
			fumbled: false,
		});
		this.opening = { phase: "lesson", teacherId: teacher.id, learnerId: learner.id, sequenceId };
	}

	/** Runs at the start of every tick, before LifecycleSystem. */
	beforeTick(world: VillageWorld, tick: number): void {
		if (this.opening?.phase !== "lesson") return;
		const teacher = world.entities.find((e) => e.id === this.opening!.teacherId);
		if (teacher) this.holdTeacherAge(teacher, tick);
	}

	/** Runs at the end of every tick, after every system. */
	afterTick(world: VillageWorld): void {
		const opening = this.opening;
		if (!opening) return;
		const teacher = world.entities.find((e) => e.id === opening.teacherId);
		if (!teacher) {
			this.opening = null;
			return;
		}
		if (
			opening.phase === "lesson" &&
			(teacher.social.state !== "teaching" || teacher.social.partner !== opening.learnerId)
		) {
			this.opening = { ...opening, phase: "passing" };
		}
	}

	private pickCast(
		world: VillageWorld,
		minAge: number,
		youthOnly: boolean,
	): { teacher: VillageEntity; learner: VillageEntity; sequenceId: string } | null {
		const living = world.entities.filter((e) => e.social.state !== "passing");
		let cast: { teacher: VillageEntity; learner: VillageEntity; sequenceId: string } | null = null;
		for (const teacher of living) {
			if (teacher.lifecycle.currentAge < minAge) continue;
			if (cast && teacher.lifecycle.currentAge <= cast.teacher.lifecycle.currentAge) continue;

			let best: { sequenceId: string; proficiency: number; learner: VillageEntity } | null = null;
			for (const seedId of this.rules.seedSequenceIds) {
				const known = teacher.knowledge.knownSequences.get(seedId);
				if (!known || (best && known.proficiency <= best.proficiency)) continue;
				const learner = this.youngestLacking(living, teacher, seedId);
				if (youthOnly && learner?.lifecycle.phase !== "youth") continue;
				if (learner) best = { sequenceId: seedId, proficiency: known.proficiency, learner };
			}
			if (best) cast = { teacher, learner: best.learner, sequenceId: best.sequenceId };
		}
		return cast;
	}

	private youngestLacking(
		living: readonly VillageEntity[],
		teacher: VillageEntity,
		sequenceId: string,
	): VillageEntity | null {
		let youngest: VillageEntity | null = null;
		for (const other of living) {
			if (other === teacher || other.knowledge.knownSequences.has(sequenceId)) continue;
			if (!youngest || other.lifecycle.currentAge < youngest.lifecycle.currentAge) youngest = other;
		}
		return youngest;
	}

	private clearWindow(world: VillageWorld, tick: number, teacher: VillageEntity): void {
		const { clearTicks } = this.rules.prologue;
		for (const entity of world.entities) {
			if (entity === teacher) continue;
			entity.lifecycle.lifespan += clearTicks;
			this.setAge(entity, tick);
			const state = entity.social.state;
			if (state === "passing" || state === "retiring" || state === "seated") {
				entity.social.state = "idle";
				entity.social.idleTimer = 0;
				entity.transform.targetX = entity.transform.x;
				entity.transform.targetZ = entity.transform.z;
				entity.transform.speed = 0;
				for (const student of world.entities) {
					if (student.social.state === "attending" && student.social.partner === entity.id) {
						student.social.state = "idle";
						student.social.partner = null;
						student.social.idleTimer = 0;
					}
				}
			}
		}
	}

	// The teacher stays exactly at the retirement age while the lesson runs.
	private holdTeacherAge(teacher: VillageEntity, tick: number): void {
		const { lifecycle } = teacher;
		lifecycle.birthTick = tick - this.rules.passing.retireAge * lifecycle.lifespan;
		this.setAge(teacher, tick);
	}

	private setAge(entity: VillageEntity, tick: number): void {
		const { lifecycle } = entity;
		lifecycle.currentAge = Math.min(1, (tick - lifecycle.birthTick) / lifecycle.lifespan);
		lifecycle.phase = lifecyclePhaseAt(lifecycle.currentAge, this.rules);
	}

	// Whoever either was busy with lets go of them.
	private release(entity: VillageEntity, world: VillageWorld): void {
		const partner = world.entities.find((e) => e.id === entity.social.partner);
		if (partner?.social.partner === entity.id) {
			partner.social.state = "idle";
			partner.social.partner = null;
			partner.social.lesson = null;
			partner.social.sequenceBeingTransferred = null;
			partner.social.teachingProgress = 0;
			partner.social.activeSequenceId = null;
			partner.social.idleTimer = 0;
		}
		entity.social.partner = null;
		entity.social.activeSequenceId = null;
	}

	private placePair(teacher: VillageEntity, learner: VillageEntity): void {
		const fire = this.rules.campfire;
		const angle = fire.audienceAngleDegrees * DEG;
		const distance = this.rules.prologue.lessonDistance;
		const half = this.rules.movement.personalSpaceRadius / 2;
		const centreX = fire.x + Math.cos(angle) * distance;
		const centreZ = fire.z + Math.sin(angle) * distance;
		// Across the audience's line of sight.
		const acrossX = -Math.sin(angle);
		const acrossZ = Math.cos(angle);
		const place = (entity: VillageEntity, side: number) => {
			const x = centreX + acrossX * half * side;
			const z = centreZ + acrossZ * half * side;
			entity.transform.x = x;
			entity.transform.z = z;
			entity.transform.targetX = x;
			entity.transform.targetZ = z;
			entity.transform.speed = 0;
		};
		place(teacher, -1);
		place(learner, 1);
	}
}
