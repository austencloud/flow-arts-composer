import {
	VISITOR_ID,
	type AvatarBehaviorState,
	type VillageEntity,
	type VillageWorld,
	type LearnedSequence,
} from "../../domain/village-types";
import type { VillageRules } from "../../domain/village-rules";
import type { VillageEventEmitter } from "../village-event-emitter";
import type { VillageRng } from "../village-rng";
import {
	isInAudienceGap,
	lessonSpots,
	planCampLayout,
	studentSpot,
	type VillageCampLayout,
} from "../../domain/village-campfire";

// What someone can leave to go and sit by the fire, or to keep a seated
// teacher company. A lesson, a meeting under way or an invention is finished
// first.
const FREE_STATES: ReadonlySet<AvatarBehaviorState> = new Set([
	"idle",
	"wandering",
	"seeking",
	"performing",
	"practicing",
	"watching",
	"mourning",
]);

export class SocialSystem {
	private layout: VillageCampLayout;

	constructor(
		private rules: VillageRules,
		private emitter: VillageEventEmitter,
		private rng: VillageRng,
	) {
		this.layout = planCampLayout(rules);
	}

	tick(world: VillageWorld, currentTick: number): void {
		for (const entity of world.entities) {
			if (entity.social.state === "passing") continue;

			if (entity.social.interactionCooldown > 0) {
				entity.social.interactionCooldown--;
			}

			if (
				entity.lifecycle.currentAge >= this.rules.passing.retireAge &&
				FREE_STATES.has(entity.social.state)
			) {
				this.retire(entity, world);
				continue;
			}

			switch (entity.social.state) {
				case "idle":
					this.handleIdle(entity, world);
					break;
				case "wandering":
					this.handleWandering(entity);
					break;
				case "seeking":
					this.handleSeeking(entity, world);
					break;
				case "approaching":
					this.handleApproaching(entity, world);
					break;
				case "socializing":
					this.handleSocializing(entity, world, currentTick);
					break;
				case "practicing":
					this.rehearse(entity, currentTick);
					this.handlePracticing(entity);
					break;
				case "performing":
					this.rehearse(entity, currentTick);
					this.handlePerforming(entity);
					break;
				case "watching":
					this.handleWatching(entity);
					break;
				case "mourning":
					this.handleMourning(entity);
					break;
				case "retiring":
					this.handleRetiring(entity);
					break;
				case "attending":
					this.handleAttending(entity, world);
					break;
			}
		}
	}

	private handleIdle(entity: VillageEntity, world: VillageWorld): void {
		const social = this.rules.social;
		entity.social.idleTimer++;

		const threshold =
			social.idleTicksBase *
			(1 - entity.personality.sociability * social.idleSociabilityDamping);
		if (entity.social.idleTimer < threshold) return;
		if (entity.social.interactionCooldown > 0) return;

		entity.social.idleTimer = 0;

		// Nobody starts swinging a prop until they stand in a lane of their own.
		if (!this.isSettled(entity, world)) {
			this.startWandering(entity, world);
			return;
		}

		const roll = this.rng();
		const known = entity.knowledge.knownSequences.size;

		if (
			known >= 1 &&
			roll < entity.personality.creativity * social.inventChancePerCreativity
		) {
			entity.social.state = "inventing";
		} else if (known > 0 && roll < social.performChance) {
			this.startPerforming(entity);
		} else if (
			roll <
			social.seekChanceBase + entity.personality.sociability * social.seekChancePerSociability
		) {
			entity.social.state = "seeking";
			entity.social.idleTimer = 0;
		} else {
			this.startWandering(entity, world);
		}
	}

	// Performers play what they know best; ties go to whatever they learned first.
	private startPerforming(entity: VillageEntity): void {
		entity.social.state = "performing";
		entity.social.idleTimer = 0;
		let best: LearnedSequence | null = null;
		for (const seq of entity.knowledge.knownSequences.values()) {
			if (!best || seq.proficiency > best.proficiency) best = seq;
		}
		entity.social.activeSequenceId = best?.sequenceId ?? null;
	}

	private handleWandering(entity: VillageEntity): void {
		if (entity.transform.speed === 0) {
			entity.social.state = "idle";
			entity.social.idleTimer = 0;
		}
	}

