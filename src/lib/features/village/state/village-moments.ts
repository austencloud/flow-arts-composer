/**
 * Named moments in the village, worked out from consecutive snapshots and the
 * events between them. Sound cues and narration key to these names, so the
 * museum and the Unreal port can share one mapping
 * (museum/data/village-sound-cues.json).
 *
 * The rules, for a port to follow:
 *   - opening:started: a `teaching:started` event for the opening's teacher
 *     and learner (it arrives with the entry snapshot).
 *   - opening:recognition: the opening learner's `lessonPhase` turns
 *     "recognition" with the teacher as partner.
 *   - opening:passing: the opening teacher's `state` turns "passing".
 *   - passing: anyone else's `state` turns "passing".
 *   - seed:lost: a `sequence:extinct` event for a seed sequence.
 *   - visitor:taught: a `teaching:completed` event whose teacher is
 *     "visitor"; avatarId is the learner.
 *   - visitor:passed-on: a `teaching:completed` event from anyone else for
 *     a sequence whose stone is the visitor's (`fromVisitor`); avatarId is
 *     the learner.
 *   - visitor:lost: a `sequence:extinct` event for such a sequence.
 * "Turns" means it holds in the newer snapshot and did not in the older one;
 * with no older snapshot, only event-based moments are reported.
 *
 * Pure: no clock, no randomness.
 */

import { VISITOR_ID, type VillageEvent } from "../domain/village-types";
import type { VillageSnapshot } from "../engine/village-snapshot";

export const OPENING_MOMENTS = ["opening:started", "opening:recognition", "opening:passing"] as const;
// What the visitor gave and what became of it, and what the village kept
// while they were away. The memory moments come with the return.
export const VISITOR_MOMENTS = [
	"visitor:taught",
	"visitor:passed-on",
	"visitor:lost",
	"memory:found",
	"memory:lost",
] as const;
export const VILLAGE_MOMENTS = [
	...OPENING_MOMENTS,
	"passing",
	"seed:lost",
	...VISITOR_MOMENTS,
] as const;
export type VillageMomentKind = (typeof VILLAGE_MOMENTS)[number];

export interface VillageMoment {
	kind: VillageMomentKind;
	tick: number;
	// Who passed or learned, and which sequence; absent for the opening's own moments.
	avatarId?: string;
	sequenceId?: string;
}

export function detectVillageMoments(
	previous: VillageSnapshot | null,
	next: VillageSnapshot,
	events: readonly VillageEvent[],
	seedSequenceIds: readonly string[],
): VillageMoment[] {
	const moments: VillageMoment[] = [];
	const tick = next.world.tick;
	const opening = previous?.world.opening ?? next.world.opening;
	// A stone, once raised, stays in every later snapshot.
	const fromVisitor = new Set(
		next.world.stones.filter((stone) => stone.fromVisitor).map((stone) => stone.sequenceId),
	);

	for (const event of events) {
		if (event.type === "teaching:completed" && event.teacherId === VISITOR_ID) {
			moments.push({
				kind: "visitor:taught",
				tick: event.tick,
				avatarId: event.learnerId,
				sequenceId: event.sequenceId,
			});
		} else if (event.type === "teaching:completed" && fromVisitor.has(event.sequenceId)) {
			moments.push({
				kind: "visitor:passed-on",
				tick: event.tick,
				avatarId: event.learnerId,
				sequenceId: event.sequenceId,
			});
		} else if (event.type === "sequence:extinct" && fromVisitor.has(event.sequenceId)) {
			moments.push({ kind: "visitor:lost", tick: event.tick, sequenceId: event.sequenceId });
		} else if (
			event.type === "teaching:started" &&
			opening &&
			event.teacherId === opening.teacherId &&
			event.learnerId === opening.learnerId
		) {
			moments.push({ kind: "opening:started", tick: event.tick });
		} else if (event.type === "sequence:extinct" && seedSequenceIds.includes(event.sequenceId)) {
			moments.push({ kind: "seed:lost", tick: event.tick, sequenceId: event.sequenceId });
		}
	}
	if (!previous) return moments;

	const before = new Map(previous.avatars.map((a) => [a.id, a]));
	for (const avatar of next.avatars) {
		const was = before.get(avatar.id);
		if (!was) continue;
		if (
			opening &&
			avatar.id === opening.learnerId &&
			avatar.lessonPhase === "recognition" &&
			avatar.partnerId === opening.teacherId &&
			was.lessonPhase !== "recognition"
		) {
			moments.push({ kind: "opening:recognition", tick });
		}
		if (avatar.state === "passing" && was.state !== "passing") {
			const isTeacher = opening !== null && avatar.id === opening.teacherId;
			moments.push(
				isTeacher
					? { kind: "opening:passing", tick, avatarId: avatar.id }
					: { kind: "passing", tick, avatarId: avatar.id },
			);
		}
	}
	return moments;
}

/**
 * Keeps the snapshot before each step, so a caller only hands over what came
 * next. A run whose tick goes backwards (a restart) starts again with no
 * "before".
 */
export function createVillageMomentTracker(
	seedSequenceIds: readonly string[],
): (events: readonly VillageEvent[], next: VillageSnapshot) => VillageMoment[] {
	let previous: VillageSnapshot | null = null;
	return (events, next) => {
		if (previous && next.world.tick < previous.world.tick) previous = null;
		const moments = detectVillageMoments(previous, next, events, seedSequenceIds);
		previous = next;
		return moments;
	};
}
