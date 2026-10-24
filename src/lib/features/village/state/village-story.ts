/**
 * The village's events as plain sentences, for the lab's story log, and the
 * one-line caption the room shows when a founding sequence is lost.
 *
 * The sim reports ids; this turns them into names and words. Who someone was
 * and what they knew is read from the snapshots on either side of the events,
 * so a person who died this frame can still be named.
 */

import { VISITOR_ID, type VillageEvent } from "../domain/village-types";
import type { VillageSnapshot } from "../engine/village-snapshot";
import { transformOf, type VillageTransform } from "../domain/village-catalogue";

export type VillageStoryKind = "lesson" | "birth" | "death" | "loss" | "invention" | "change";

export interface VillageStoryLine {
	tick: number;
	kind: VillageStoryKind;
	text: string;
}

export interface VillageStoryContext {
	nameOf(avatarId: string): string;
	// The display word for a sequence id (simplified, ready to show).
	wordOf(sequenceId: string): string;
	// What someone knew just before these events; empty if unknown.
	knewBefore(avatarId: string): readonly string[];
	isSeed(sequenceId: string): boolean;
	// True for a sequence the visitor brought (its stone is the visitor's).
	// Lines about it speak to the visitor in the second person.
	fromVisitor?(sequenceId: string): boolean;
}

// How a variation is described next to its seed's word.
const VARIATION_PHRASES: Record<VillageTransform, (word: string) => string> = {
	mirror: (word) => `a mirrored ${word}`,
	flip: (word) => `a flipped ${word}`,
	rotate: (word) => `a turned ${word}`,
	swap: (word) => `a hand-swapped ${word}`,
	invert: (word) => `an inverted ${word}`,
	rewind: (word) => `${word} played backwards`,
};

function sequencePhrase(sequenceId: string, ctx: VillageStoryContext): string {
	const word = ctx.wordOf(sequenceId);
	const transform = transformOf(sequenceId);
	return transform ? VARIATION_PHRASES[transform](word) : `the sequence ${word}`;
}

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The caption the room shows when the last person who knew a founding sequence is gone. */
export function lossCaption(word: string): string {
	return `Nobody learned ${word} in time.`;
}

/** One sentence per event worth telling, in the order they happened. */
export function describeVillageEvents(
	events: readonly VillageEvent[],
	ctx: VillageStoryContext,
): VillageStoryLine[] {
	const lines: VillageStoryLine[] = [];
	const diedAt = new Map<number, string[]>();
	const inheritedBy = new Set(
		events.filter((e) => e.type === "sequence:inherited").map((e) => e.avatarId),
	);
	const say = (event: VillageEvent, kind: VillageStoryKind, text: string) =>
		lines.push({ tick: event.tick, kind, text });

	const brought = (sequenceId: string) => ctx.fromVisitor?.(sequenceId) ?? false;

	for (const event of events) {
		switch (event.type) {
			case "teaching:completed":
				if (event.teacherId === VISITOR_ID) {
					say(
						event,
						"lesson",
						`${ctx.nameOf(event.learnerId)} learned ${ctx.wordOf(event.sequenceId)} from you.`,
					);
					break;
				}
				if (brought(event.sequenceId)) {
					say(
						event,
						"lesson",
						`${ctx.nameOf(event.teacherId)} taught ${ctx.nameOf(event.learnerId)} ${ctx.wordOf(event.sequenceId)}, which you brought.`,
					);
					break;
				}
				say(
					event,
					"lesson",
					`${ctx.nameOf(event.teacherId)} taught ${ctx.nameOf(event.learnerId)} ${sequencePhrase(event.sequenceId, ctx)}.`,
				);
				break;
			case "sequence:inherited":
				say(
					event,
					"birth",
					`${ctx.nameOf(event.avatarId)} was born knowing ${sequencePhrase(event.sequenceId, ctx)}, from ${ctx.nameOf(event.elderId)}.`,
				);
				break;
			case "entity:born":
				if (!inheritedBy.has(event.avatarId)) {
					say(event, "birth", `${ctx.nameOf(event.avatarId)} joined the village.`);
				}
				break;
			case "entity:died": {
				const list = diedAt.get(event.tick) ?? [];
				list.push(event.avatarId);
				diedAt.set(event.tick, list);
				say(event, "death", `${ctx.nameOf(event.avatarId)} has died.`);
				break;
			}
			case "sequence:invented":
				say(
					event,
					"invention",
					`${ctx.nameOf(event.avatarId)} made up ${sequencePhrase(event.sequenceId, ctx)}.`,
				);
				break;
			case "sequence:forgotten":
				say(
					event,
					"change",
					`${ctx.nameOf(event.avatarId)} forgot ${sequencePhrase(event.sequenceId, ctx)}.`,
				);
				break;
			case "sequence:extinct": {
				const word = ctx.wordOf(event.sequenceId);
				const yours = brought(event.sequenceId);
				if (!ctx.isSeed(event.sequenceId) && !yours) {
					say(event, "change", `${capitalise(sequencePhrase(event.sequenceId, ctx))} is gone.`);
					break;
				}
				const diedKnowing = (diedAt.get(event.tick) ?? []).some((id) =>
					ctx.knewBefore(id).includes(event.sequenceId),
				);
				const named = yours ? `${word}, which you brought,` : word;
				say(
					event,
					"loss",
					diedKnowing
						? `The last person who knew ${named} has died.`
						: yours
							? `Nobody remembers ${word}, which you brought.`
							: `Nobody remembers ${word} now.`,
				);
				break;
			}
			case "monument:placed":
				if (brought(event.sequenceId)) {
					say(event, "change", `A stone is lit for ${ctx.wordOf(event.sequenceId)}.`);
				}
				break;
			case "monument:relit":
				say(event, "change", `The stone for ${ctx.wordOf(event.sequenceId)} is lit again.`);
				break;
			case "generation:changed":
				say(event, "change", `Generation ${event.generation} is now the oldest alive.`);
				break;
		}
	}
	return lines;
}

/**
 * A story context from the snapshots either side of a batch of events. Names
 * are looked up in the later snapshot first (newborns), then the earlier one
 * (the dead).
 */
export function storyContextFrom(
	before: VillageSnapshot | null,
	after: VillageSnapshot,
	wordOf: (sequenceId: string) => string,
	seedIds: ReadonlySet<string>,
): VillageStoryContext {
	const visitorStones = new Set(
		after.world.stones.filter((stone) => stone.fromVisitor).map((stone) => stone.sequenceId),
	);
	const find = (id: string) =>
		after.avatars.find((a) => a.id === id) ?? before?.avatars.find((a) => a.id === id);
	return {
		nameOf: (id) => find(id)?.name ?? "Someone",
		wordOf,
		knewBefore: (id) => before?.avatars.find((a) => a.id === id)?.knownSequenceIds ?? [],
		isSeed: (id) => seedIds.has(id),
		fromVisitor: (id) => visitorStones.has(id),
	};
}
