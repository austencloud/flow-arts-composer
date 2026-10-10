<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * TimelineControls - Transport and zoom controls
   *
   * Play/pause, stop, shuttle controls (J/K/L style)
   * Zoom in/out, fit to view
   * Time display
   * Snap settings
   * Add media button
   */

  import { getTimelineState } from "$lib/shared/animation-engine/state/timeline-state.svelte";
  import { getTimelinePlayer } from "../services/timeline-playback-service";
  import SnapControls from "./SnapControls.svelte";
  import TimeSignatureChip from "./TimeSignatureChip.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

  interface Props {
    onOpenMediaBrowser?: () => void;
  }

  let { onOpenMediaBrowser }: Props = $props();

  // Lazy access to state and playback service to avoid initialization timing issues
  function getState() {
    return getTimelineState();
  }

  function getPlayback() {
    return getTimelinePlayer();
  }

  // Local reactive state for display values (updated via effects)
  let currentTimeDisplay = $state("00:00.00");
  let totalTimeDisplay = $state("00:00.00");
  let shuttleDisplay = $state<string | null>(null);
  let zoomPercent = $state(100);

  // Playhead state for template bindings
  let isPlaying = $state(false);
  let playheadDirection = $state<1 | -1>(1);
  let shuttleSpeed = $state(1);

  // Undo/redo state for template bindings
  let canUndo = $state(false);
  let canRedo = $state(false);
  let undoDescription = $state<string | null>(null);
  let redoDescription = $state<string | null>(null);

  // Dark Mode state
  let darkModeEnabled = $state(false);
  const visibilityManager = getAnimationVisibilityManager();

  // Format current time as MM:SS.ms
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
  }

  // Sync local state from timeline state using effects
  $effect(() => {
    const state = getState();
    currentTimeDisplay = formatTime(state.playhead.position);
  });

  $effect(() => {
    const state = getState();
    totalTimeDisplay = formatTime(state.totalDuration);
  });

  $effect(() => {
    const state = getState();
    isPlaying = state.playhead.isPlaying;
    playheadDirection = state.playhead.direction;
    shuttleSpeed = state.playhead.shuttleSpeed;

    if (!state.playhead.isPlaying) {
      shuttleDisplay = null;
    } else {
      const dir = state.playhead.direction === -1 ? "◀" : "▶";
      const speed = state.playhead.shuttleSpeed;
      shuttleDisplay = speed === 1 ? dir : `${dir}${speed}x`;
    }
  });

  $effect(() => {
    const state = getState();
    zoomPercent = Math.round((state.viewport.pixelsPerSecond / 50) * 100);
  });

  // Sync undo/redo state
  $effect(() => {
    const state = getState();
    canUndo = state.canUndo;
    canRedo = state.canRedo;
    undoDescription = state.undoDescription;
    redoDescription = state.redoDescription;
  });

  // Sync Dark Mode from visibility manager
  $effect(() => {
    darkModeEnabled = visibilityManager.isDarkMode();
    // Re-check on changes
    const handler = () => {
      darkModeEnabled = visibilityManager.isDarkMode();
    };
    visibilityManager.registerObserver(handler);
    return () => visibilityManager.unregisterObserver(handler);
  });

  /**
   * Toggle Dark Mode
   * When enabled: dark background
   */
  function toggleDarkMode() {
    const newState = !darkModeEnabled;
    visibilityManager.setDarkMode(newState);
    darkModeEnabled = newState;
  }
</script>

