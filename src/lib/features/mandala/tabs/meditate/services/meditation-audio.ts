import { browser } from "$app/env";
import type { AmbientTrack } from "../domain/meditation-types";

const AUDIO_BASE_PATH = "/audio/meditation";
const FADE_IN_SECONDS = 2;
const FADE_OUT_SECONDS = 3;
const DEFAULT_VOLUME = 0.6;
const AMBIENT_GAIN_RATIO = 0.4;
const BELL_GAIN_RATIO = 0.8;

export interface MeditationAudioService {
	startAmbient(track: AmbientTrack): void;
	stopAmbient(): void;
	playCompletionBell(): void;
	setVolume(gain: number): void;
	dispose(): void;
}

/** No-op implementation returned when Web Audio is unavailable (SSR, old browsers). */
const NOOP_SERVICE: MeditationAudioService = {
	startAmbient() {},
	stopAmbient() {},
	playCompletionBell() {},
	setVolume() {},
	dispose() {},
};

function audioFileName(track: string, ext: "ogg" | "mp3"): string {
	return `${AUDIO_BASE_PATH}/${track}.${ext}`;
}

/**
 * Attempts to fetch and decode an audio file.
 * Tries .ogg first (smaller, better quality), falls back to .mp3 (Safari compat).
 */
async function loadAudioBuffer(
	ctx: AudioContext,
	trackName: string,
): Promise<AudioBuffer | null> {
	for (const ext of ["ogg", "mp3"] as const) {
		try {
			const response = await fetch(audioFileName(trackName, ext));
			if (!response.ok) continue;
			const arrayBuffer = await response.arrayBuffer();
			return await ctx.decodeAudioData(arrayBuffer);
		} catch {
			// Try next format
		}
	}
	console.warn(
		`[meditation-audio] Failed to load audio for "${trackName}" in any format`,
	);
	return null;
}

