/**
 * Museum Wing Soundscape Manifest - Candidate Pools
 *
 * Each wing has a POOL of candidate ambient tracks. Inside the museum, the
 * user opens the audition bubble (bottom-left) to play through candidates
 * and pick the one they want to hear in each room.
 *
 * Two sources fill the pool:
 *   1. Curated entries in this file (hand-picked, below)
 *   2. Auto-fetched entries in ./soundscape-candidates.generated.ts
 *      (produced by `node scripts/search-soundscapes.cjs`)
 *
 * Audio files live in `static/audio/soundscapes/<wingId>/<candidate.file>`.
 * They are NOT in the repo - download them with `node scripts/fetch-soundscapes.cjs`.
 *
 * Licensing: only CC0 or CC-BY-4.0. No NonCommercial, no ShareAlike-copyleft.
 */

export type AudioLicense = "CC0" | "CC-BY-4.0";
export type AudioSource = "freesound" | "pixabay" | "manual";

export interface AudioCandidate {
	/** Stable identifier - used as filename root and for user preferences. */
	id: string;
	title: string;
	/** Filename on disk (under static/audio/soundscapes/<wingId>/). */
	file: string;
	sourceUrl: string;
	attribution: string;
	license: AudioLicense;
	/** "M:SS" format. */
	duration: string;
	/** Suggested playback volume 0..1. User can override. */
	volume: number;
	source: AudioSource;
	/** Freesound sound ID - enables re-fetching the preview URL. */
	freesoundId?: number;
	/** Pixabay track ID. */
	pixabayId?: number;
	notes?: string;
}

export interface WingSoundscape {
	wingId: string;
	wingName: string;
	candidates: AudioCandidate[];
	/** Which candidate plays by default. Falls back to candidates[0] if unset or missing. */
	defaultCandidateId?: string;
	/**
	 * The room makes its own sound (built live, e.g. audio/village-ambience.ts)
	 * and plays no music: fetched candidates are ignored and the last wing's
	 * track fades out on entry.
	 */
	ambienceOnly?: boolean;
}

// Each wing's first candidate is the original hand-picked track.
// The API fetcher appends more candidates via soundscape-candidates.generated.ts.

export const CURATED_WING_SOUNDSCAPES: WingSoundscape[] = [
	{ wingId: "entrance", wingName: "Entrance Lobby", candidates: [] },
	{
		wingId: "vulcan-cave",
		wingName: "Vulcan Cave",
		candidates: [
			{
				id: "cave-drips-sclolex",
				title: "Water Dripping in Cave",
				file: "cave-drips-sclolex.mp3",
				sourceUrl: "https://freesound.org/people/Sclolex/sounds/177958/",
				attribution: "Sclolex (Freesound)",
				license: "CC0",
				duration: "1:30",
				volume: 0.5,
				source: "freesound",
				freesoundId: 177958,
				notes: "Processed cave ambience - kept as a texture layer alongside musical picks.",
			},
		],
	},
	{ wingId: "egyptian", wingName: "Egyptian Wing", candidates: [] },
	{ wingId: "renaissance", wingName: "Renaissance Wing", candidates: [] },
	{ wingId: "victorian", wingName: "Victorian Wing", candidates: [] },
	{ wingId: "digital", wingName: "Digital Wing", candidates: [] },
	{ wingId: "suppression", wingName: "The Suppression", candidates: [] },
	{ wingId: "cross-reference", wingName: "Cross-Reference Room", candidates: [] },
	{ wingId: "crumble", wingName: "The Crumble", candidates: [] },
	{
		wingId: "gallery",
		wingName: "K's Gallery",
		candidates: [
			{
				id: "gallery-music-box-drfx",
				title: "Music Box Melody",
				file: "gallery-music-box-drfx.mp3",
				sourceUrl: "https://freesound.org/people/DRFX/sounds/338986/",
				attribution: "DRFX (Freesound)",
				license: "CC0",
				duration: "0:16",
				volume: 0.2,
				source: "freesound",
				freesoundId: 338986,
				notes: "Short loopable music box melody. Quiet for distant warmth.",
			},
		],
	},
	{
		wingId: "fear",
		wingName: "Room of Fear",
		candidates: [
			{
				id: "fear-quasi-drone-bassimat",
				title: "Quasi Drone",
				file: "fear-quasi-drone-bassimat.mp3",
				sourceUrl: "https://freesound.org/people/bassimat/sounds/840934/",
				attribution: "bassimat (Freesound)",
				license: "CC0",
				duration: "10:08",
				volume: 0.45,
				source: "freesound",
				freesoundId: 840934,
				notes: "Dual-drone with slight beating. Musical texture, deeply unsettling.",
			},
		],
	},
	{ wingId: "isolation", wingName: "Room of Isolation", candidates: [] },
	// Fire and night air from the village itself; no music here.
	{ wingId: "collaboration", wingName: "Room of Collaboration", candidates: [], ambienceOnly: true },
	{ wingId: "gift-shop", wingName: "Gift Shop", candidates: [] },
	{ wingId: "vtg-wing", wingName: "The Vulcan Wing", candidates: [] },
	{ wingId: "construction-zone", wingName: "Construction Zone", candidates: [] },
	{ wingId: "janitor", wingName: "Janitor's Closet", candidates: [] },
];
