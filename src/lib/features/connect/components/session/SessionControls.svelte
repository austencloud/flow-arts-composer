<!--
  SessionControls.svelte

  Playback controls for synced session.
  Standard transport: first, prev, play/pause, next, last + scrubber.
-->
<script lang="ts">
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	interface Props {
		isPlaying: boolean;
		currentStep: number;
		maxBeat: number;
		disabled?: boolean;
		onPlay: () => void;
		onPause: () => void;
		onPrevious: () => void;
		onNext: () => void;
		onFirst: () => void;
		onLast: () => void;
		onSeek: (beat: number) => void;
	}

	let {
		isPlaying,
		currentStep,
		maxBeat,
		disabled = false,
		onPlay,
		onPause,
		onPrevious,
		onNext,
		onFirst,
		onLast,
		onSeek
	}: Props = $props();

	function handlePlayPause() {
		if (isPlaying) {
			onPause();
		} else {
			onPlay();
		}
	}

	function handleSliderChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 10);
		onSeek(value);
	}

	// Progress percentage for styling
	const progressPercent = $derived(maxBeat > 0 ? (currentStep / maxBeat) * 100 : 0);
</script>

<div class="session-controls" class:disabled>
	<!-- Transport buttons -->
	<div class="transport-buttons">
		<button
			class="transport-btn"
			onclick={onFirst}
			disabled={disabled || currentStep === 0}
			aria-label={t('connect_first_beat')}
			title={t('connect_first_beat')}
		>
			<i class="fas fa-step-backward" aria-hidden="true"></i>
		</button>

		<button
			class="transport-btn"
			onclick={onPrevious}
			disabled={disabled || currentStep === 0}
			aria-label={t('connect_previous_beat')}
			title={t('connect_previous_beat')}
		>
			<i class="fas fa-backward" aria-hidden="true"></i>
		</button>

		<button
			class="transport-btn play-btn"
			onclick={handlePlayPause}
			{disabled}
			aria-label={isPlaying ? t('connect_pause') : t('connect_play')}
			title={isPlaying ? t('connect_pause') : t('connect_play')}
		>
			{#if isPlaying}
				<i class="fas fa-pause" aria-hidden="true"></i>
			{:else}
				<i class="fas fa-play" aria-hidden="true"></i>
			{/if}
		</button>

		<button
			class="transport-btn"
			onclick={onNext}
			disabled={disabled || currentStep >= maxBeat}
			aria-label={t('connect_next_beat')}
			title={t('connect_next_beat')}
		>
			<i class="fas fa-forward" aria-hidden="true"></i>
		</button>

		<button
			class="transport-btn"
			onclick={onLast}
			disabled={disabled || currentStep >= maxBeat}
			aria-label={t('connect_last_beat')}
			title={t('connect_last_beat')}
		>
			<i class="fas fa-step-forward" aria-hidden="true"></i>
		</button>
	</div>

	<!-- Progress slider -->
	<div class="progress-container">
		<span class="step-label">{currentStep}</span>

		<div class="slider-wrapper">
			<input
				type="range"
				class="progress-slider"
				min="0"
				max={maxBeat}
				value={currentStep}
				{disabled}
				oninput={handleSliderChange}
				aria-label={t('connect_seek_position')}
				aria-valuemin={0}
				aria-valuemax={maxBeat}
				aria-valuenow={currentStep}
				aria-valuetext={t('connect_beat_of', { current: currentStep, total: maxBeat })}
				style="--progress: {progressPercent}%"
			/>
		</div>

		<span class="step-label">{maxBeat}</span>
	</div>
</div>

<style>
	.session-controls {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		flex: 1;
	}

	.session-controls.disabled {
		opacity: 0.5;
	}

	/* Transport buttons */
	.transport-buttons {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.transport-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--min-touch-target);
		height: var(--min-touch-target);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 50%;
		color: var(--theme-text, white);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.transport-btn:hover:not(:disabled) {
		background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
	}

	.transport-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.transport-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.transport-btn i {
		font-size: 14px;
	}

	/* Play button - larger and accent colored */
	.play-btn {
		width: 60px;
		height: 60px;
		background: var(--theme-accent, #6366f1);
		border-color: var(--theme-accent, #6366f1);
	}

	.play-btn:hover:not(:disabled) {
		background: var(--theme-accent-hover, #4f46e5);
		border-color: var(--theme-accent-hover, #4f46e5);
	}

	.play-btn i {
		font-size: 18px;
	}

	/* Progress slider */
	.progress-container {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		max-width: 400px;
	}

	.step-label {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		min-width: 24px;
		text-align: center;
	}

	.slider-wrapper {
		flex: 1;
		position: relative;
	}

	.progress-slider {
		width: 100%;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}

	.progress-slider:disabled {
		cursor: not-allowed;
	}

	/* Track styling */
	.progress-slider::-webkit-slider-runnable-track {
		height: 6px;
		background: linear-gradient(
			to right,
			var(--theme-accent, #6366f1) 0%,
			var(--theme-accent, #6366f1) var(--progress, 0%),
			var(--theme-stroke, rgba(255, 255, 255, 0.1)) var(--progress, 0%),
			var(--theme-stroke, rgba(255, 255, 255, 0.1)) 100%
		);
		border-radius: 3px;
	}

	.progress-slider::-moz-range-track {
		height: 6px;
		background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 3px;
	}

	.progress-slider::-moz-range-progress {
		background: var(--theme-accent, #6366f1);
		border-radius: 3px;
	}

	/* Thumb styling */
	.progress-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		background: var(--theme-accent, #6366f1);
		border: 2px solid var(--theme-text, white);
		border-radius: 50%;
		cursor: pointer;
		margin-top: -5px;
		box-shadow: 0 2px 4px var(--theme-shadow-color, rgba(0, 0, 0, 0.2));
		transition: transform 0.15s ease;
	}

	.progress-slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		background: var(--theme-accent, #6366f1);
		border: 2px solid var(--theme-text, white);
		border-radius: 50%;
		cursor: pointer;
		box-shadow: 0 2px 4px var(--theme-shadow-color, rgba(0, 0, 0, 0.2));
	}

	.progress-slider:hover::-webkit-slider-thumb {
		transform: scale(1.1);
	}

	.progress-slider:disabled::-webkit-slider-thumb,
	.progress-slider:disabled::-moz-range-thumb {
		cursor: not-allowed;
	}

	/* Mobile - maintain 48px minimum for AAA compliance */
	@media (max-width: 600px) {
		.transport-btn {
			width: var(--min-touch-target);
			height: var(--min-touch-target);
		}

		.play-btn {
			width: 56px;
			height: 56px;
		}

		.progress-container {
			max-width: 100%;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.transport-btn,
		.progress-slider::-webkit-slider-thumb {
			transition: none;
		}
	}
</style>
