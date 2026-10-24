/**
 * Whom the visitor should teach: the villager most likely to live long
 * enough to pass the sequence on. The lab's "Teach nearest idle" and the
 * museum's teach prompt both pick through this, so a visit in either place
 * favours the same people.
 *
 * Order: any youth, nearest first; then adults, youngest first, nearest on a
 * tie; elders last, the same way. Never anyone busy (in or on the way to a
 * lesson, or past being taught) or already carrying the sequence.
 *
 * To pick within a narrower set, such as the villagers in front of the
 * visitor, pass only those avatars.
 */

import type { VillageRules } from "../domain/village-rules";
import type { AvatarBehaviorState, LifecyclePhase } from "../domain/village-types";
import type { VillageAvatarSnapshot } from "../engine/village-snapshot";

export interface VisitorPickPosition {
	// The visitor in village space.
	x: number;
	z: number;
	// What they would teach; the visitor's first sequence when left out.
	sequenceId?: string;
}

// In a lesson, on the way to one, or past being taught (the sim refuses the
// last three, engine/village-visitor.ts).
const BUSY: ReadonlySet<AvatarBehaviorState> = new Set([
	"teaching",
	"learning",
	"approaching",
	"seeking",
	"passing",
	"retiring",
	"seated",
]);

const PHASE_ORDER: Record<LifecyclePhase, number> = { youth: 0, adult: 1, elder: 2 };

/** The villager the visitor should teach, or null when nobody is free. */
export function preferredLearner(
	avatars: readonly VillageAvatarSnapshot[],
	visitor: VisitorPickPosition,
	rules: VillageRules,
): VillageAvatarSnapshot | null {
	const sequenceId = visitor.sequenceId ?? rules.visitor.sequences[0]?.sequenceId;
	let best: VillageAvatarSnapshot | null = null;
	let bestDistance = Infinity;
	for (const avatar of avatars) {
		if (BUSY.has(avatar.state) || avatar.lessonRole !== null) continue;
		if (sequenceId && avatar.knownSequenceIds.includes(sequenceId)) continue;
		const distance = Math.hypot(avatar.x - visitor.x, avatar.z - visitor.z);
		if (!best || isBetter(avatar, distance, best, bestDistance)) {
			best = avatar;
			bestDistance = distance;
		}
	}
	return best;
}

function isBetter(
	a: VillageAvatarSnapshot,
	aDistance: number,
	b: VillageAvatarSnapshot,
	bDistance: number,
): boolean {
	const phase = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
	if (phase !== 0) return phase < 0;
	// Youths all have a life ahead of them; among the rest, younger is better.
	if (a.phase !== "youth" && a.age !== b.age) return a.age < b.age;
	return aDistance < bDistance;
}
