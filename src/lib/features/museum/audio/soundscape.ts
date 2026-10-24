/**
 * Unified soundscape accessor.
 *
 * Merges curated entries (soundscape-manifest.ts) with API-fetched entries
 * (soundscape-candidates.generated.ts) into a single per-wing candidate pool.
 * Curated candidates come first; generated ones follow.
 */

import {
	CURATED_WING_SOUNDSCAPES,
	type AudioCandidate,
	type WingSoundscape,
} from "./soundscape-manifest";
import { GENERATED_WING_CANDIDATES } from "./soundscape-candidates.generated";

function mergeWings(): WingSoundscape[] {
	const byId = new Map<string, WingSoundscape>();

	for (const wing of CURATED_WING_SOUNDSCAPES) {
		byId.set(wing.wingId, {
			wingId: wing.wingId,
			wingName: wing.wingName,
			candidates: [...wing.candidates],
			defaultCandidateId: wing.defaultCandidateId,
			ambienceOnly: wing.ambienceOnly,
		});
	}

	for (const gen of GENERATED_WING_CANDIDATES) {
		const existing = byId.get(gen.wingId);
		if (!existing || existing.ambienceOnly) continue;
		const seen = new Set(existing.candidates.map((c) => c.id));
		for (const cand of gen.candidates) {
			if (seen.has(cand.id)) continue;
			existing.candidates.push(cand);
			seen.add(cand.id);
		}
	}

	return Array.from(byId.values());
}

export const WING_SOUNDSCAPES: WingSoundscape[] = mergeWings();

export function getSoundscapeForWing(wingId: string): WingSoundscape | undefined {
	return WING_SOUNDSCAPES.find((w) => w.wingId === wingId);
}

export function getCandidate(wingId: string, candidateId: string): AudioCandidate | undefined {
	return getSoundscapeForWing(wingId)?.candidates.find((c) => c.id === candidateId);
}

/** Public path to a candidate's audio file, served from `static/`. */
export function candidateAudioUrl(wingId: string, candidate: AudioCandidate): string {
	return `/audio/soundscapes/${wingId}/${candidate.file}`;
}

export type { AudioCandidate, WingSoundscape } from "./soundscape-manifest";
