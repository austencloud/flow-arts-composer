/**
 * A villager's performance, planned the way Flow Fest plans a spinner's night
 * (flow-fest-phrase-brain.ts): phrases from what they know, each starting
 * where the hands were left, planted, turning or walking on the beat. The
 * village plays one performance at a time instead of a whole night, so the
 * plan is short and cut off where the chain would break.
 *
 * The plan is plain data, kept on the performer's social component and in
 * the snapshot, so the renderer plays the same phrases through
 * createPhrasePlayback and a C++ port can replay the plan without the brain.
 *
 * Units and angles are the sim's: metres, and a facing of 0 looks along +x
 * and turns toward +z, which is also the brain's yaw.
 */

import {
	planPhrases,
	type PhraseBrainEntry,
	type PhrasePoint,
	type ScheduledPhrase,
} from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.js";
import { joinDistance, type PhraseJoinState } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";
import type { VillageRules } from "../domain/village-rules";
import type { VillageEntity, VillagePerformance } from "../domain/village-types";
import { villagePhraseEntry } from "../domain/village-phrase-table";
import { sequenceStepCount } from "../domain/village-campfire";

export interface PerformanceSample {
	phrase: ScheduledPhrase;
	x: number;
	z: number;
	facing: number;
	done: boolean;
}

function wrapAngle(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function brainEntry(sequenceId: string): PhraseBrainEntry | null {
	const entry = villagePhraseEntry(sequenceId);
	return entry ? { id: sequenceId, name: sequenceId, beats: entry.beats, tags: entry.tags, joins: entry.joins } : null;
}

/**
 * One planted pass of a sequence the phrase table does not know (one the
 * visitor carried in from outside the catalogue): its joins are unknown, so
 * it is played once and not chained.
 */
function singlePass(sequenceId: string, beats: number, facing: number): ScheduledPhrase {
	return {
		startBeat: 0,
		beats,
		sequenceId,
		sequenceName: sequenceId,
		repeats: 1,
		plane: "wall",
		beatPlanes: Array.from({ length: beats }, () => ({ left: "wall" as const, right: "wall" as const })),
		mode: "planted",
		facingStart: facing,
		facingEnd: facing,
		facingTarget: facing,
		turnBeats: null,
		path: null,
		rest: false,
		timing: { jitterBeats: 0, tempoDrift: 0 },
	};
}

/**
 * The brain's plan up to its first break: a rest (the performer stops), or a
 * phrase that does not start where the last one left the hands. The brain
 * falls back to the nearest start when nothing in a small repertoire
 * continues the chain; the village ends the performance there instead.
 */
function keepChained(phrases: readonly ScheduledPhrase[]): ScheduledPhrase[] {
	const kept: ScheduledPhrase[] = [];
	let chain: PhraseJoinState | null = null;
	for (const phrase of phrases) {
		if (phrase.rest) break;
		const joins = villagePhraseEntry(phrase.sequenceId)?.joins;
		if (!joins) break;
		if (chain && joinDistance(joins.start, chain) !== 0) break;
		kept.push(phrase);
		chain = joins.end;
	}
	return kept;
}

/**
 * Plans a performance from where the performer stands. `sequenceIds` is
 * what they may play (an invention plays only the new sequence); `seed`
 * comes from the calling system's stream. Poi go to the brain as staffs with
 * no room to walk: it plans grid work only for poi, and planted staff
 * phrases are that, with the planes left to the poi's own rig.
 */
export function beginPerformance(
	entity: VillageEntity,
	rules: VillageRules,
	tick: number,
	sequenceIds: readonly string[],
	seed: number,
): VillagePerformance {
	const performance = rules.performance;
	const fire = rules.campfire;
	const home: PhrasePoint = { x: entity.transform.x, z: entity.transform.z };
	const outwardYaw = Math.atan2(fire.z - home.z, fire.x - home.x);
	const fromFire = Math.hypot(home.x - fire.x, home.z - fire.z);
	const poi = entity.identity.propType === "poi";
	const areaRadius = poi
		? 0
		: Math.max(0, Math.min(performance.areaRadius, fromFire - fire.seatRadius - performance.seatClearance));
	const lengthBeats = entity.lifecycle.phase === "elder" ? performance.beatsElder : performance.beatsAdult;

	const library = sequenceIds.map(brainEntry).filter((e): e is PhraseBrainEntry => e !== null);
	let phrases: ScheduledPhrase[] = [];
	if (library.length > 0) {
		const best = (id: string) => entity.knowledge.knownSequences.get(id)?.proficiency ?? 0;
		phrases = keepChained(
			planPhrases({
				performer: {
					id: entity.id,
					seed,
					characterId: entity.identity.avatarModelId,
					propFamily: poi ? "staff" : entity.identity.propType,
					personality: {
						skill: Math.max(...library.map((e) => best(e.id))),
						style: entity.personality.curiosity,
						energy: entity.personality.sociability,
					},
					home,
					areaRadius,
					outwardYaw,
				},
				tempoBpm: performance.tempoBpm,
				lengthBeats,
				library,
			}),
		);
	}
	if (phrases.length === 0) {
		const id = sequenceIds[0]!;
		phrases = [singlePass(id, villagePhraseEntry(id)?.beats ?? sequenceStepCount(rules, id), outwardYaw)];
	}
	const last = phrases.at(-1)!;
	return {
		startTick: tick,
		tempoBpm: performance.tempoBpm,
		beats: last.startBeat + last.beats,
		seed,
		home,
		areaRadius,
		outwardYaw,
		phrases,
	};
}

/** Beats into a performance at a tick (fractional ticks for the renderer). */
export function performanceBeat(performance: VillagePerformance, tick: number, ticksPerSecond: number): number {
	return ((tick - performance.startTick) / ticksPerSecond) * (performance.tempoBpm / 60);
}

/**
 * Where the performer is at a beat, for the sim: the phrase playing, the
 * position (along a walk's straight path, footfall by footfall evened out)
 * and the body's facing, eased to each phrase's target over its first pass
 * as the renderer's playback does.
 */
export function samplePerformance(performance: VillagePerformance, beat: number): PerformanceSample {
	const phrases = performance.phrases;
	let index = 0;
	while (index < phrases.length - 1 && phrases[index + 1]!.startBeat <= beat) index++;
	const phrase = phrases[index]!;
	const local = Math.max(0, beat - phrase.startBeat);

	let at = performance.home;
	for (let i = 0; i < index; i++) if (phrases[i]!.path) at = phrases[i]!.path!.to;
	let { x, z } = at;
	if (phrase.path) {
		const span = phrase.path.steps * phrase.path.beatsPerStep;
		const t = Math.min(1, local / span);
		x = phrase.path.from.x + (phrase.path.to.x - phrase.path.from.x) * t;
		z = phrase.path.from.z + (phrase.path.to.z - phrase.path.from.z) * t;
	}

	const from = index === 0 ? phrase.facingStart : phrases[index - 1]!.facingTarget;
	const pass = Math.max(1, Math.min(phrase.beatPlanes.length || phrase.beats / phrase.repeats, phrase.beats));
	const s = Math.max(0, Math.min(1, local / pass));
	const facing = wrapAngle(from + wrapAngle(phrase.facingTarget - from) * s * s * (3 - 2 * s));

	return { phrase, x, z, facing, done: beat >= performance.beats };
}