	// Playing a sequence keeps it fresh: the memory clock restarts and the
	// avatar gets a little better at it.
	private rehearse(entity: VillageEntity, currentTick: number): void {
		const id = entity.social.activeSequenceId;
		if (!id) return;
		const learned = entity.knowledge.knownSequences.get(id);
		if (!learned) return;
		learned.lastUsedTick = currentTick;
		learned.proficiency = Math.min(
			1,
			learned.proficiency + this.rules.social.rehearsalGainPerTick,
		);
	}

	/**
	 * Looks for a partner for up to seekWindowTicks. Another seeker always
	 * counts; an idle or wandering neighbour is pulled in when one of the two
	 * has something to teach the other.
	 */
	private handleSeeking(entity: VillageEntity, world: VillageWorld): void {
		const { seekRadius, seekWindowTicks } = this.rules.social;
		entity.social.idleTimer++;
		const candidates = world.entities.filter((other) => {
			if (other.id === entity.id) return false;
			if (other.social.interactionCooldown > 0) return false;
			if (this.distance(entity, other) >= seekRadius) return false;
			if (other.social.state === "seeking") return true;
			if (other.social.state !== "idle" && other.social.state !== "wandering") return false;
			return (
				this.countNovelSequences(entity, other) + this.countNovelSequences(other, entity) > 0
			);
		});

		if (candidates.length === 0) {
			if (entity.social.idleTimer > seekWindowTicks) this.startWandering(entity, world);
			return;
		}

		const partner = candidates.reduce((best, candidate) => {
			const novelty =
				this.countNovelSequences(entity, candidate) +
				this.countNovelSequences(candidate, entity);
			const bestNovelty =
				this.countNovelSequences(entity, best) + this.countNovelSequences(best, entity);
			if (novelty > bestNovelty) return candidate;
			if (
				novelty === bestNovelty &&
				this.distance(entity, candidate) < this.distance(entity, best)
			)
				return candidate;
			return best;
		});

		entity.social.state = "approaching";
		entity.social.partner = partner.id;
		partner.social.state = "approaching";
		partner.social.partner = entity.id;

		// They meet side by side on the ring, a personal space apart, so their
		// props never cross and neither walks through the fire to get there.
		// A pair already standing close still walks to its spots.
		const [spotA, spotB] = lessonSpots(
			{ x: entity.transform.x, z: entity.transform.z },
			{ x: partner.transform.x, z: partner.transform.z },
			this.rules.movement.personalSpaceRadius,
			this.rules,
		);
		entity.transform.targetX = spotA.x;
		entity.transform.targetZ = spotA.z;
		entity.transform.speed = 1;
		partner.transform.targetX = spotB.x;
		partner.transform.targetZ = spotB.z;
		partner.transform.speed = 1;
	}

	private handleApproaching(entity: VillageEntity, world: VillageWorld): void {
		if (entity.transform.speed > 0) return;

		// A partner who has since paired off with someone else, or gone, ends
		// the meeting before it starts.
		const partner = world.entities.find((e) => e.id === entity.social.partner);
		if (
			!partner ||
			partner.social.state !== "approaching" ||
			partner.social.partner !== entity.id
		) {
			entity.social.state = "idle";
			entity.social.partner = null;
			return;
		}

		if (partner.transform.speed > 0) return;

		const entityCanTeach = this.countNovelSequences(partner, entity) > 0;
		const partnerCanTeach = this.countNovelSequences(entity, partner) > 0;

		if (entityCanTeach || partnerCanTeach) {
			// Someone carrying what the visitor brought teaches it before
			// anything else is decided by who knows more.
			const entityBrings = this.carriesVisitorNovel(entity, partner);
			const partnerBrings = this.carriesVisitorNovel(partner, entity);
			const teacher =
				entityBrings !== partnerBrings
					? entityBrings
						? entity
						: partner
					: entityCanTeach &&
						  (!partnerCanTeach ||
								entity.knowledge.knownSequences.size >= partner.knowledge.knownSequences.size)
						? entity
						: partner;
			const learner = teacher === entity ? partner : entity;

			// Ego gates: divas never teach; a proud teacher only teaches someone
			// who knows less than they do.
			const social = this.rules.social;
			const refuses =
				teacher.personality.ego > social.divaEgo ||
				(teacher.personality.ego > social.hierarchyEgo &&
					learner.knowledge.knownSequences.size >=
						teacher.knowledge.knownSequences.size);

			const novelSequenceId = refuses ? null : this.findNovelSequenceId(learner, teacher);
			if (novelSequenceId) {
				this.startLesson(teacher, learner, novelSequenceId);
				return;
			}
		}

		this.startSocializing(entity, partner);
	}

