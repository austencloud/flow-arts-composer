/**
 * Soundscape Player State Factory
 *
 * Owns two HTMLAudioElements and crossfades between candidate tracks. Tracks
 * per-wing preferences in localStorage so the user's chosen track for each
 * room persists across sessions. Respects the browser's autoplay policy by
 * deferring first playback until the user interacts with the page.
 *
 * Rooms that build their sound live (procedural ambience) play it through
 * proceduralOutput(), which shares the same gate, mute and master volume.
 */

import {
	WING_SOUNDSCAPES,
	getSoundscapeForWing,
	getCandidate,
	candidateAudioUrl,
	type AudioCandidate,
} from "./soundscape";

const PREFS_KEY = "museum-soundscape-prefs-v1";
const MASTER_VOLUME_KEY = "museum-soundscape-master-volume";
const MUTED_KEY = "museum-soundscape-muted";
const CROSSFADE_MS = 2000;
const FADE_STEPS = 40; // 50ms per step

interface WingPreference {
	candidateId: string;
	/** User's per-candidate volume override (0..1). Falls back to candidate.volume. */
	volume?: number;
}

type WingPrefs = Record<string, WingPreference>;

function loadPrefs(): WingPrefs {
	try {
		const raw = localStorage.getItem(PREFS_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

function savePrefs(prefs: WingPrefs): void {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		/* localStorage full / blocked - non-fatal */
	}
}

function loadNumber(key: string, fallback: number): number {
	try {
		const raw = localStorage.getItem(key);
		if (raw === null) return fallback;
		const n = parseFloat(raw);
		return Number.isFinite(n) ? n : fallback;
	} catch {
		return fallback;
	}
}

function loadBool(key: string, fallback: boolean): boolean {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : raw === "true";
	} catch {
		return fallback;
	}
}

/** Pick the default candidate for a wing given user preferences. */
function resolvePreferredCandidate(wingId: string, prefs: WingPrefs): AudioCandidate | null {
	const wing = getSoundscapeForWing(wingId);
	if (!wing || wing.candidates.length === 0) return null;
	const pref = prefs[wingId];
	if (pref) {
		const found = wing.candidates.find((c) => c.id === pref.candidateId);
		if (found) return found;
	}
	if (wing.defaultCandidateId) {
		const found = wing.candidates.find((c) => c.id === wing.defaultCandidateId);
		if (found) return found;
	}
	return wing.candidates[0] ?? null;
}

export function createSoundscapePlayer() {
	let prefs = $state<WingPrefs>({});
	let masterVolume = $state(0.7);
	let muted = $state(false);

	let currentWingId = $state<string | null>(null);
	let activeCandidateId = $state<string | null>(null);
	let isPlaying = $state(false);
	let hasUserInteracted = $state(false);
	let panelOpen = $state(false);

	// ── Audio elements (two for crossfade) ──
	let elA: HTMLAudioElement | null = null;
	let elB: HTMLAudioElement | null = null;
	let activeEl: HTMLAudioElement | null = null;
	let fadeTimer: ReturnType<typeof setInterval> | null = null;

	// ── Live (procedural) sound: one context, made after the first gesture ──
	let audioContext: AudioContext | null = null;
	let proceduralGain: GainNode | null = null;

	// On mount, load prefs. Deferred so SSR doesn't touch localStorage.
	function initialize(): () => void {
		prefs = loadPrefs();
		masterVolume = loadNumber(MASTER_VOLUME_KEY, 0.7);
		muted = loadBool(MUTED_KEY, false);

		elA = new Audio();
		elB = new Audio();
		for (const el of [elA, elB]) {
			el.loop = true;
			el.preload = "auto";
			el.crossOrigin = "anonymous";
		}

		const unlock = () => {
			if (hasUserInteracted) return;
			hasUserInteracted = true;
			// Start playback now that we have a user gesture.
			if (currentWingId && activeCandidateId) {
				const cand = getCandidate(currentWingId, activeCandidateId);
				if (cand) crossfadeTo(cand);
			}
		};
		window.addEventListener("pointerdown", unlock, { once: true });
		window.addEventListener("keydown", unlock, { once: true });

		return () => {
			window.removeEventListener("pointerdown", unlock);
			window.removeEventListener("keydown", unlock);
			if (fadeTimer !== null) clearInterval(fadeTimer);
			elA?.pause();
			elB?.pause();
			void audioContext?.close();
			audioContext = null;
			proceduralGain = null;
		};
	}

	function effectiveVolumeFor(cand: AudioCandidate): number {
		if (muted) return 0;
		const pref = prefs[currentWingId ?? ""];
		const override = pref?.candidateId === cand.id ? pref.volume : undefined;
		const candVol = override ?? cand.volume;
		return masterVolume * candVol;
	}

	function crossfadeTo(cand: AudioCandidate): void {
		if (!elA || !elB || !currentWingId) return;
		activeCandidateId = cand.id;

		const nextEl = activeEl === elA ? elB : elA;
		const prevEl = activeEl;

		nextEl.src = candidateAudioUrl(currentWingId, cand);
		nextEl.volume = 0;
		const targetVol = effectiveVolumeFor(cand);

		const playPromise = hasUserInteracted ? nextEl.play() : Promise.resolve();
		Promise.resolve(playPromise)
			.then(() => {
				isPlaying = hasUserInteracted;
			})
			.catch(() => {
				// Autoplay blocked - will resume on unlock.
				isPlaying = false;
			});

		// Equal-power crossfade: nextVol = sin(t·π/2), prevVol = cos(t·π/2).
		// Keeps combined perceived loudness constant through the transition
		// instead of dipping ~6dB at t=0.5 (what a linear crossfade does).
		if (fadeTimer !== null) clearInterval(fadeTimer);
		const prevStartVol = prevEl?.volume ?? 0;
		let step = 0;
		fadeTimer = setInterval(() => {
			step++;
			const t = Math.min(1, step / FADE_STEPS);
			const theta = (t * Math.PI) / 2;
			nextEl.volume = targetVol * Math.sin(theta);
			if (prevEl) prevEl.volume = prevStartVol * Math.cos(theta);
			if (step >= FADE_STEPS) {
				if (fadeTimer !== null) clearInterval(fadeTimer);
				fadeTimer = null;
				nextEl.volume = targetVol;
				if (prevEl) {
					prevEl.pause();
					prevEl.volume = 0;
				}
			}
		}, CROSSFADE_MS / FADE_STEPS);

		activeEl = nextEl;
	}

	/**
	 * Where live room sound plays: null until the visitor's first gesture, the
	 * same gate the tracks wait on. Its level follows mute and master volume.
	 */
	function proceduralOutput(): { context: AudioContext; destination: AudioNode } | null {
		if (!hasUserInteracted || typeof AudioContext === "undefined") return null;
		if (!audioContext || !proceduralGain) {
			audioContext = new AudioContext();
			proceduralGain = audioContext.createGain();
			proceduralGain.gain.value = muted ? 0 : masterVolume;
			proceduralGain.connect(audioContext.destination);
		}
		if (audioContext.state === "suspended") void audioContext.resume();
		return { context: audioContext, destination: proceduralGain };
	}

	/** Fade the playing track out, for a room that plays no music. */
	function fadeOutMusic(): void {
		const el = activeEl;
		activeCandidateId = null;
		if (!el) return;
		if (fadeTimer !== null) clearInterval(fadeTimer);
		const startVol = el.volume;
		let step = 0;
		fadeTimer = setInterval(() => {
			step++;
			const t = Math.min(1, step / FADE_STEPS);
			el.volume = startVol * Math.cos((t * Math.PI) / 2);
			if (step >= FADE_STEPS) {
				if (fadeTimer !== null) clearInterval(fadeTimer);
				fadeTimer = null;
				el.pause();
				el.volume = 0;
				isPlaying = false;
			}
		}, CROSSFADE_MS / FADE_STEPS);
	}

	/** Instantly sync the active element's volume to current settings. */
	function refreshActiveVolume(): void {
		if (audioContext && proceduralGain) {
			proceduralGain.gain.setTargetAtTime(muted ? 0 : masterVolume, audioContext.currentTime, 0.05);
		}
		if (!activeEl || !activeCandidateId || !currentWingId) return;
		const cand = getCandidate(currentWingId, activeCandidateId);
		if (!cand) return;
		activeEl.volume = effectiveVolumeFor(cand);
	}


	function setCurrentWing(wingId: string | null): void {
		// Corridors (null wingId) let the previous wing's music keep playing
		// until the player enters a NEW wing. That gives a clean crossfade
		// between rooms instead of a hard stop while walking between them.
		if (wingId === null) return;
		if (wingId === currentWingId) return;
		currentWingId = wingId;
		if (getSoundscapeForWing(wingId)?.ambienceOnly) {
			fadeOutMusic();
			return;
		}
		const cand = resolvePreferredCandidate(wingId, prefs);
		if (cand) crossfadeTo(cand);
	}

	/** Play a specific candidate NOW (audition). Does not save as preference. */
	function playCandidate(wingId: string, candidateId: string): void {
		if (wingId !== currentWingId) currentWingId = wingId;
		const cand = getCandidate(wingId, candidateId);
		if (cand) crossfadeTo(cand);
	}

	/** Save the currently-playing candidate as the user's preference for this wing. */
	function saveAsPreference(): void {
		if (!currentWingId || !activeCandidateId) return;
		const existing = prefs[currentWingId];
		prefs = {
			...prefs,
			[currentWingId]: {
				candidateId: activeCandidateId,
				volume: existing?.candidateId === activeCandidateId ? existing.volume : undefined,
			},
		};
		savePrefs(prefs);
	}

	function setMasterVolume(v: number): void {
		masterVolume = Math.max(0, Math.min(1, v));
		localStorage.setItem(MASTER_VOLUME_KEY, String(masterVolume));
		refreshActiveVolume();
	}

	function toggleMute(): void {
		muted = !muted;
		localStorage.setItem(MUTED_KEY, String(muted));
		refreshActiveVolume();
	}

	function setCandidateVolume(wingId: string, candidateId: string, volume: number): void {
		const clamped = Math.max(0, Math.min(1, volume));
		const existing = prefs[wingId];
		prefs = {
			...prefs,
			[wingId]: {
				candidateId: existing?.candidateId ?? candidateId,
				volume: clamped,
			},
		};
		savePrefs(prefs);
		if (wingId === currentWingId && candidateId === activeCandidateId) {
			refreshActiveVolume();
		}
	}

	function togglePanel(): void {
		panelOpen = !panelOpen;
	}

	function closePanel(): void {
		panelOpen = false;
	}

	return {
		get currentWingId() { return currentWingId; },
		get activeCandidateId() { return activeCandidateId; },
		get isPlaying() { return isPlaying; },
		get hasUserInteracted() { return hasUserInteracted; },
		get masterVolume() { return masterVolume; },
		get muted() { return muted; },
		get panelOpen() { return panelOpen; },
		get allWings() { return WING_SOUNDSCAPES; },
		get currentWing() {
			return currentWingId ? (getSoundscapeForWing(currentWingId) ?? null) : null;
		},
		getPreferenceFor(wingId: string): WingPreference | undefined {
			return prefs[wingId];
		},
		initialize,
		proceduralOutput,
		setCurrentWing,
		playCandidate,
		saveAsPreference,
		setMasterVolume,
		toggleMute,
		setCandidateVolume,
		togglePanel,
		closePanel,
	};
}

export type SoundscapePlayer = ReturnType<typeof createSoundscapePlayer>;
