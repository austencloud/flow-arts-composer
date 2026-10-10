/**
 * Delight Orchestrator Implementation
 *
 * Coordinates celebration responses across haptic, visual, and audio channels.
 * Key principle: Celebration should feel earned, never patronizing.
 *
 * The intensity mapping ensures:
 * - Simple achievements get subtle feedback (not "OMG YOU DID IT!")
 * - Major milestones get appropriate fanfare
 * - User preferences are respected (reduced motion, sound muted)
 */

import { browser } from '$app/env';
import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import {
	type AchievementType,
	type DelightIntensity,
	type DelightResult,
	type DelightConfig,
	ACHIEVEMENT_INTENSITY_MAP,
	INTENSITY_DEFAULTS
} from '../domain/delight-types';

export class DelightOrchestrator {
	private enabled: boolean = true;
	private soundEnabled: boolean = true;
	private reducedMotion: boolean = false;

	// Registered component triggers
	private confettiTrigger: ((x: number, y: number, amount: number) => void) | null = null;
	private toastTrigger: ((message: string, duration: number) => void) | null = null;

	// Audio context for sound effects (lazy initialized)
	private audioContext: AudioContext | null = null;

	constructor(private hapticService: HapticFeedback | null) {
		this.initializeService();
	}


	public celebrate(
		achievement: AchievementType,
		overrides?: Partial<DelightConfig>
	): DelightResult {
		const intensity = ACHIEVEMENT_INTENSITY_MAP[achievement];
		return this.trigger(intensity, overrides);
	}

	public trigger(intensity: DelightIntensity, overrides?: Partial<DelightConfig>): DelightResult {
		const config = this.mergeConfig(intensity, overrides);
		const result = this.createResult(intensity);

		// Always try haptic - it's the most subtle and always appropriate
		if (config.haptic && this.hapticService) {
			result.channels.haptic = this.hapticService.trigger(config.hapticType);
		}

		// Visual channels respect reduced motion and enabled state
		if (this.enabled && !this.reducedMotion) {
			// Confetti
			if (config.confetti && this.confettiTrigger && config.confettiAmount > 0) {
				// Default to center-top burst
				this.confettiTrigger(0.5, 0.3, config.confettiAmount);
				result.channels.confetti = true;
			}

			// Toast
			if (config.toast && this.toastTrigger && config.toastMessage) {
				this.toastTrigger(config.toastMessage, config.toastDuration ?? 3000);
				result.channels.toast = true;
			}
		}

		// Sound respects its own toggle
		if (config.sound && this.soundEnabled && !this.reducedMotion) {
			this.playSound(config.soundType);
			result.channels.sound = true;
		}

		result.triggered =
			result.channels.haptic ||
			result.channels.confetti ||
			result.channels.sound ||
			result.channels.toast;

		return result;
	}

	public isEnabled(): boolean {
		return this.enabled;
	}

	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	public isSoundEnabled(): boolean {
		return this.soundEnabled;
	}

	public setSoundEnabled(enabled: boolean): void {
		this.soundEnabled = enabled;
	}

	public getConfettiTrigger(): (x: number, y: number, amount?: number) => void {
		return (x: number, y: number, amount: number = 30) => {
			if (this.confettiTrigger && this.enabled && !this.reducedMotion) {
				this.confettiTrigger(x, y, amount);
			}
		};
	}

	public registerConfettiTrigger(trigger: (x: number, y: number, amount: number) => void): void {
		this.confettiTrigger = trigger;
	}

	public registerToastTrigger(trigger: (message: string, duration: number) => void): void {
		this.toastTrigger = trigger;
	}


	private initializeService(): void {
		if (!browser) return;

		this.setupReducedMotionListener();
	}

	private setupReducedMotionListener(): void {
		if (!browser || !window.matchMedia) return;

		try {
			const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			this.reducedMotion = mediaQuery.matches;

			mediaQuery.addEventListener('change', (event) => {
				this.reducedMotion = event.matches;
			});
		} catch {
			// Fail silently - reduced motion check isn't critical
		}
	}