	/** Pairs two people for a lesson where they stand; the opening uses it too. */
	startLesson(
		teacher: VillageEntity,
		learner: VillageEntity,
		sequenceId: string,
	): void {
		teacher.social.state = "teaching";
		learner.social.state = "learning";
		teacher.social.sequenceBeingTransferred = sequenceId;
		learner.social.sequenceBeingTransferred = sequenceId;
		teacher.social.teachingProgress = 0;
		learner.social.teachingProgress = 0;
		learner.social.currentStepIndex = 0;
		learner.social.frustrationLevel = 0;
		// TeachingSystem starts the lesson's choreography on its next pass.
		learner.social.lesson = null;

		teacher.transform.facingAngle = Math.atan2(
			learner.transform.z - teacher.transform.z,
			learner.transform.x - teacher.transform.x,
		);
		learner.transform.facingAngle = Math.atan2(
			teacher.transform.z - learner.transform.z,
			teacher.transform.x - learner.transform.x,
		);

		this.emitter.emit({
			type: "teaching:started",
			teacherId: teacher.id,
			learnerId: learner.id,
			sequenceId,
		});
	}

	private startSocializing(a: VillageEntity, b: VillageEntity): void {
		a.social.state = "socializing";
		b.social.state = "socializing";
		a.social.idleTimer = 0;
		b.social.idleTimer = 0;
	}

	private handleSocializing(
		entity: VillageEntity,
		world: VillageWorld,
		currentTick: number,
	): void {
		const social = this.rules.social;
		entity.social.idleTimer++;

		// Very sociable avatars sometimes hand over a sequence in passing
		if (entity.personality.sociability > social.giftSociabilityMin && entity.social.partner) {
			const partner = world.entities.find((e) => e.id === entity.social.partner);
			if (
				partner &&
				this.rng() < entity.personality.sociability * social.giftChancePerSociability
			) {
				const giftable = this.findGiftableSequence(entity, partner);
				if (giftable) {
					partner.knowledge.knownSequences.set(giftable.sequenceId, {
						...giftable,
						proficiency: giftable.proficiency * social.giftProficiencyScale,
						source: "gifted",
						learnedFrom: entity.id,
						learnedAt: currentTick,
						lineage: [...giftable.lineage, entity.id],
						lastUsedTick: currentTick,
					});
					this.emitter.emit({
						type: "teaching:completed",
						teacherId: entity.id,
						learnerId: partner.id,
						sequenceId: giftable.sequenceId,
					});
				}
			}
		}

		if (entity.social.idleTimer > social.socializeTicks) {
			entity.social.state = "idle";
			entity.social.partner = null;
			entity.social.idleTimer = 0;
			entity.social.interactionCooldown = social.interactionCooldownTicks;
		}
	}

	private findGiftableSequence(
		gifter: VillageEntity,
		receiver: VillageEntity,
	): LearnedSequence | null {
		for (const [id, seq] of gifter.knowledge.knownSequences) {
			if (!receiver.knowledge.knownSequences.has(id)) return seq;
		}
		return null;
	}

	private handlePracticing(entity: VillageEntity): void {
		entity.social.idleTimer++;
		if (entity.social.idleTimer > this.rules.social.practiceTicks) {
			entity.social.state = "idle";
			entity.social.activeSequenceId = null;
			entity.social.idleTimer = 0;
			entity.social.interactionCooldown = this.rules.social.interactionCooldownTicks;
		}
	}

	private handlePerforming(entity: VillageEntity): void {
		entity.social.idleTimer++;
		const maxDuration =
			entity.lifecycle.phase === "elder"
				? this.rules.social.performTicksElder
				: this.rules.social.performTicksAdult;
		if (entity.social.idleTimer > maxDuration) {
			entity.social.state = "idle";
			entity.social.activeSequenceId = null;
			entity.social.idleTimer = 0;
		}
	}

