/**
 * Where a villager looks while they stand still, for the renderer only.
 *
 * The sim sets a facing when it has a reason to (a lesson partner, the
 * performer someone stopped to watch, the fire from a chair, the one being
 * mourned) and leaves it alone otherwise, so after a walk an idle person
 * keeps whatever way they last faced. People at a fire do not stare at the
 * dark: someone with nothing to do looks at whoever is playing nearby, or
 * else at the fire. Reading it here keeps the sim, and its replay hashes,
 * unchanged.
 */

import type { AvatarBehaviorState } from "../domain/village-types";
import type { VillageAvatarSnapshot, VillageSnapshot } from "../engine/village-snapshot";

// States where the sim has nothing to say about where they look.
const FREE_GAZE_STATES: ReadonlySet<AvatarBehaviorState> = new Set([
	"idle",
	"wandering",
	"seeking",
	"approaching",
	"socializing",
	"inventing",
]);

const SHOWING_STATES: ReadonlySet<AvatarBehaviorState> = new Set(["performing", "practicing"]);

/** The sim facing (atan2(dz, dx)) this avatar should rest at. */
export function restFacing(avatar: VillageAvatarSnapshot, snapshot: VillageSnapshot, watchRadius: number): number {
	if (!FREE_GAZE_STATES.has(avatar.state)) return avatar.facing;

	if (avatar.state === "socializing" && avatar.partnerId) {
		const partner = snapshot.avatars.find((a) => a.id === avatar.partnerId);
		if (partner) return facingToward(avatar, partner);
	}

	let nearest: VillageAvatarSnapshot | null = null;
	let nearestDistance = watchRadius;
	for (const other of snapshot.avatars) {
		if (other.id === avatar.id || !SHOWING_STATES.has(other.state)) continue;
		const distance = Math.hypot(other.x - avatar.x, other.z - avatar.z);
		if (distance < nearestDistance) {
			nearest = other;
			nearestDistance = distance;
		}
	}
	if (nearest) return facingToward(avatar, nearest);

	const fire = snapshot.world.campfire;
	// Standing in the fire itself never happens; keep their facing if it does.
	if (Math.hypot(fire.x - avatar.x, fire.z - avatar.z) < 0.01) return avatar.facing;
	return facingToward(avatar, fire);
}

function facingToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
	return Math.atan2(to.z - from.z, to.x - from.x);
}

/**
 * Turn from one yaw toward another by at most maxStep radians, the short way
 * round, so a body eases into a new heading instead of snapping to it.
 */
export function turnToward(current: number, target: number, maxStep: number): number {
	let diff = target - current;
	while (diff > Math.PI) diff -= Math.PI * 2;
	while (diff < -Math.PI) diff += Math.PI * 2;
	if (Math.abs(diff) <= maxStep) return current + diff;
	return current + Math.sign(diff) * maxStep;
}
