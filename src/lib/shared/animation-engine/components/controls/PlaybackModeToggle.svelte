<!--
  PlaybackModeToggle.svelte

  Labeled toggle between Continuous and Step playback modes.
  Used in settings sheets and panels.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { PlaybackMode } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    playbackMode = "continuous",
    isPlaying = false,
    onPlaybackModeChange = () => {},
    onPlaybackToggle = () => {},
    showDescriptions = false,
    layout = "stacked",
  }: {
    playbackMode?: PlaybackMode;
    isPlaying?: boolean;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    onPlaybackToggle?: () => void;
    showDescriptions?: boolean;
    /** "stacked" fills a settings column, one option per row. "inline" is the
     *  transport-bar form: one row, sized to its labels, never stretched to the
     *  bar's width. */
    layout?: "stacked" | "inline";
  } = $props();

  let nextTickTimer: ReturnType<typeof setTimeout> | null = null;

  function handleModeChange(mode: PlaybackMode) {
    if (mode === playbackMode) return;

    const wasPlaying = isPlaying;
    if (wasPlaying) {
      onPlaybackToggle();
    }
    onPlaybackModeChange(mode);
    if (wasPlaying) {
      if (nextTickTimer !== null) clearTimeout(nextTickTimer);
      nextTickTimer = setTimeout(() => {
        onPlaybackToggle();
        nextTickTimer = null;
      }, 0);
    }
  }

  onDestroy(() => {
    if (nextTickTimer !== null) clearTimeout(nextTickTimer);
  });
</script>

<div
  class="mode-toggle"
  class:with-desc={showDescriptions && layout === "stacked"}
  class:inline={layout === "inline"}
>
  <button
    class="mode-btn"
    class:active={playbackMode === "continuous"}
    onclick={() => handleModeChange("continuous")}
    type="button"
    aria-pressed={playbackMode === "continuous"}
    aria-label={t("playback_audit_continuous_mode")}
  >
    <div class="mode-btn-content">
      <i class="fas fa-play" aria-hidden="true"></i>
      <span>{t("compose_continuous")}</span>
    </div>
    {#if showDescriptions}
      <span class="mode-desc">{t("playback_audit_loops_sequence")}</span>
    {/if}
  </button>
  <button
    class="mode-btn"
    class:active={playbackMode === "step"}
    onclick={() => handleModeChange("step")}
    type="button"
    aria-pressed={playbackMode === "step"}
    aria-label={t("playback_audit_step_mode")}
  >
    <div class="mode-btn-content">
      <i class="fas fa-shoe-prints" aria-hidden="true"></i>
      <span>{t("compose_step_by_step")}</span>
    </div>
    {#if showDescriptions}
      <span class="mode-desc">{t("playback_audit_one_step")}</span>
    {/if}
  </button>
</div>

<style>
  .mode-toggle {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .mode-toggle.with-desc {
    gap: 6px;
  }

  /* Transport-bar form. `width: auto` is the load-bearing half: the stacked
     form is `width: 100%`, and inside a flex bar that resolves flex-basis to
     the full bar and stretches two short labels across it. */
  .mode-toggle.inline {
    flex-direction: row;
    width: auto;
    flex: 0 0 auto;
    gap: 2px;
    padding: 2px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
  }

  .mode-toggle.inline .mode-btn {
    min-height: 30px;
    padding: 4px 12px;
    border: 0;
    background: transparent;
    border-radius: 999px;
    box-shadow: none;
  }

  .mode-toggle.inline .mode-btn.active {
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
    box-shadow: none;
  }

  .mode-btn-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mode-desc {
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1;
  }

  .mode-btn.active .mode-desc {
    color: rgba(255, 255, 255, 0.7);
  }

  .mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 6px 10px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .with-desc .mode-btn {
    flex-direction: column;
    gap: 4px;
    min-height: 52px;
    padding: 10px 12px;
  }

  .mode-btn i {
    font-size: var(--font-size-compact);
    flex-shrink: 0;
  }

  .mode-btn span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mode-btn.active {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
    box-shadow:
      0 0 12px color-mix(in srgb, var(--theme-accent) 12%, transparent),
      inset 0 1px 0 var(--theme-stroke);
  }

  .mode-btn.active i {
    color: var(--theme-accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .mode-btn:hover:not(.active) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
    }
  }

  .mode-btn:active {
    transform: scale(0.98);
  }

  .mode-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .mode-btn {
      transition: none;
    }
  }
</style>