function createLiveService(): MeditationAudioService {
	let ctx: AudioContext | null = null;
	let masterVolume = DEFAULT_VOLUME;

	const bufferCache = new Map<string, AudioBuffer>();

	// Active ambient state
	let ambientSource: AudioBufferSourceNode | null = null;
	let ambientGain: GainNode | null = null;
	let currentTrackName: string | null = null;

	function ensureContext(): AudioContext | null {
		if (ctx && ctx.state !== "closed") return ctx;
		try {
			ctx = new AudioContext();
			return ctx;
		} catch {
			console.warn(
				"[meditation-audio] AudioContext unavailable in this environment",
			);
			return null;
		}
	}

	async function getBuffer(trackName: string): Promise<AudioBuffer | null> {
		const cached = bufferCache.get(trackName);
		if (cached) return cached;

		const audioCtx = ensureContext();
		if (!audioCtx) return null;

		const buffer = await loadAudioBuffer(audioCtx, trackName);
		if (buffer) bufferCache.set(trackName, buffer);
		return buffer;
	}

	function fadeOutAndStop(
		source: AudioBufferSourceNode,
		gain: GainNode,
		audioCtx: AudioContext,
		durationSeconds: number,
	): void {
		const now = audioCtx.currentTime;
		// Cancel any scheduled ramps so we start from the current value
		gain.gain.cancelScheduledValues(now);
		gain.gain.setValueAtTime(gain.gain.value, now);
		gain.gain.linearRampToValueAtTime(0, now + durationSeconds);

		// Clean up source after fade completes
		setTimeout(
			() => {
				try {
					source.stop();
				} catch {
					// Already stopped
				}
				try {
					source.disconnect();
				} catch {
					// Already disconnected
				}
				try {
					gain.disconnect();
				} catch {
					// Already disconnected
				}
			},
			durationSeconds * 1000 + 100,
		);
	}

	function startSourceWithFadeIn(
		buffer: AudioBuffer,
		audioCtx: AudioContext,
		targetGain: number,
		loop: boolean,
	): { source: AudioBufferSourceNode; gain: GainNode } {
		const gain = audioCtx.createGain();
		gain.gain.setValueAtTime(0, audioCtx.currentTime);
		gain.gain.linearRampToValueAtTime(
			targetGain,
			audioCtx.currentTime + FADE_IN_SECONDS,
		);
		gain.connect(audioCtx.destination);

		const source = audioCtx.createBufferSource();
		source.buffer = buffer;
		source.loop = loop;
		source.connect(gain);
		source.start();

		return { source, gain };
	}

	return {
		startAmbient(track: AmbientTrack): void {
			if (track === "none") {
				this.stopAmbient();
				return;
			}

			// Already playing this track
			if (currentTrackName === track) return;

			const audioCtx = ensureContext();
			if (!audioCtx) return;

			// Cross-fade: fade out old track while new one loads
			if (ambientSource && ambientGain) {
				fadeOutAndStop(ambientSource, ambientGain, audioCtx, FADE_OUT_SECONDS);
				ambientSource = null;
				ambientGain = null;
			}

			currentTrackName = track;

			// Load and play (fire-and-forget — audio is non-blocking enhancement)
			getBuffer(track).then((buffer) => {
				// Guard: track may have changed while loading
				if (!buffer || currentTrackName !== track) return;
				const ac = ensureContext();
				if (!ac) return;

				const result = startSourceWithFadeIn(
					buffer,
					ac,
					AMBIENT_GAIN_RATIO * masterVolume,
					true,
				);
				ambientSource = result.source;
				ambientGain = result.gain;
			});
		},

		stopAmbient(): void {
			const audioCtx = ensureContext();
			if (!audioCtx || !ambientSource || !ambientGain) {
				currentTrackName = null;
				return;
			}

			fadeOutAndStop(ambientSource, ambientGain, audioCtx, FADE_OUT_SECONDS);
			ambientSource = null;
			ambientGain = null;
			currentTrackName = null;
		},

		playCompletionBell(): void {
			const audioCtx = ensureContext();
			if (!audioCtx) return;

			getBuffer("bell-complete").then((buffer) => {
				if (!buffer) return;
				const ac = ensureContext();
				if (!ac) return;

				const { source, gain } = startSourceWithFadeIn(
					buffer,
					ac,
					BELL_GAIN_RATIO * masterVolume,
					false,
				);

				// Clean up after playback finishes
				source.onended = () => {
					try {
						source.disconnect();
					} catch {
						// Already disconnected
					}
					try {
						gain.disconnect();
					} catch {
						// Already disconnected
					}
				};
			});
		},

		setVolume(gain: number): void {
			masterVolume = Math.max(0, Math.min(1, gain));

			// Update live ambient gain if playing
			if (ambientGain) {
				const audioCtx = ensureContext();
				if (!audioCtx) return;
				const now = audioCtx.currentTime;
				ambientGain.gain.cancelScheduledValues(now);
				ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
				ambientGain.gain.linearRampToValueAtTime(
					AMBIENT_GAIN_RATIO * masterVolume,
					now + 0.1,
				);
			}
		},

		dispose(): void {
			// Stop ambient without fade (immediate teardown)
			if (ambientSource) {
				try {
					ambientSource.stop();
				} catch {
					// Already stopped
				}
				try {
					ambientSource.disconnect();
				} catch {
					// Already disconnected
				}
			}
			if (ambientGain) {
				try {
					ambientGain.disconnect();
				} catch {
					// Already disconnected
				}
			}
			ambientSource = null;
			ambientGain = null;
			currentTrackName = null;

			bufferCache.clear();

			if (ctx && ctx.state !== "closed") {
				ctx.close().catch(() => {
					// Closing failed — nothing to recover
				});
			}
			ctx = null;
		},
	};
}

/** Factory getter — creates a new MeditationAudioService instance. */
export function createMeditationAudioService(): MeditationAudioService {
	if (!browser || typeof AudioContext === "undefined") {
		return NOOP_SERVICE;
	}
	return createLiveService();
}
