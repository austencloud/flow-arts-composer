<!--
  VerticalModeControls.svelte

  Control bar for vertical layout mode with three variants:
  - minimal: Play button + BPM chips + settings gear
  - standard: TransportControls + settings gear
  - full: TransportControls + SettingsTogglePanel
-->
<script lang="ts">
	import { t } from "#lib/shared/i18n/i18n.svelte.js";
	import TempoControl from "#lib/shared/animation-panel/components/TempoControl.svelte";
	import TransportControls from "#lib/shared/animation-engine/components/controls/TransportControls.svelte";
	import SettingsTogglePanel from "#lib/shared/animation-engine/components/controls/SettingsTogglePanel.svelte";
	import { sequencePanelManager } from "#lib/shared/browse/state/sequence-panel-state.svelte.js";
	import type { ControlsLevel } from "../domain/types";

	let {
		controlsLevel,
		useContext,
		isPlaying,
		bpm,
		playbackMode,
		stepSize,
		onPlaybackToggle,
		onBpmChange,
		onPlaybackModeChange,
		onStepSizeChange,
		onStepHalfBack,
		onStepHalfFwd,
		onRestartToStart,
		onStepFullFwd,
	}: {
		controlsLevel: ControlsLevel;
		useContext: boolean;
		isPlaying: boolean;
		bpm: number;
		playbackMode: "continuous" | "step";
		stepSize: 0.5 | 1;
		onPlaybackToggle: () => void;
		onBpmChange: (bpm: number) => void;
		onPlaybackModeChange: (mode: "continuous" | "step") => void;
		onStepSizeChange: (size: 0.5 | 1) => void;
		onStepHalfBack: () => void;
		onStepHalfFwd: () => void;
		onRestartToStart: () => void;
		onStepFullFwd: () => void;
	} = $props();
</script>

