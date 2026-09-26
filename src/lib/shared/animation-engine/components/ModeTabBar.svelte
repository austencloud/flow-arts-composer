<!--
  ModeTabBar.svelte

  Animated pill tab switcher for Playback/Visual modes.
  The pill slides smoothly between options.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  export type SettingsMode = "playback" | "visual";

  let {
    activeMode = "playback",
    onModeChange = () => {},
  }: {
    activeMode?: SettingsMode;
    onModeChange?: (mode: SettingsMode) => void;
  } = $props();

  function selectMode(mode: SettingsMode) {
    if (mode !== activeMode) {
      onModeChange(mode);
    }
  }
</script>

<div class="mode-switcher">
  <div class="switcher-track">
    <div class="switcher-pill" class:visual={activeMode === "visual"}></div>
    <button
      class="switcher-btn"
      class:active={activeMode === "playback"}
      onclick={() => selectMode("playback")}
      type="button"
      aria-pressed={activeMode === "playback"}
    >
      <i class="fas fa-sliders-h" aria-hidden="true"></i>
      <span>{t("playback_audit_playback")}</span>
    </button>
    <button
      class="switcher-btn"
      class:active={activeMode === "visual"}
      onclick={() => selectMode("visual")}
      type="button"
      aria-pressed={activeMode === "visual"}
    >
      <i class="fas fa-eye" aria-hidden="true"></i>
      <span>{t("playback_audit_visual")}</span>
    </button>
  </div>
</div>

<style>
  .mode-switcher {
    width: 100%;
  }

  .switcher-track {
    position: relative;
    display: flex;
    gap: 3px;
    padding: 3px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 13px;
  }

  .switcher-pill {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 3px);
    height: calc(100% - 6px);
    background: var(--theme-accent);
    border: 1px solid var(--theme-accent);
    border-radius: 10px;
    transition: transform var(--duration-dramatic)
      cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 2px 6px var(--theme-shadow);
    pointer-events: none;
  }

  .switcher-pill.visual {
    transform: translateX(calc(100% + 3px));
  }

  .switcher-btn {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: color var(--duration-emphasis) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .switcher-btn i {
    font-size: var(--font-size-sm);
    transition: transform var(--duration-emphasis) ease;
  }

  .switcher-btn.active {
    color: white;
  }

  .switcher-btn.active i {
    transform: scale(1.1);
  }

  @media (hover: hover) and (pointer: fine) {
    .switcher-btn:hover:not(.active) {
      color: var(--theme-text);
    }
  }

  .switcher-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .switcher-pill {
      transition: none;
    }
  }
</style>
