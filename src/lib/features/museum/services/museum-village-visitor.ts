/**
 * Where the visitor stands in the village, and which villager they face.
 *
 * The museum mounts the village sim turned a quarter so the audience side of
 * the fire faces the room's west door (MuseumVillageEmbed). The HUD knows the
 * visitor in museum world space; the sim speaks village space. These helpers
 * are the one place that turn lives, so the embed's drawing and the teach
 * prompt cannot drift apart.
 */

import type { VillageAvatarSnapshot } from "#lib/features/village/engine/village-snapshot.js";
import type { VillageRules } from "#lib/features/village/domain/village-rules.js";
import { preferredLearner } from "#lib/features/village/state/village-visitor-pick.js";

/** The village's turn inside the Room of Collaboration (rotation about +y). */
export const VILLAGE_ROOM_TURN = -Math.PI / 2;
const turnCos = Math.cos(VILLAGE_ROOM_TURN);
const turnSin = Math.sin(VILLAGE_ROOM_TURN);

export interface RoomCentre {
	x: number;
	z: number;
}

/** Village space to museum world space. */
export function villageToWorld(centre: RoomCentre, x: number, z: number): { x: number; z: number } {
	return {
		x: centre.x + x * turnCos + z * turnSin,
		z: centre.z - x * turnSin + z * turnCos,
	};
}

/** Museum world space to village space (the inverse turn). */
export function worldToVillage(centre: RoomCentre, x: number, z: number): { x: number; z: number } {
	const dx = x - centre.x;
	const dz = z - centre.z;
	return {
		x: dx * turnCos - dz * turnSin,
		z: dx * turnSin + dz * turnCos,
	};
}

/**
 * The visitor's yaw (museum convention: atan2(dx, dz), 0 faces +z) as a sim
 * facing (atan2(dz, dx), 0 faces +x), both in village space.
 */
export function yawToVillageFacing(yaw: number): number {
	const forward = worldToVillage({ x: 0, z: 0 }, Math.sin(yaw), Math.cos(yaw));
	return Math.atan2(forward.z, forward.x);
}

export const TEACH_REACH = 2.5; // metres
export const TEACH_CONE_HALF_ANGLE = Math.PI / 4;

export interface FacingVillagerInput {
	avatars: readonly VillageAvatarSnapshot[];
	centre: RoomCentre;
	/** Visitor in museum world space. */
	playerX: number;
	playerZ: number;
	playerYaw: number;
	/** The pocket's sequence: villagers who already know it are skipped. */
	sequenceId: string;
	rules: VillageRules;
	reach?: number;
	coneHalfAngle?: number;
}

export interface FacingVillager {
	avatar: VillageAvatarSnapshot;
	/** The visitor in village space, for the sim's lesson. */
	visitorX: number;
	visitorZ: number;
	visitorFacing: number;
	distance: number;
}

/**
 * The villager the visitor would teach: among those within reach and inside
 * the front cone, the one most likely to live to pass it on
 * (village-visitor-pick.ts: youths, then the youngest adult, nearest on a
 * tie). Busy villagers and those already carrying the sequence never count,
 * so facing only them shows no prompt.
 */
export function findFacingVillager(input: FacingVillagerInput): FacingVillager | null {
	const reach = input.reach ?? TEACH_REACH;
	const cone = input.coneHalfAngle ?? TEACH_CONE_HALF_ANGLE;
	const visitor = worldToVillage(input.centre, input.playerX, input.playerZ);
	const facing = yawToVillageFacing(input.playerYaw);
	const forwardX = Math.cos(facing);
	const forwardZ = Math.sin(facing);
	const minDot = Math.cos(cone);

	const inFront = input.avatars.filter((avatar) => {
		const dx = avatar.x - visitor.x;
		const dz = avatar.z - visitor.z;
		const distance = Math.hypot(dx, dz);
		if (distance > reach || distance < 1e-6) return false;
		return (dx * forwardX + dz * forwardZ) / distance >= minDot;
	});
	const avatar = preferredLearner(
		inFront,
		{ x: visitor.x, z: visitor.z, sequenceId: input.sequenceId },
		input.rules,
	);
	if (!avatar) return null;
	return {
		avatar,
		visitorX: visitor.x,
		visitorZ: visitor.z,
		visitorFacing: facing,
		distance: Math.hypot(avatar.x - visitor.x, avatar.z - visitor.z),
	};
}

/**
 * In third person, the player's body hands over to a village figure that
 * plays the visitor's side of a lesson (MuseumVillageEmbed). Off leaves the
 * player's own body standing still while the learner mirrors them, as in
 * first person, so the lesson works even if the swap misbehaves.
 */
export const VISITOR_BODY_SWAP = true;

/** Walking this far from where the lesson started cancels it. */
export const TEACH_LEASH = 1.5; // metres