	private handleWatching(entity: VillageEntity): void {
		entity.social.idleTimer++;
		if (entity.social.idleTimer > this.rules.social.watchTicks) {
			entity.social.state = "idle";
			entity.social.partner = null;
			entity.social.idleTimer = 0;
		}
	}

	private handleMourning(entity: VillageEntity): void {
		entity.social.idleTimer++;
		if (entity.social.idleTimer > this.rules.social.mourningTicks) {
			entity.social.state = "idle";
			entity.social.idleTimer = 0;
			entity.social.interactionCooldown = this.rules.social.interactionCooldownTicks;
		}
	}

	/**
	 * An elder near the end walks slowly to the nearest free seat by the fire
	 * and sits there until they pass. With every seat taken they sit where
	 * they are. Their students nearby come and stand close.
	 */
	private retire(elder: VillageEntity, world: VillageWorld): void {
		const seats = this.layout.seats;
		const slack = this.rules.movement.arrivalThreshold;
		const taken = (seat: { x: number; z: number }) =>
			world.entities.some(
				(other) =>
					other.id !== elder.id &&
					(other.social.state === "retiring" || other.social.state === "seated") &&
					Math.abs(other.transform.targetX - seat.x) < slack &&
					Math.abs(other.transform.targetZ - seat.z) < slack,
			);
		let seat: (typeof seats)[number] | null = null;
		let nearest = Infinity;
		for (const candidate of seats) {
			if (taken(candidate)) continue;
			const d = Math.hypot(candidate.x - elder.transform.x, candidate.z - elder.transform.z);
			if (d < nearest) {
				nearest = d;
				seat = candidate;
			}
		}

		elder.social.partner = null;
		elder.social.activeSequenceId = null;
		elder.social.idleTimer = 0;
		if (seat) {
			elder.social.state = "retiring";
			elder.transform.targetX = seat.x;
			elder.transform.targetZ = seat.z;
			elder.transform.speed = this.rules.passing.walkSpeed;
		} else {
			elder.social.state = "seated";
			elder.transform.targetX = elder.transform.x;
			elder.transform.targetZ = elder.transform.z;
			elder.transform.speed = 0;
		}
		elder.transform.facingAngle = this.faceFire(elder.transform.targetX, elder.transform.targetZ);

		const { studentRadius } = this.rules.passing;
		const students = world.entities.filter(
			(other) =>
				other.id !== elder.id &&
				FREE_STATES.has(other.social.state) &&
				other.lifecycle.currentAge < this.rules.passing.retireAge &&
				this.distance(elder, other) <= studentRadius &&
				[...other.knowledge.knownSequences.values()].some((k) => k.learnedFrom === elder.id),
		);
		const place = { x: elder.transform.targetX, z: elder.transform.targetZ };
		students.forEach((student, index) => {
			const spot = studentSpot(place, index, students.length, this.rules);
			student.social.state = "attending";
			student.social.partner = elder.id;
			student.social.activeSequenceId = null;
			student.social.idleTimer = 0;
			student.transform.targetX = spot.x;
			student.transform.targetZ = spot.z;
			student.transform.speed = 1;
		});
	}

	private handleRetiring(entity: VillageEntity): void {
		if (entity.transform.speed > 0) return;
		entity.social.state = "seated";
		entity.transform.facingAngle = this.faceFire(entity.transform.x, entity.transform.z);
	}

	// Stands by the seated teacher, facing them, until the funeral; goes back
	// to ordinary life if the teacher is somehow gone without one.
	private handleAttending(entity: VillageEntity, world: VillageWorld): void {
		const elder = world.entities.find((e) => e.id === entity.social.partner);
		const state = elder?.social.state;
		if (!elder || (state !== "retiring" && state !== "seated" && state !== "passing")) {
			entity.social.state = "idle";
			entity.social.partner = null;
			entity.social.idleTimer = 0;
			return;
		}
		if (entity.transform.speed > 0) return;
		entity.transform.facingAngle = Math.atan2(
			elder.transform.z - entity.transform.z,
			elder.transform.x - entity.transform.x,
		);
	}

	private faceFire(x: number, z: number): number {
		const fire = this.rules.campfire;
		return Math.atan2(fire.z - z, fire.x - x);
	}

