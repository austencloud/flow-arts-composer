<!--
  ModePickerSheet.svelte - Bottom sheet for selecting practice mode

  Shows the three practice modes (Adaptive, Step, Timed) in a bottom sheet.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import { PracticeMode } from "../../domain/enums/train-enums";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    isOpen: boolean;
    currentMode: PracticeMode;
    onModeChange: (mode: PracticeMode) => void;
    onClose: () => void;
  }

  let {
    isOpen = $bindable(false),
    currentMode,
    onModeChange,
    onClose,
  }: Props = $props();

  // Responsive placement: bottom on mobile, right on desktop
  let placement = $state<"bottom" | "right">("bottom");

  onMount(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    placement = mediaQuery.matches ? "right" : "bottom";

    const handler = (e: MediaQueryListEvent) => {
      placement = e.matches ? "right" : "bottom";
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  });

  const modes = [
    {
      value: PracticeMode.ADAPTIVE,
      label: "Adaptive",
      icon: "fa-brain",
      color: "#8b5cf6",
      description:
        "Auto-advances when you match the position. Great for learning new sequences.",
    },
    {
      value: PracticeMode.STEP_BY_STEP,
      label: "Step by Step",
      icon: "fa-shoe-prints",
      color: "var(--semantic-success)",
      description: "Go at your own pace. Manually advance through each step.",
    },
    {
      value: PracticeMode.TIMED,
      label: "Timed",
      icon: "fa-stopwatch",
      color: "var(--semantic-warning)",
      description:
        "Follow the rhythm with scoring. Test your timing and accuracy.",
    },
  ];

  function selectMode(mode: PracticeMode) {
    onModeChange(mode);
    isOpen = false;
    onClose();
  }

  function handleClose() {
    isOpen = false;
    onClose();
  }
</script>

<Drawer
  bind:isOpen
  {placement}
  closeOnBackdrop={true}
  closeOnEscape={true}
  ariaLabel="Select Practice Mode"
  showHandle={placement === "bottom"}
  class="mode-picker-sheet"
  backdropClass="mode-picker-backdrop"
>
  <div class="picker-panel" class:side-drawer={placement === "right"}>
    <!-- Header -->
    <header class="panel-header">
      <div class="header-icon">
        <i class="fas fa-brain" aria-hidden="true"></i>
      </div>
      <div class="header-content">
        <h3 class="panel-title">{t('train_practice_mode')}</h3>
        <p class="panel-subtitle">{t('train_practice_mode_subtitle')}</p>
      </div>
      <button class="close-btn" onclick={handleClose} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Mode Options -->
    <div class="mode-options">
      {#each modes as mode}
        <button
          class="mode-option"
          class:active={currentMode === mode.value}
          onclick={() => selectMode(mode.value)}
          style="--mode-color: {mode.color}"
        >
          <div class="mode-icon">
            <i class="fas {mode.icon}" aria-hidden="true"></i>
          </div>
          <div class="mode-content">
            <span class="mode-label">{mode.label}</span>
            <span class="mode-desc">{mode.description}</span>
          </div>
          {#if currentMode === mode.value}
            <i class="fas fa-check check-icon" aria-hidden="true"></i>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</Drawer>

<style>
  :global(.mode-picker-backdrop) {
    background: rgba(0, 0, 0, 0.7) !important;
  }

  :global(.mode-picker-sheet) {
    --sheet-bg: var(--sheet-bg-solid);
    height: auto !important;
    max-height: 85vh !important;
  }

  :global(.mode-picker-sheet[data-placement="right"]) {
    width: auto !important;
    min-width: 320px;
    max-width: min(420px, 90vw) !important;
    height: 100% !important;
    max-height: 100% !important;
  }

  .picker-panel {
    display: flex;
    flex-direction: column;
    padding: 0 16px 16px;
  }

  .picker-panel.side-drawer {
    min-width: 300px;
    padding: 0 20px 20px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--theme-stroke);
    margin-bottom: 16px;
  }

  .header-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 15%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 10px;
    flex-shrink: 0;
  }

  .header-icon i {
    font-size: var(--font-size-sm);
    color: var(--theme-accent);
  }

  .header-content {
    flex: 1;
    min-width: 0;
  }

  .panel-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .panel-subtitle {
    margin: 2px 0 0 0;
    font-size: 0.75rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .close-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.8rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .mode-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mode-option {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-normal);
    text-align: left;
  }

  .mode-option:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke-strong));
  }

  .mode-option.active {
    background: color-mix(in srgb, var(--mode-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--mode-color) 50%, transparent);
  }

  .mode-icon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--mode-color) 15%, transparent);
    border-radius: 10px;
    flex-shrink: 0;
  }

  .mode-icon i {
    font-size: 1.25rem;
    color: var(--mode-color);
  }

  .mode-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mode-label {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .mode-desc {
    font-size: 0.8rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.35;
  }

  .check-icon {
    font-size: 1rem;
    color: var(--mode-color);
    flex-shrink: 0;
  }

  /* Focus states */
  .close-btn:focus-visible,
  .mode-option:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 80%, transparent);
    outline-offset: 2px;
  }

  /* Safe area for mobile */
  @supports (padding-bottom: env(safe-area-inset-bottom)) {
    .picker-panel:not(.side-drawer) {
      padding-bottom: calc(16px + env(safe-area-inset-bottom));
    }
  }
</style>
