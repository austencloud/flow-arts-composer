<!--
  ModeToggle.svelte

  Segmented control for switching between Single Media and Composite export modes.
  Top-level control in Export Panel panel.

  Design:
  - iOS-style segmented control
  - Smooth sliding indicator animation
  - Theme-based colors
  - Keyboard accessible (Tab, Arrow keys, Enter/Space)

  Domain: Export Panel - Mode Selection Control
-->
<script lang="ts">
  import type { ShareMode } from "../../domain/models/share-mode";

  let {
    mode = "single",
    onModeChange,
  }: {
    mode?: ShareMode;
    onModeChange?: (mode: ShareMode) => void;
  } = $props();

  let singleButton = $state<HTMLButtonElement | null>(null);
  let compositeButton = $state<HTMLButtonElement | null>(null);

  function handleModeChange(newMode: ShareMode) {
    onModeChange?.(newMode);
  }

  // WAI-ARIA tabs pattern: for a small tablist, arrow keys move focus AND
  // selection together (selection follows focus), with wraparound.
  function selectAndFocus(target: ShareMode) {
    handleModeChange(target);
    (target === "single" ? singleButton : compositeButton)?.focus();
  }

  function handleKeydown(event: KeyboardEvent, targetMode: ShareMode) {
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        handleModeChange(targetMode);
        break;
      case "ArrowLeft":
      case "ArrowRight":
        // Two tabs with wraparound: either arrow moves to the other tab
        event.preventDefault();
        selectAndFocus(targetMode === "single" ? "composite" : "single");
        break;
      case "Home":
        event.preventDefault();
        selectAndFocus("single");
        break;
      case "End":
        event.preventDefault();
        selectAndFocus("composite");
        break;
    }
  }
</script>

<div class="mode-toggle" role="tablist" aria-label="Export mode selection">
  <button
    bind:this={singleButton}
    id="tab-single-media"
    class="mode-option"
    class:active={mode === "single"}
    role="tab"
    aria-selected={mode === "single"}
    aria-controls="single-media-panel"
    tabindex={mode === "single" ? 0 : -1}
    onclick={() => handleModeChange("single")}
    onkeydown={(e) => handleKeydown(e, "single")}
  >
    <i class="fas fa-image" aria-hidden="true"></i>
    <span>Single Media</span>
  </button>

  <button
    bind:this={compositeButton}
    id="tab-composite"
    class="mode-option"
    class:active={mode === "composite"}
    role="tab"
    aria-selected={mode === "composite"}
    aria-controls="composite-panel"
    tabindex={mode === "composite" ? 0 : -1}
    onclick={() => handleModeChange("composite")}
    onkeydown={(e) => handleKeydown(e, "composite")}
  >
    <i class="fas fa-th" aria-hidden="true"></i>
    <span>Composite</span>
  </button>

  <!-- Sliding indicator -->
  <div
    class="indicator"
    style:transform={mode === "single" ? "translateX(0%)" : "translateX(100%)"}
  ></div>
</div>

<style>
  .mode-toggle {
    position: relative;
    display: flex;
    gap: 0;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    padding: 4px;
    width: fit-content;
    margin: 0 auto;
    isolation: isolate;
  }

  .mode-option {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 20px;
    min-height: var(--min-touch-target); /* WCAG 2.1 AA touch target */
    background: transparent;
    border: none;
    border-radius: 8px;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: color var(--duration-normal) ease;
    z-index: 1;
    white-space: nowrap;
    min-width: 140px;
  }

  .mode-option i {
    font-size: var(--font-size-base);
  }

  .mode-option:hover {
    color: var(--theme-text);
  }

  .mode-option:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .mode-option.active {
    color: var(--theme-text, white);
  }

  /* Sliding indicator background */
  .indicator {
    position: absolute;
    top: 4px;
    left: 4px;
    width: calc(50% - 4px);
    height: calc(100% - 8px);
    background: var(--theme-accent);
    border-radius: 8px;
    transition: transform var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
  }

  /* Mobile optimization */
  @media (max-width: 600px) {
    .mode-toggle {
      width: 100%;
    }

    .mode-option {
      flex: 1;
      min-width: 0;
    }

    .mode-option span {
      font-size: var(--font-size-compact);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .indicator {
      transition: none;
    }

    .mode-option {
      transition: none;
    }
  }
</style>
