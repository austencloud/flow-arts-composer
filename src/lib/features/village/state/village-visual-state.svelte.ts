/**
 * Village Visual State - what the renderer and the lab log show on top of the
 * sim: a stone's relight flash, the room's caption (a loss, or a lesson the
 * visitor gave) and the story so far. Nothing here feeds back into the sim.
 */

import type { VillageState } from "./village-state.svelte";
import {
	describeVillageEvents,
	lossCaption,
	storyContextFrom,
	type VillageStoryLine,
} from "./village-story";
import { villageSeedWord } from "../services/village-sequence-catalogue";
import { seedIdOf } from "../domain/village-catalogue";
import { VISITOR_ID } from "../domain/village-types";
import { decodeRevealOf } from "#lib/features/museum/services/exhibit-decode-reveal.js";

/**
 * The word people see for a sequence. A sequence the museum's decode console
 * reveals goes by that reveal ("OOGA"), which is what the visitor carried in;
 * everything else by its seed's word (villageSeedWord).
 */
export function villageWord(sequenceId: string): string {
	return decodeRevealOf(seedIdOf(sequenceId)) ?? villageSeedWord(sequenceId);
}

export interface VillageCaption {
	id: number;
	// A founding sequence lost, or someone learning from the visitor.
	kind: "loss" | "taught";
	sequenceId: string;
	text: string;
	// Where it hangs: beside the stone that just went dark or lit.
	x: number;
	z: number;
}

export interface VillageStoryEntry extends VillageStoryLine {
	id: number;
}

// How long a caption stays in the room, fades included.
export const CAPTION_SECONDS = 7;
// The lab log keeps this many lines, newest first.
const STORY_LENGTH = 60;
// How long a relit stone flares.
const RELIGHT_MS = 1300;

export interface VillageVisualState {
	// Sequence ids whose stone is mid-flare
	readonly relightingStones: ReadonlySet<string>;
	readonly caption: VillageCaption | null;
	// Newest first
	readonly story: readonly VillageStoryEntry[];

	triggerRelight(sequenceId: string): void;
	showCaption(caption: Omit<VillageCaption, "id">): void;
	tellStory(lines: readonly VillageStoryLine[]): void;
	clearStory(): void;
}

let nextId = 0;

export function createVillageVisualState(): VillageVisualState {
	let relightingStones = $state.raw<ReadonlySet<string>>(new Set());
	let caption = $state.raw<VillageCaption | null>(null);
	let story = $state.raw<VillageStoryEntry[]>([]);
	const relightTimers = new Map<string, ReturnType<typeof setTimeout>>();
	let captionTimer: ReturnType<typeof setTimeout> | undefined;

	return {
		get relightingStones() { return relightingStones; },
		get caption() { return caption; },
		get story() { return story; },


		triggerRelight(sequenceId) {
			const existing = relightTimers.get(sequenceId);
			if (existing !== undefined) clearTimeout(existing);
			relightingStones = new Set([...relightingStones, sequenceId]);
			relightTimers.set(
				sequenceId,
				setTimeout(() => {
					relightTimers.delete(sequenceId);
					relightingStones = new Set([...relightingStones].filter((id) => id !== sequenceId));
				}, RELIGHT_MS),
			);
		},

		showCaption(next) {
			// One caption at a time; a newer one replaces the last.
			clearTimeout(captionTimer);
			const shown = { ...next, id: nextId++ };
			caption = shown;
			captionTimer = setTimeout(() => {
				if (caption?.id === shown.id) caption = null;
			}, CAPTION_SECONDS * 1000);
		},

		tellStory(lines) {
			if (lines.length === 0) return;
			const added = lines.map((line) => ({ ...line, id: nextId++ })).reverse();
			story = [...added, ...story].slice(0, STORY_LENGTH);
		},

		clearStory() {
			story = [];
		},
	};
}

/**
 * Turn the sim's events into what people see: story lines, a stone's
 * relight, the loss caption when a founding sequence dies out, and the
 * taught caption when someone learns from the visitor (the same sentence the
 * story tells, hung by the visitor's stone). Returns the unsubscribe.
 */
export function followVillage(villageState: VillageState, visualState: VillageVisualState): () => void {
	const seeds = new Set(villageState.rules.seedSequenceIds);
	const fire = villageState.rules.campfire;
	let before = villageState.snapshot;

	return villageState.onEvents((events, after) => {
		const context = storyContextFrom(before, after, villageWord, seeds);
		visualState.tellStory(describeVillageEvents(events, context));
		for (const event of events) {
			if (event.type === "monument:relit") {
				visualState.triggerRelight(event.sequenceId);
			} else if (event.type === "teaching:completed" && event.teacherId === VISITOR_ID) {
				const stone = after.world.stones.find((s) => s.fromVisitor);
				const learner = after.avatars.find((a) => a.id === event.learnerId);
				const line = describeVillageEvents([event], context)[0];
				if (!line) continue;
				visualState.showCaption({
					kind: "taught",
					sequenceId: event.sequenceId,
					text: line.text,
					x: stone?.x ?? learner?.x ?? fire.x,
					z: stone?.z ?? learner?.z ?? fire.z,
				});
			} else if (event.type === "sequence:extinct" && seeds.has(event.sequenceId)) {
				const stone = after.world.stones.find((s) => s.sequenceId === event.sequenceId);
				visualState.showCaption({
					kind: "loss",
					sequenceId: event.sequenceId,
					text: lossCaption(villageWord(event.sequenceId)),
					x: stone?.x ?? fire.x,
					z: stone?.z ?? fire.z,
				});
			}
		}
		before = after;
	});
}
