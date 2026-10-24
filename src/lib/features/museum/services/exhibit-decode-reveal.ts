/**
 * What a decode console reveals a sequence to be, e.g. "OOGA" for the
 * Cross-Reference Room's tablet. The exhibit's own word spells every step,
 * connective forms included ("OOYGDA"); the reveal is the word the visitor
 * walks away with, so the pocket, the village's story and its captions all
 * name the sequence by it.
 */

import { ROOM_CONTENT } from "../data/museum-room-content";

let reveals: Map<string, string> | null = null;

export function decodeRevealOf(sequenceId: string): string | null {
	if (!reveals) {
		reveals = new Map();
		for (const room of Object.values(ROOM_CONTENT)) {
			for (const exhibit of Object.values(room.exhibits ?? {})) {
				const interaction = exhibit.interaction;
				if (interaction?.kind === "decode") reveals.set(interaction.sequenceId, interaction.reveal);
			}
		}
	}
	return reveals.get(sequenceId) ?? null;
}
