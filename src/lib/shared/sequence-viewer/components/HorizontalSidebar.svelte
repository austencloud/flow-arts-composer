<!--
  HorizontalSidebar.svelte

  Settings sidebar for horizontal layout mode.
  Adapts between compact (tabbed) and expanded modes based on available height.
-->
<script lang="ts">
	import TempoControl from "#lib/shared/animation-panel/components/TempoControl.svelte";
	import SettingsTogglePanel from "#lib/shared/animation-engine/components/controls/SettingsTogglePanel.svelte";
	import PlaybackPane from "#lib/shared/animation-engine/components/controls/settings-panel/PlaybackPane.svelte";
	import VisualPane from "#lib/shared/animation-engine/components/controls/settings-panel/VisualPane.svelte";
	import type { ControlsLevel } from "../domain/types";

	let {
		controlsLevel,
		useContext,
		isPlaying,
		bpm = $bindable(),
		playbackMode,
		stepSize,
		onBpmChange,
		onPlaybackModeChange,
		onStepSizeChange,
		onPlaybackToggle,
	}: {
		controlsLevel: ControlsLevel;
		useContext: boolean;
		isPlaying: boolean;
		bpm: number;
		playbackMode: "continuous" | "step";
		stepSize: 0.5 | 1;
		onBpmChange: (bpm: number) => void;
		onPlaybackModeChange: (mode: "continuous" | "step") => void;
		onStepSizeChange: (size: 0.5 | 1) => void;
		onPlaybackToggle: () => void;
	} = $props();

	// Sidebar space detection - switch to compact mode if not enough room
	let sidebarRef: HTMLDivElement | null = $state(null);
	let sidebarHeight = $state(0);
	const COMPACT_THRESHOLD = 420; // px - below this, use tabbed compact mode
	const useCompactSidebar = $derived(
		sidebarHeight > 0 && sidebarHeight < COMPACT_THRESHOLD
	);

	// ResizeObserver for sidebar height
	$effect(() => {
		if (!sidebarRef) return;
		const observer = new ResizeObserver((entries) => {
			sidebarHeight = entries[0]?.contentRect.height ?? 0;
		});
		observer.observe(sidebarRef);
		return () => observer.disconnect();
	});
</script>