{#if controlsLevel === "full" && useContext}
	<!-- Full tabbed layout -->
	<div class="controls-full">
		<TransportControls
			{isPlaying}
			{onPlaybackToggle}
			onStepHalfBeatBackward={onStepHalfBack}
			onStepHalfBeatForward={onStepHalfFwd}
			onRestartToStart={onRestartToStart}
			onStepFullBeatForward={onStepFullFwd}
		/>
		<SettingsTogglePanel
			propType={null}
			leftPropType={null}
			rightPropType={null}
			{bpm}
			{playbackMode}
			stepPlaybackStepSize={stepSize}
			{isPlaying}
			{onBpmChange}
			onPlaybackModeChange={onPlaybackModeChange}
			onStepPlaybackStepSizeChange={onStepSizeChange}
			{onPlaybackToggle}
		/>
	</div>
{:else if controlsLevel === "standard"}
	<!-- Standard controls with step buttons + settings gear -->
	<div class="controls-standard">
		<div class="controls-spacer"></div>
		<TransportControls
			{isPlaying}
			{onPlaybackToggle}
			onStepHalfBeatBackward={onStepHalfBack}
			onStepHalfBeatForward={onStepHalfFwd}
			onRestartToStart={onRestartToStart}
			onStepFullBeatForward={onStepFullFwd}
		/>
		<button
			class="settings-gear-btn"
			class:active={sequencePanelManager.isDetailExpanded}
			onclick={() => sequencePanelManager.toggleDetailExpanded()}
			aria-label={sequencePanelManager.isDetailExpanded
				? t("viewer_ui_collapse_settings")
				: t("viewer_ui_expand_settings")}
			type="button"
		>
			<i class="fas fa-sliders" aria-hidden="true"></i>
		</button>
	</div>
{:else}
	<!-- Minimal controls (play button + BPM + settings gear) -->
	<div class="controls-simple">
		<button
			class="play-btn"
			onclick={onPlaybackToggle}
			aria-label={isPlaying ? t("viewer_ui_pause") : t("viewer_ui_play")}
		>
			{#if isPlaying}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M6 4h4v16H6zm8 0h4v16h-4z" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M8 5v14l11-7z" />
				</svg>
			{/if}
		</button>
		<TempoControl {bpm} {onBpmChange} showPresets={true} showPractice={false} />
		<button
			class="settings-gear-btn"
			class:active={sequencePanelManager.isDetailExpanded}
			onclick={() => sequencePanelManager.toggleDetailExpanded()}
			aria-label={sequencePanelManager.isDetailExpanded
				? t("viewer_ui_collapse_settings")
				: t("viewer_ui_expand_settings")}
			type="button"
		>
			<i class="fas fa-sliders" aria-hidden="true"></i>
		</button>
	</div>
{/if}

<style>
	.controls-simple {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 10px 12px;
		background: var(--theme-card-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--theme-stroke);
		border-radius: 12px;
		flex-shrink: 0;
	}

	.controls-standard {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px;
		background: var(--theme-card-bg, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--theme-stroke);
		border-radius: 14px;
		flex-shrink: 0;
	}

	/* Invisible spacer to balance the gear button - keeps transport centered */
	.controls-spacer {
		width: var(--min-touch-target);
		height: var(--min-touch-target);
		flex-shrink: 0;
		visibility: hidden;
	}

	.controls-full {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px;
		background: var(--theme-card-bg);
		border: 1.5px solid var(--theme-stroke);
		border-radius: 14px;
		flex-shrink: 0;
		max-height: 200px;
		overflow-y: auto;
	}

	.play-btn {
		width: var(--min-touch-target);
		height: var(--min-touch-target);
		min-width: var(--min-touch-target);
		min-height: var(--min-touch-target);
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(
			135deg,
			var(--theme-accent, #3b82f6) 0%,
			color-mix(in srgb, var(--theme-accent, #3b82f6) 80%, black) 100%
		);
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
		-webkit-tap-highlight-color: transparent;
	}

	.play-btn svg {
		width: 22px;
		height: 22px;
	}

	.play-btn:hover {
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
	}

	.play-btn:active {
		transform: scale(0.9);
		transition-duration: 0ms;
	}

	.settings-gear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--min-touch-target);
		height: var(--min-touch-target);
		min-width: var(--min-touch-target);
		min-height: var(--min-touch-target);
		background: var(--theme-card-bg);
		border: 1.5px solid var(--theme-stroke);
		border-radius: 50%;
		color: var(--theme-text-dim);
		cursor: pointer;
		transition: all var(--duration-normal) ease;
		flex-shrink: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.settings-gear-btn i {
		font-size: 18px;
	}

	.settings-gear-btn:hover {
		background: var(--theme-card-hover-bg);
		border-color: var(--theme-stroke-strong);
		color: var(--theme-text);
		transform: scale(1.05);
	}

	.settings-gear-btn:active {
		transform: scale(0.9);
		transition-duration: 0ms;
	}

	.settings-gear-btn.active {
		background: var(--theme-accent, #3b82f6);
		border-color: var(--theme-accent, #3b82f6);
		color: white;
	}

	.settings-gear-btn.active:hover {
		background: color-mix(in srgb, var(--theme-accent, #3b82f6) 85%, black);
		border-color: color-mix(in srgb, var(--theme-accent, #3b82f6) 85%, black);
	}

	/* Widescreen optimizations */
	@media (min-width: 1200px) {
		.controls-simple {
			padding: 8px 10px;
			gap: 10px;
		}

		.play-btn {
			width: var(--min-touch-target);
			height: var(--min-touch-target);
			min-width: var(--min-touch-target);
			min-height: var(--min-touch-target);
		}

		.play-btn svg {
			width: 22px;
			height: 22px;
		}

		.controls-full {
			gap: 8px;
			padding: 10px;
			max-height: 180px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.play-btn,
		.settings-gear-btn {
			transition: none;
		}
	}
</style>