	/**
	 * Walks to a lane on the ring nobody else is standing in or heading for,
	 * so performers stay spread round the fire with room for their props.
	 * When every lane is taken, any lane will do.
	 */
	private startWandering(entity: VillageEntity, world: VillageWorld): void {
		const { lanes } = this.layout;
		const fire = this.rules.campfire;
		const laneWidth =
			((fire.ringInnerRadius + fire.ringOuterRadius) / 2) *
			((Math.PI * 2 * (1 - fire.audienceGapDegrees / 360)) / lanes.length);
		const claimed = (lane: { x: number; z: number }) =>
			world.entities.some((other) => {
				if (other.id === entity.id) return false;
				const dx = other.transform.targetX - lane.x;
				const dz = other.transform.targetZ - lane.z;
				return dx * dx + dz * dz < (laneWidth / 2) ** 2;
			});
		const free = lanes.filter((lane) => !claimed(lane));
		const pool = free.length > 0 ? free : lanes;
		const lane = pool[Math.floor(this.rng() * pool.length)]!;

		// A little give across the ring's depth, so a lane is a place to stand
		// rather than one exact spot.
		const depth = (fire.ringOuterRadius - fire.ringInnerRadius) * 0.6;
		const radius = (fire.ringInnerRadius + fire.ringOuterRadius) / 2 + (this.rng() - 0.5) * depth;
		entity.transform.targetX = fire.x + Math.cos(lane.angle) * radius;
		entity.transform.targetZ = fire.z + Math.sin(lane.angle) * radius;
		entity.transform.speed = 1;
		entity.social.state = "wandering";
	}

	/**
	 * Standing in the ring, outside the audience's wedge, with nobody inside
	 * personal space: somewhere a performer can play without their prop
	 * reaching the fire, a seat, a neighbour or the edge of the clearing.
	 */
	private isSettled(entity: VillageEntity, world: VillageWorld): boolean {
		const fire = this.rules.campfire;
		const dx = entity.transform.x - fire.x;
		const dz = entity.transform.z - fire.z;
		const radius = Math.sqrt(dx * dx + dz * dz);
		const slack = this.rules.movement.arrivalThreshold;
		if (radius < fire.ringInnerRadius - slack || radius > fire.ringOuterRadius + slack) {
			return false;
		}
		if (isInAudienceGap(Math.atan2(dz, dx), fire)) return false;
		const personalSpace = this.rules.movement.personalSpaceRadius;
		return !world.entities.some(
			(other) =>
				other.id !== entity.id &&
				other.social.state !== "passing" &&
				this.distance(entity, other) < personalSpace - slack,
		);
	}

	private distance(a: VillageEntity, b: VillageEntity): number {
		const dx = a.transform.x - b.transform.x;
		const dz = a.transform.z - b.transform.z;
		return Math.sqrt(dx * dx + dz * dz);
	}

	private countNovelSequences(learner: VillageEntity, teacher: VillageEntity): number {
		let count = 0;
		for (const id of teacher.knowledge.knownSequences.keys()) {
			if (!learner.knowledge.knownSequences.has(id)) count++;
		}
		return count;
	}

	// The teacher passes on what they know best that the learner lacks;
	// ties go to whatever the teacher learned first.
	private carriesVisitorNovel(teacher: VillageEntity, learner: VillageEntity): boolean {
		for (const seq of teacher.knowledge.knownSequences.values()) {
			if (seq.lineage.includes(VISITOR_ID) && !learner.knowledge.knownSequences.has(seq.sequenceId)) return true;
		}
		return false;
	}

	// What the visitor brought is taught first, so it is likely to reach a
	// second generation; otherwise the teacher's best sequence the learner
	// lacks. Nobody carries the visitor's lineage in a run without one.
	private findNovelSequenceId(learner: VillageEntity, teacher: VillageEntity): string | null {
		let best: LearnedSequence | null = null;
		for (const seq of teacher.knowledge.knownSequences.values()) {
			if (learner.knowledge.knownSequences.has(seq.sequenceId)) continue;
			if (seq.lineage.includes(VISITOR_ID)) return seq.sequenceId;
			if (!best || seq.proficiency > best.proficiency) best = seq;
		}
		return best?.sequenceId ?? null;
	}
}