<div class="horizontal-sidebar" bind:this={sidebarRef}>
	{#if useContext && controlsLevel === "full"}
		<!-- External control mode: full playback + visual controls -->
		{#if useCompactSidebar}
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
		{:else}
			<div class="sidebar-section">
				<PlaybackPane
					bind:bpm
					{playbackMode}
					stepPlaybackStepSize={stepSize}
					{isPlaying}
					{onBpmChange}
					onPlaybackModeChange={onPlaybackModeChange}
					onStepPlaybackStepSizeChange={onStepSizeChange}
					{onPlaybackToggle}
				/>
			</div>
			<div class="sidebar-section">
				<VisualPane propType={null} leftPropType={null} rightPropType={null} />
			</div>
		{/if}
	{:else}
		<!-- Standalone mode: simplified BPM + visual controls -->
		<div class="sidebar-section standalone-controls">
			<TempoControl {bpm} {onBpmChange} showPractice={false} />
		</div>
		<div class="sidebar-section">
			<VisualPane propType={null} leftPropType={null} rightPropType={null} />
		</div>
	{/if}
</div>

<style>
	/* Horizontal sidebar - adapts between expanded and compact modes */
	.horizontal-sidebar {
		display: flex;
		flex-direction: column;
		justify-content: space-evenly;
		gap: clamp(12px, 3cqh, 24px);
		width: clamp(240px, 32%, 300px);
		min-width: 240px;
		height: 100%;
		flex-shrink: 0;
		padding: clamp(14px, 3cqh, 24px);
		box-sizing: border-box;
		background: var(--theme-card-bg);
		border: 1.5px solid var(--theme-stroke);
		border-radius: 14px;
		overflow: hidden;
		container-type: size;
		container-name: sidebar;
	}

	/* Compact mode: SettingsTogglePanel fills the sidebar */
	.horizontal-sidebar :global(.settings-panel) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	/* Compact mode: Make panes use vertical layout */
	.horizontal-sidebar :global(.settings-panel .visual-pane),
	.horizontal-sidebar :global(.settings-panel .playback-pane) {
		gap: 12px;
	}

	/* Compact mode: Element grid - 2x2 layout instead of 4 across */
	.horizontal-sidebar :global(.settings-panel .element-grid) {
		display: grid !important;
		grid-template-columns: repeat(2, 1fr) !important;
		gap: 8px;
	}

	/* Compact mode: Motion toggles */
	.horizontal-sidebar :global(.settings-panel .motion-toggles) {
		flex-wrap: wrap;
		gap: 8px;
	}

	/* Compact mode: Trail presets */
	.horizontal-sidebar :global(.settings-panel .trail-presets) {
		flex-wrap: wrap;
		gap: 8px;
	}

	/* Compact mode: Style toggle (Flow/Step) */
	.horizontal-sidebar :global(.settings-panel .style-toggle) {
		flex-wrap: wrap;
		gap: 8px;
	}

	/* Compact mode: BPM presets - 2 columns for narrow sidebar */
	.horizontal-sidebar :global(.settings-panel .preset-chips) {
		display: grid !important;
		grid-template-columns: repeat(2, 1fr) !important;
		gap: 8px;
	}

	/* Compact mode: Ensure all buttons meet touch targets */
	.horizontal-sidebar :global(.settings-panel .element-btn),
	.horizontal-sidebar :global(.settings-panel .motion-btn),
	.horizontal-sidebar :global(.settings-panel .trail-btn),
	.horizontal-sidebar :global(.settings-panel .style-btn),
	.horizontal-sidebar :global(.settings-panel .preset-chip) {
		min-height: var(--min-touch-target);
		flex: 1 1 auto;
	}

	/* Sidebar sections - natural height, don't force stretch */
	.sidebar-section {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.sidebar-section + .sidebar-section {
		padding-top: clamp(14px, 3cqh, 24px);
		border-top: 1px solid var(--theme-stroke);
	}

	/* Standalone mode: TempoControl in sidebar */
	.standalone-controls {
		gap: 12px;
	}

	.standalone-controls :global(.tempo-control) {
		flex-wrap: wrap;
		justify-content: center;
	}

	/* Child panes - space between sections, not stretched buttons */
	.horizontal-sidebar :global(.playback-pane),
	.horizontal-sidebar :global(.visual-pane) {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		flex: 1;
		gap: clamp(12px, 3cqh, 24px);
	}

	/* EXPANDED MODE ONLY: Button groups (scoped via .sidebar-section) */
	.horizontal-sidebar .sidebar-section :global(.style-toggle),
	.horizontal-sidebar .sidebar-section :global(.motion-toggles),
	.horizontal-sidebar .sidebar-section :global(.trail-presets),
	.horizontal-sidebar .sidebar-section :global(.ends-selector) {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	/* Element grid: 2x2 layout for visibility toggles */
	.horizontal-sidebar .sidebar-section :global(.element-grid) {
		display: grid !important;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
		flex-shrink: 0;
	}

	/* EXPANDED MODE ONLY: Button sizing */
	.horizontal-sidebar .sidebar-section :global(.style-btn),
	.horizontal-sidebar .sidebar-section :global(.motion-btn),
	.horizontal-sidebar .sidebar-section :global(.element-btn),
	.horizontal-sidebar .sidebar-section :global(.trail-btn),
	.horizontal-sidebar .sidebar-section :global(.ends-btn) {
		flex: 1;
		min-height: var(--min-touch-target);
		max-height: 56px;
		height: var(--min-touch-target);
	}

	/* BPM control container */
	.horizontal-sidebar :global(.bpm-control) {
		display: flex;
		flex-direction: column;
		flex: 1;
		gap: clamp(8px, 2cqh, 14px);
	}

	/* BPM adjuster - stays horizontal with touch target minimum */
	.horizontal-sidebar :global(.bpm-adjuster) {
		gap: 10px;
		min-height: var(--min-touch-target);
	}

	.horizontal-sidebar :global(.bpm-display) {
		min-height: var(--min-touch-target);
		min-width: 80px;
		padding: 0 14px;
		font-size: clamp(1rem, 3cqh, 1.25rem);
	}

	.horizontal-sidebar :global(.bpm-btn) {
		width: var(--min-touch-target);
		height: var(--min-touch-target);
		min-width: var(--min-touch-target);
		min-height: var(--min-touch-target);
	}

	/* BPM presets - 3-column grid */
	.horizontal-sidebar :global(.preset-chips) {
		display: grid !important;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}

	.horizontal-sidebar :global(.preset-chip) {
		min-height: var(--min-touch-target);
		max-height: 52px;
		height: var(--min-touch-target);
		padding: 8px 10px;
		font-size: 0.85rem;
	}

	/* Step size row in playback pane */
	.horizontal-sidebar :global(.step-size-row) {
		min-height: var(--min-touch-target);
		max-height: 56px;
		flex-shrink: 0;
	}

	.horizontal-sidebar :global(.step-chip) {
		min-height: var(--min-touch-target);
		height: var(--min-touch-target);
	}

	/* Container queries - adjust gaps, not button sizes */
	@container sidebar (max-height: 450px) {
		.horizontal-sidebar :global(.playback-pane),
		.horizontal-sidebar :global(.visual-pane) {
			gap: 10px;
		}
	}

	@container sidebar (min-height: 550px) {
		.horizontal-sidebar :global(.playback-pane),
		.horizontal-sidebar :global(.visual-pane) {
			gap: 20px;
		}
	}
</style>