	private mergeConfig(intensity: DelightIntensity, overrides?: Partial<DelightConfig>): DelightConfig {
		const defaults = INTENSITY_DEFAULTS[intensity];
		if (!overrides) return { ...defaults };

		return {
			...defaults,
			...overrides
		};
	}

	private createResult(intensity: DelightIntensity): DelightResult {
		return {
			triggered: false,
			intensity,
			channels: {
				haptic: false,
				confetti: false,
				sound: false,
				toast: false
			},
			reducedMotion: this.reducedMotion
		};
	}


	private playSound(type: 'pop' | 'chime' | 'fanfare' | 'whoosh'): void {
		if (!browser) return;

		try {
			// Lazy initialize audio context
			if (!this.audioContext) {
				this.audioContext = new AudioContext();
			}

			// Resume if suspended (browser autoplay policy)
			if (this.audioContext.state === 'suspended') {
				this.audioContext.resume();
			}

			// Generate simple synthesized sounds
			// These are placeholder implementations - can be replaced with actual audio files
			switch (type) {
				case 'pop':
					this.playPop();
					break;
				case 'chime':
					this.playChime();
					break;
				case 'fanfare':
					this.playFanfare();
					break;
				case 'whoosh':
					this.playWhoosh();
					break;
			}
		} catch {
			// Audio failed - not critical, fail silently
		}
	}

	private playPop(): void {
		if (!this.audioContext) return;

		const osc = this.audioContext.createOscillator();
		const gain = this.audioContext.createGain();

		osc.connect(gain);
		gain.connect(this.audioContext.destination);

		osc.frequency.setValueAtTime(600, this.audioContext.currentTime);
		osc.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.1);

		gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

		osc.start(this.audioContext.currentTime);
		osc.stop(this.audioContext.currentTime + 0.1);
	}

	private playChime(): void {
		if (!this.audioContext) return;

		const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
		const now = this.audioContext.currentTime;

		frequencies.forEach((freq, i) => {
			const osc = this.audioContext!.createOscillator();
			const gain = this.audioContext!.createGain();

			osc.connect(gain);
			gain.connect(this.audioContext!.destination);

			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, now + i * 0.08);

			gain.gain.setValueAtTime(0, now + i * 0.08);
			gain.gain.linearRampToValueAtTime(0.2, now + i * 0.08 + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.3);

			osc.start(now + i * 0.08);
			osc.stop(now + i * 0.08 + 0.3);
		});
	}

	private playFanfare(): void {
		if (!this.audioContext) return;

		// Simple fanfare: ascending notes
		const frequencies = [392, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
		const now = this.audioContext.currentTime;

		frequencies.forEach((freq, i) => {
			const osc = this.audioContext!.createOscillator();
			const gain = this.audioContext!.createGain();

			osc.connect(gain);
			gain.connect(this.audioContext!.destination);

			osc.type = 'triangle';
			osc.frequency.setValueAtTime(freq, now + i * 0.12);

			gain.gain.setValueAtTime(0, now + i * 0.12);
			gain.gain.linearRampToValueAtTime(0.25, now + i * 0.12 + 0.03);
			gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.4);

			osc.start(now + i * 0.12);
			osc.stop(now + i * 0.12 + 0.4);
		});
	}

	private playWhoosh(): void {
		if (!this.audioContext) return;

		const osc = this.audioContext.createOscillator();
		const gain = this.audioContext.createGain();
		const filter = this.audioContext.createBiquadFilter();

		osc.connect(filter);
		filter.connect(gain);
		gain.connect(this.audioContext.destination);

		osc.type = 'sawtooth';
		filter.type = 'lowpass';

		const now = this.audioContext.currentTime;

		osc.frequency.setValueAtTime(100, now);
		osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);

		filter.frequency.setValueAtTime(200, now);
		filter.frequency.exponentialRampToValueAtTime(2000, now + 0.15);

		gain.gain.setValueAtTime(0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

		osc.start(now);
		osc.stop(now + 0.15);
	}
}