<div class="timeline-controls" data-edit-history-shortcut-scope>
  <!-- Time Display -->
  <div class="time-display">
    <span class="current-time">{currentTimeDisplay}</span>
    <span class="time-separator">/</span>
    <span class="total-time">{totalTimeDisplay}</span>
    {#if shuttleDisplay}
      <span class="shuttle-indicator">{shuttleDisplay}</span>
    {/if}
  </div>

  <!-- Time Signature -->
  <TimeSignatureChip />

  <!-- Undo/Redo Controls -->
  <div class="undo-redo-section">
    <button
      data-undo-shortcut
      data-undo-shortcut-label={undoDescription || undefined}
      class="control-btn"
      onclick={() => getState().undo()}
      disabled={!canUndo}
      title={undoDescription
        ? `Undo: ${undoDescription} (Ctrl+Z)`
        : "Nothing to undo"}
      aria-label={undoDescription
        ? `Undo: ${undoDescription}`
        : "Nothing to undo"}
    >
      <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
    </button>

    <button
      data-redo-shortcut
      data-redo-shortcut-label={redoDescription || undefined}
      class="control-btn"
      onclick={() => getState().redo()}
      disabled={!canRedo}
      title={redoDescription
        ? `Redo: ${redoDescription} (Ctrl+Shift+Z)`
        : "Nothing to redo"}
      aria-label={redoDescription
        ? `Redo: ${redoDescription}`
        : "Nothing to redo"}
    >
      <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Add Media Button -->
  {#if onOpenMediaBrowser}
    <button
      class="add-media-btn"
      onclick={onOpenMediaBrowser}
      title="Add media to timeline"
      aria-label="Add media"
    >
      <i class="fa-solid fa-plus" aria-hidden="true"></i>
      <span>Add Media</span>
    </button>
  {/if}

  <!-- Spacer -->
  <div class="spacer"></div>

  <!-- Snap Controls -->
  <SnapControls />

  <!-- Zoom Section -->
  <div class="zoom-section">
    <button
      class="control-btn"
      onclick={() => getState().zoomOut()}
      title="Zoom out (-)"
      aria-label="Zoom out"
    >
      <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i>
    </button>

    <span class="zoom-display" title="Zoom level">
      {zoomPercent}%
    </span>

    <button
      class="control-btn"
      onclick={() => getState().zoomIn()}
      title="Zoom in (+)"
      aria-label="Zoom in"
    >
      <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
    </button>

    <button
      class="control-btn"
      onclick={() => getState().zoomToFit()}
      title={t("compose_ui_fit_to_view")}
      aria-label={t("compose_ui_fit_to_view")}
    >
      <i class="fa-solid fa-expand" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Dark Mode Toggle -->
  <button
    class="control-btn dark-mode-btn"
    class:active={darkModeEnabled}
    onclick={toggleDarkMode}
    title={darkModeEnabled ? "Disable Dark Mode" : "Enable Dark Mode"}
    aria-label={darkModeEnabled ? "Disable Dark Mode" : "Enable Dark Mode"}
    aria-pressed={darkModeEnabled}
  >
    <i class="fa-solid fa-lightbulb" aria-hidden="true"></i>
  </button>

  <!-- Project Settings -->
  <button
    class="control-btn"
    onclick={() => getState().openProjectSettings()}
    title={t("compose_ui_timeline_settings")}
    aria-label={t("compose_ui_timeline_settings")}
  >
    <i class="fa-solid fa-gear" aria-hidden="true"></i>
  </button>
</div>

<style>
  .timeline-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zoom-section,
  .undo-redo-section {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .control-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border-radius: 6px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    transition: all var(--duration-normal) ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .control-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    box-shadow:
      0 4px 8px rgba(0, 0, 0, 0.15),
      0 0 8px color-mix(in srgb, var(--theme-accent) 15%, transparent);
    transform: translateY(-1px);
  }

  .control-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .control-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .control-btn:disabled:hover {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke);
    transform: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .time-display {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: "SF Mono", "Monaco", "Consolas", monospace;
    font-size: var(--font-size-compact);
    padding: 6px 14px;
    background: var(--theme-panel-elevated-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .current-time {
    color: var(--theme-text, var(--theme-text));
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    min-width: 70px;
  }

  .time-separator {
    color: var(--theme-text-dim);
  }

  .total-time {
    color: var(--theme-text-dim, var(--theme-text-dim));
    min-width: 70px;
  }

  .shuttle-indicator {
    margin-left: 8px;
    padding: 3px 8px;
    background: var(--theme-accent);
    color: white;
    border-radius: 6px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }

  .spacer {
    flex: 1;
  }

  .zoom-display {
    min-width: 45px;
    text-align: center;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text-dim);
    padding: 4px 8px;
    background: var(--theme-panel-elevated-bg);
    border-radius: 4px;
    border: 1px solid var(--theme-stroke);
  }

  .add-media-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
    cursor: pointer;
    font-size: var(--font-size-compact);
    font-weight: 600;
    transition: all var(--duration-normal) ease;
    margin-left: 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  }

  .add-media-btn:hover {
    background: var(--theme-accent);
    border-color: var(--theme-accent-strong);
    color: white;
    box-shadow: none;
    transform: translateY(-1px);
  }

  .add-media-btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }

  .add-media-btn i {
    font-size: var(--font-size-compact);
  }

  /* Dark Mode button - electric neon glow when active */
  .dark-mode-btn.active {
    --neon-color: var(--theme-neon, #00ffff);
    background: color-mix(in srgb, var(--neon-color) 15%, transparent);
    border-color: var(--neon-color);
    color: var(--neon-color);
    box-shadow:
      0 0 12px color-mix(in srgb, var(--neon-color) 40%, transparent),
      0 0 20px color-mix(in srgb, var(--neon-color) 20%, transparent),
      inset 0 0 8px color-mix(in srgb, var(--neon-color) 10%, transparent);
    text-shadow: 0 0 8px color-mix(in srgb, var(--neon-color) 80%, transparent);
  }

  .dark-mode-btn.active:hover {
    background: color-mix(in srgb, var(--neon-color) 25%, transparent);
    box-shadow:
      0 0 16px color-mix(in srgb, var(--neon-color) 50%, transparent),
      0 0 28px color-mix(in srgb, var(--neon-color) 30%, transparent),
      inset 0 0 10px color-mix(in srgb, var(--neon-color) 15%, transparent);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .shuttle-indicator {
      animation: none;
    }
  }
</style>
