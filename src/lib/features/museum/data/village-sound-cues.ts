/**
 * The Room of Collaboration's sound cues (village-sound-cues.json): small,
 * quiet changes to the room's ambience when something happens in the village.
 * Never alerts, never music.
 *
 * Effects, as the ambience plays them (audio/village-ambience.ts):
 *   - fire-flare: the fire's crackle and body lift, as if a log caught.
 *   - fire-gutter: the fire sinks and darkens, then recovers.
 *   - air-swell: a low, soft rise of moving air.
 *   - ember-rise, hearth-breath, ember-fade: one-shot sounds of their own,
 *     made in code (audio/village-moment-sounds.ts), for the visitor's
 *     moments: embers catching, the fire drawing a breath, embers dying.
 * Each rises over `attack`, holds, then falls back over `release`; `level` is
 * the share of the ambience bed it adds or takes away (0 to 1).
 */

import type { VillageMomentKind } from "#lib/features/village/state/village-moments.js";
import { VILLAGE_MOMENT_EFFECTS } from "../audio/village-moment-sounds";
import cueTable from "./village-sound-cues.json";

export const VILLAGE_SOUND_EFFECTS = [
	"fire-flare",
	"fire-gutter",
	"air-swell",
	...VILLAGE_MOMENT_EFFECTS,
] as const;
export type VillageSoundEffect = (typeof VILLAGE_SOUND_EFFECTS)[number];

export interface VillageSoundCue {
	moment: VillageMomentKind;
	effect: VillageSoundEffect;
	level: number;
	attack: number;
	hold: number;
	release: number;
}

export const VILLAGE_SOUND_CUES = cueTable.cues as VillageSoundCue[];

export function cuesForMoment(moment: VillageMomentKind): VillageSoundCue[] {
	return VILLAGE_SOUND_CUES.filter((cue) => cue.moment === moment);
}
