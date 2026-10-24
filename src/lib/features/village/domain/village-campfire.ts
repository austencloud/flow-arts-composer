/**
 * Where everything stands around the village fire, worked out from the rules
 * table. Pure maths, no randomness: the sim uses it to choose where people
 * walk, the renderer to place the chairs and the audience camera, and the
 * Unreal port reads the same numbers from the snapshot.
 *
 * Angles are radians in the sim's x/z plane, atan2(dz, dx), measured around
 * the fire.
 */

import type { VillageCampfireRules, VillageRules } from "./village-rules";
import { seedIdOf } from "./village-catalogue";

export interface VillagePoint {
	x: number;
	z: number;
}

export interface VillageSeat extends VillagePoint {
	// Faces the fire, in the same convention as an avatar's facing.
	facing: number;
}

export interface VillageLane extends VillagePoint {
	angle: number;
}

export interface VillageCampLayout {
	fire: VillagePoint & { clearRadius: number };
	ringInnerRadius: number;
	ringOuterRadius: number;
	seats: VillageSeat[];
	// One performer each; centred on the middle of the ring.
	lanes: VillageLane[];
	// Where a visitor stands to watch, facing the fire.
	audience: VillageSeat;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Wraps an angle into (-PI, PI]. */
function wrapAngle(angle: number): number {
	let a = angle % TAU;
	if (a > Math.PI) a -= TAU;
	if (a <= -Math.PI) a += TAU;
	return a;
}

function ringMid(fire: VillageCampfireRules): number {
	return (fire.ringInnerRadius + fire.ringOuterRadius) / 2;
}

export function planCampLayout(rules: VillageRules): VillageCampLayout {
	const fire = rules.campfire;
	const around = (angle: number, radius: number): VillagePoint => ({
		x: fire.x + Math.cos(angle) * radius,
		z: fire.z + Math.sin(angle) * radius,
	});

	const seats = fire.seatAnglesDegrees.map((degrees): VillageSeat => {
		const angle = degrees * DEG;
		return { ...around(angle, fire.seatRadius), facing: wrapAngle(angle + Math.PI) };
	});

	// Lanes fill the ring outside the audience wedge, evenly, starting at the
	// wedge's edge so the wedge stays clear.
	const gap = fire.audienceGapDegrees * DEG;
	const span = TAU - gap;
	const start = fire.audienceAngleDegrees * DEG + gap / 2;
	const lanes: VillageLane[] = [];
	for (let i = 0; i < fire.laneCount; i++) {
		const angle = wrapAngle(start + ((i + 0.5) / fire.laneCount) * span);
		lanes.push({ ...around(angle, ringMid(fire)), angle });
	}

	const audienceAngle = fire.audienceAngleDegrees * DEG;
	return {
		fire: { x: fire.x, z: fire.z, clearRadius: fire.clearRadius },
		ringInnerRadius: fire.ringInnerRadius,
		ringOuterRadius: fire.ringOuterRadius,
		seats,
		lanes,
		audience: {
			...around(audienceAngle, fire.audienceDistance),
			facing: wrapAngle(audienceAngle + Math.PI),
		},
	};
}

// How far either side of the fire a backdrop stone may stand, seen from the
// audience: wide enough for four stones, narrow enough that all four frame
// the lesson rather than flank the watcher.
const BACKDROP_HALF_ANGLE = 30 * DEG;

/**
 * True when a point reads as backdrop from the audience spot: past the fire
 * along the audience's line of sight, outside the clearing's rim where nobody
 * walks, and within the view either side of the fire. The standing stones
 * must all pass, so they frame the lesson instead of crowding the watcher.
 */
export function isBehindFireFromAudience(point: VillagePoint, rules: VillageRules): boolean {
	const fire = rules.campfire;
	const angle = fire.audienceAngleDegrees * DEG;
	const viewer = {
		x: fire.x + Math.cos(angle) * fire.audienceDistance,
		z: fire.z + Math.sin(angle) * fire.audienceDistance,
	};
	// The audience looks toward the fire, the opposite of its own angle.
	const lookX = -Math.cos(angle);
	const lookZ = -Math.sin(angle);
	const dx = point.x - viewer.x;
	const dz = point.z - viewer.z;
	const depth = dx * lookX + dz * lookZ;
	const side = dx * lookZ - dz * lookX;
	const pastFire = depth > fire.audienceDistance;
	const outsideRim = Math.hypot(point.x - fire.x, point.z - fire.z) > rules.arena.radius;
	const inView = Math.abs(Math.atan2(side, depth)) <= BACKDROP_HALF_ANGLE;
	return pastFire && outsideRim && inView;
}

/** True when the angle around the fire falls inside the audience's wedge. */
export function isInAudienceGap(angle: number, fire: VillageCampfireRules): boolean {
	const offset = wrapAngle(angle - fire.audienceAngleDegrees * DEG);
	return Math.abs(offset) < (fire.audienceGapDegrees * DEG) / 2;
}

/**
 * Keeps a walker in the clearing and out of the fire circle. A step that would
 * enter the ring's inner edge is turned into a step along that edge toward the
 * target, so someone crossing to the far side walks around the fire instead of
 * through it. A step past the clearing's rim is pulled back onto it.
 *
 * `innerRadius` defaults to the ring's inner edge; someone heading for a
 * seat by the fire, or to stand beside one, passes the fire's cleared circle
 * instead.
 */
export function keepToClearing(
	next: VillagePoint,
	target: VillagePoint,
	stepLength: number,
	rules: VillageRules,
	innerRadius = rules.campfire.ringInnerRadius,
): VillagePoint {
	const fire = rules.campfire;
	const dx = next.x - fire.x;
	const dz = next.z - fire.z;
	const radius = Math.sqrt(dx * dx + dz * dz);
	const rim = rules.arena.radius;

	if (radius > rim) {
		return { x: fire.x + (dx / radius) * rim, z: fire.z + (dz / radius) * rim };
	}
	if (radius >= innerRadius) return next;

	const inner = innerRadius;
	const angle = Math.atan2(dz, dx);
	const toTarget = wrapAngle(Math.atan2(target.z - fire.z, target.x - fire.x) - angle);
	// Exactly opposite is ambiguous; always go the positive way round so the
	// choice is the same in every engine.
	const direction = toTarget >= 0 ? 1 : -1;
	const turn = Math.min(Math.abs(toTarget), stepLength / inner) * direction;
	return {
		x: fire.x + Math.cos(angle + turn) * inner,
		z: fire.z + Math.sin(angle + turn) * inner,
	};
}

/**
 * Where two people stand for a lesson: side by side on the middle of the
 * ring, `spacing` apart, halfway round between where they are now. If halfway
 * falls in the audience's wedge, they meet at its edge instead, so the fire
 * stays in view. The first point is for `a`.
 */
export function lessonSpots(
	a: VillagePoint,
	b: VillagePoint,
	spacing: number,
	rules: VillageRules,
): [VillagePoint, VillagePoint] {
	const fire = rules.campfire;
	const angleA = Math.atan2(a.z - fire.z, a.x - fire.x);
	const angleB = Math.atan2(b.z - fire.z, b.x - fire.x);
	let mid = Math.atan2(Math.sin(angleA) + Math.sin(angleB), Math.cos(angleA) + Math.cos(angleB));

	const radius = ringMid(fire);
	const half = spacing / 2 / radius;
	const audience = fire.audienceAngleDegrees * DEG;
	const edge = (fire.audienceGapDegrees * DEG) / 2 + half;
	const offset = wrapAngle(mid - audience);
	if (Math.abs(offset) < edge) mid = audience + (offset >= 0 ? edge : -edge);

	// Whoever is clockwise of the other takes the clockwise spot, so neither
	// has to cross the other's path to reach it.
	const sign = wrapAngle(angleB - angleA) >= 0 ? 1 : -1;
	const at = (angle: number): VillagePoint => ({
		x: fire.x + Math.cos(angle) * radius,
		z: fire.z + Math.sin(angle) * radius,
	});
	return [at(mid - sign * half), at(mid + sign * half)];
}

/**
 * The colour of a sequence: its seed's stone colour, variations included;
 * for anything the visitor carries, its own colour if it brought one, else
 * the visitor's stone colour.
 */
export function sequenceColour(rules: VillageRules, sequenceId: string): string | null {
	const seedId = seedIdOf(sequenceId);
	const stone = rules.stones.find((s) => s.sequenceId === seedId);
	if (stone) return stone.colour;
	const carried = rules.visitor.sequences.find((s) => s.sequenceId === seedId);
	return carried ? (carried.colour ?? rules.visitor.stone.colour) : null;
}

/** Steps in a sequence: its seed's count, variations included. */
export function sequenceStepCount(rules: VillageRules, sequenceId: string): number {
	const seedId = seedIdOf(sequenceId);
	const seed =
		rules.stones.find((stone) => stone.sequenceId === seedId) ??
		rules.visitor.sequences.find((carried) => carried.sequenceId === seedId);
	return seed?.steps ?? 1;
}

/**
 * Where students stand to keep a seated elder company: in a short row on the
 * seat's side of the fire, a little further out than the seat, centred on it.
 * `index` is this student's place among `count`.
 */
export function studentSpot(
	seat: VillagePoint,
	index: number,
	count: number,
	rules: VillageRules,
): VillagePoint {
	const fire = rules.campfire;
	const { studentStandRadius, studentSpacing } = rules.passing;
	const angle = Math.atan2(seat.z - fire.z, seat.x - fire.x);
	const offset = (index - (count - 1) / 2) * (studentSpacing / studentStandRadius);
	return {
		x: fire.x + Math.cos(angle + offset) * studentStandRadius,
		z: fire.z + Math.sin(angle + offset) * studentStandRadius,
	};
}
