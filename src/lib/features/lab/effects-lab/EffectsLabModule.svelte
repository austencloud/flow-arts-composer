<!--
  EffectsLabModule.svelte

  Unified lab for all animation visual effects (Trails, Fire, Charcoal, LED).
  Mode switcher at top, inner tabs (Tuning / Points) below.
  The EffectsLabPlaybackHost stays mounted (CSS-hidden during Points tab)
  so the canvas and playback survive inner-tab switches.
-->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import EffectsLabPlaybackHost from "./components/EffectsLabPlaybackHost.svelte";
  import {
    getEffectDescriptor,
    type EffectMode,
  } from "./domain/effect-descriptor";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  const MODE_KEY = "effects-lab-active-mode";
  const TAB_KEY = "effects-lab-active-tab";
  type InnerTab = "tuning" | "points";

  function loadMode(): EffectMode {
    try {
      const raw = sessionStorage.getItem(MODE_KEY);
      if (raw === "trails" || raw === "fire" || raw === "charcoal" || raw === "led") return raw;
    } catch { /* ignore */ }
    return "trails";
  }

  function loadTab(): InnerTab {
    try {
      const raw = sessionStorage.getItem(TAB_KEY);
      if (raw === "tuning" || raw === "points") return raw;
    } catch { /* ignore */ }
    return "tuning";
  }

  let activeMode = $state<EffectMode>(loadMode());
  let activeTab = $state<InnerTab>(loadTab());

  let descriptor = $derived(getEffectDescriptor(activeMode));

  const visibilityManager = getAnimationVisibilityManager();

  // Activate the effect for a given mode
  function activateMode(mode: EffectMode) {
    // "trails" maps to the "trails" effect type; others map directly
    visibilityManager.setActiveEffect(mode as "fire" | "charcoal" | "led" | "trails");
  }

  // Deactivate all effects (clear to none)
  function deactivateMode(_mode: EffectMode) {
    visibilityManager.setActiveEffect("none");
  }

  // On mount: set the active effect to match the restored mode
  initializeMode(untrack(() => activeMode));

  function initializeMode(current: EffectMode) {
    activateMode(current);
  }

  function setMode(mode: EffectMode) {
    activeMode = mode;
    activateMode(mode);
    try { sessionStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }

  // Clean up when the entire module unmounts (navigating away from Effects Lab)
  onDestroy(() => {
    deactivateMode(activeMode);
  });

  function setTab(tab: InnerTab) {
    activeTab = tab;
    try { sessionStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
  }

  // Lazy-load point editor (shared across fire/charcoal/LED)
  let PointEditorComponent = $state<any>(null);

  $effect(() => {
    if (activeTab === "points" && !PointEditorComponent) {
      import("./components/EffectPointEditorTab.svelte").then((mod) => {
        PointEditorComponent = mod.default;
      });
    }
  });
</script>

<div class="effects-lab">
  <header class="header">
    <div class="title-row">
      <h1>
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        Effects Lab
      </h1>
      <span class="badge">Experimental</span>
    </div>

    <div class="tab-bar" role="tablist">
      <button
        role="tab"
        class="tab"
        class:active={activeTab === "tuning"}
        aria-selected={activeTab === "tuning"}
        style="--tab-color: {descriptor.accentColor}"
        onclick={() => setTab("tuning")}
      >
        <i class="fas fa-sliders-h" aria-hidden="true"></i>
        Tuning
      </button>
      <button
        role="tab"
        class="tab"
        class:active={activeTab === "points"}
        aria-selected={activeTab === "points"}
        style="--tab-color: var(--theme-accent, #8b5cf6)"
        onclick={() => setTab("points")}
      >
        <i class="fas fa-crosshairs" aria-hidden="true"></i>
        Tip Points
      </button>
    </div>
  </header>

  <div class="tab-content" role="tabpanel">
    <div class="tuning-host" class:hidden={activeTab !== "tuning"}>
      <EffectsLabPlaybackHost />
    </div>
    {#if activeTab === "points"}
      {#if PointEditorComponent}
        <PointEditorComponent />
      {:else}
        <div class="loading">Loading point editor...</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .effects-lab {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .header {
    flex-shrink: 0;
    padding: var(--spacing-md, 16px) var(--spacing-lg, 24px) 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin-bottom: var(--spacing-sm, 8px);
  }

  .title-row h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text, white);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
  }

  .title-row h1 i {
    color: var(--theme-accent, #8b5cf6);
  }

  .badge {
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    background: rgba(139, 92, 246, 0.15);
    color: var(--theme-accent, #8b5cf6);
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .tab-bar {
    display: flex;
    gap: var(--spacing-xs, 4px);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 10px 20px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: color 150ms ease, border-color 150ms ease;
  }

  .tab:hover {
    color: var(--theme-text, white);
  }

  .tab.active {
    color: var(--tab-color, var(--theme-accent));
    border-bottom-color: var(--tab-color, var(--theme-accent));
  }

  .tab:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: -2px;
  }

  .tab-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .tuning-host {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .tuning-host.hidden {
    display: none;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
  }

  @media (prefers-reduced-motion: reduce) {
    .tab {
      transition: none;
    }
  }
</style>
