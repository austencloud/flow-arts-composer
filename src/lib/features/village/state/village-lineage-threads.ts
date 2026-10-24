/**
 * Threads of light between a learner and the person who taught them.
 *
 * Worked out from the snapshot, so the renderer only draws what this hands
 * back. A thread exists while both people live. When the teacher dies (from
 * the moment they start passing) the thread stays where the teacher last
 * stood and fades over a few seconds, and the learner keeps a faint glow of
 * the sequence's colour for as long as they carry it.
 *
 * The visitor is an endpoint too. Someone who learned from "visitor" has a
 * thread to where the visitor stands for as long as the caller passes that
 * position (the visitor is in the room); once it stops coming, the thread
 * lingers and goes dark the same way. The visitor leaves no glow: they left,
 * they did not die.
 *
 * Time is render-clock seconds, passed in, never read here.
 */

import { VISITOR_ID } from "../domain/village-types";
import type { VillageAvatarSnapshot } from "../engine/village-snapshot";

export interface LineageThread {
	key: string;
	learnerId: string;
	teacherId: string;
	sequenceId: string;
	colour: string;
	// Where the teacher last stood: the thread's far end while it lingers.
	teacherX: number;
	teacherZ: number;
	// When the teacher was seen dying; null while they live.
	fadingSince: number | null;
}

export const LINEAGE_THREAD_LINGER_SECONDS = 4;
// More than the village can plausibly need at once (eight people, a few
// teachers each); past it the oldest pairs simply go undrawn.
export const MAX_LINEAGE_THREADS = 24;

type ColourOf = (sequenceId: string) => string | null;

export interface LineageThreadOptions {
	lingerSeconds?: number;
	// Where the visitor stands now, in sim space, or null when they are not
	// in the room.
	visitor?: { x: number; z: number } | null;
}

function isLiving(avatar: VillageAvatarSnapshot | undefined): boolean {
	return avatar !== undefined && avatar.state !== "passing";
}

/** The next set of threads, given the last set and the latest snapshot. */
export function updateLineageThreads(
	previous: readonly LineageThread[],
	avatars: readonly VillageAvatarSnapshot[],
	colourOf: ColourOf,
	now: number,
	options: LineageThreadOptions = {},
): LineageThread[] {
	const lingerSeconds = options.lingerSeconds ?? LINEAGE_THREAD_LINGER_SECONDS;
	const visitor = options.visitor ?? null;
	const byId = new Map(avatars.map((a) => [a.id, a]));
	const before = new Map(previous.map((t) => [t.key, t]));
	const next = new Map<string, LineageThread>();

	for (const learner of avatars) {
		if (!isLiving(learner)) continue;
		for (const known of learner.knownSequences) {
			const teacherId = known.learnedFrom;
			if (!teacherId || teacherId === learner.id) continue;
			const key = `${learner.id}>${teacherId}`;
			if (next.has(key)) continue;
			const colour = colourOf(known.sequenceId);
			if (!colour) continue;

			const teacher =
				teacherId === VISITOR_ID ? null : (byId.get(teacherId) ?? null);
			const present = teacherId === VISITOR_ID ? visitor : teacher && isLiving(teacher) ? teacher : null;
			const last = before.get(key);
			if (present) {
				next.set(key, {
					key,
					learnerId: learner.id,
					teacherId,
					sequenceId: known.sequenceId,
					colour,
					teacherX: present.x,
					teacherZ: present.z,
					fadingSince: null,
				});
				continue;
			}
			// A teacher already gone before we ever drew the pair leaves only
			// the glow; there is no thread to linger.
			if (!last) continue;
			const fadingSince = last.fadingSince ?? now;
			if (now - fadingSince >= lingerSeconds) continue;
			next.set(key, {
				...last,
				teacherX: teacher?.x ?? last.teacherX,
				teacherZ: teacher?.z ?? last.teacherZ,
				fadingSince,
			});
		}
	}

	// Keep the order stable so a renderer's slot for a pair does not jump.
	const ordered = [
		...previous.filter((t) => next.has(t.key)).map((t) => next.get(t.key)!),
		...[...next.values()].filter((t) => !before.has(t.key)),
	];
	return ordered.slice(0, MAX_LINEAGE_THREADS);
}

/** 1 while the teacher lives, falling to 0 over the linger after they die. */
export function lineageThreadOpacity(
	thread: LineageThread,
	now: number,
	lingerSeconds = LINEAGE_THREAD_LINGER_SECONDS,
): number {
	if (thread.fadingSince === null) return 1;
	return Math.max(0, 1 - (now - thread.fadingSince) / lingerSeconds);
}

/**
 * Who glows, and in what colour: anyone still carrying a sequence taught by
 * someone who has died. The glow is the teacher's mark on the learner.
 */
export function lineageGlows(
	avatars: readonly VillageAvatarSnapshot[],
	colourOf: ColourOf,
): Map<string, string> {
	const living = new Set(avatars.filter(isLiving).map((a) => a.id));
	const glows = new Map<string, string>();
	for (const avatar of avatars) {
		if (!living.has(avatar.id)) continue;
		for (const known of avatar.knownSequences) {
			const teacherId = known.learnedFrom;
			if (!teacherId || teacherId === avatar.id || living.has(teacherId)) continue;
			if (teacherId === VISITOR_ID) continue;
			const colour = colourOf(known.sequenceId);
			if (colour) {
				glows.set(avatar.id, colour);
				break;
			}
		}
	}
	return glows;
}

/**
 * Elders sitting out their last moments glow in the colour of what they know
 * best, the thing their students carry on. The glow goes out first when they
 * pass (see village-passing-fade).
 */
export function elderGlows(
	avatars: readonly VillageAvatarSnapshot[],
	colourOf: ColourOf,
): Map<string, string> {
	const glows = new Map<string, string>();
	for (const avatar of avatars) {
		if (avatar.state !== "retiring" && avatar.state !== "seated" && avatar.state !== "passing") continue;
		let best: VillageAvatarSnapshot["knownSequences"][number] | null = null;
		for (const known of avatar.knownSequences) {
			if (!best || known.proficiency > best.proficiency) best = known;
		}
		const colour = best ? colourOf(best.sequenceId) : null;
		if (colour) glows.set(avatar.id, colour);
	}
	return glows;
}
