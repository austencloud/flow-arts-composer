<!--
  ReadyStep - Final step of the create tutorial

  Desktop: workspace mockup with numbered buttons + legend panel (side by side).
  Mobile: accordion list of tools (no mockup - user just built the sequence).
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { createTutorialState } from "../../../state/create-tutorial-state.svelte";
  import { pictographDataToStepData } from "$lib/shared/pictograph/shared/domain/utils/step-pictograph-conversion";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import {
    WORKSPACE_BUTTON_LAYOUT,
    WORKSPACE_BUTTON_TUTORIAL,
    WORKSPACE_BUTTON_ICON,
    workspaceButtonsInZone,
    type WorkspaceButtonLayoutEntry,
    type WorkspaceButtonId,
  } from "$lib/features/create/shared/workspace-panel/shared/workspace-button-layout";
  import UndoGlyph from "$lib/features/create/shared/workspace-panel/shared/components/buttons/UndoGlyph.svelte";

  interface Props {
    onAdvance: () => void;
  }

  const { onAdvance }: Props = $props();

  // Haptic
  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  // Accordion state for mobile
  let expandedIndex = $state<number | null>(null);

  function toggleAccordion(index: number) {
    hapticService?.trigger("selection");
    expandedIndex = expandedIndex === index ? null : index;
  }

  // Convert tutorial data to StepGrid-compatible format
  const startPlacementStep = $derived.by(() => {
    const startPicto = createTutorialState.startPlacement;
    if (!startPicto) return null;

    const sp: StartPlacementData = {
      ...startPicto,
      isStartPlacement: true as const,
    };

    return {
      ...sp,
      stepNumber: 0,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    } as StepData;
  });

  const beatSteps = $derived<StepData[]>(
    createTutorialState.steps.map((step, i) =>
      pictographDataToStepData(step, step.id ?? `tutorial-beat-${i}`)
    )
  );

  const displayWord = $derived(
    createTutorialState.steps.map((b) => b.letter ?? "").join("")
  );

  // The diagram below is built entirely from the shared workspace button layout
  // (the same source ButtonPanel renders from), so it can never drift.
  const LAYOUT = [...WORKSPACE_BUTTON_LAYOUT].sort((a, b) => a.order - b.order);
  const headerLeadingButtons = workspaceButtonsInZone("header-leading");
  const leftButtons = workspaceButtonsInZone("left");
  const centerButtons = workspaceButtonsInZone("center");
  const rightButtons = workspaceButtonsInZone("right");
  const headerTrailingButtons = workspaceButtonsInZone("header-trailing");
  const gridButton = workspaceButtonsInZone("grid")[0];
  const meta = WORKSPACE_BUTTON_TUTORIAL;
</script>

{#snippet glyph(id: WorkspaceButtonId, size: number)}
  {#if WORKSPACE_BUTTON_ICON[id].iconType === "svg"}
    <UndoGlyph {size} direction={id === "redo" ? "redo" : "undo"} />
  {:else}
    <i class="fa-solid {WORKSPACE_BUTTON_ICON[id].icon}" aria-hidden="true"></i>
  {/if}
{/snippet}

{#snippet mockSpot(entry: WorkspaceButtonLayoutEntry, extraClass: string)}
  <div class="button-spot {extraClass}">
    <span class="badge">{entry.order}</span>
    <div class="mock-button {meta[entry.id].colorClass} glow">
      {@render glyph(entry.id, 18)}
    </div>
  </div>
{/snippet}

<div class="tutorial-step">
  <div class="step-header">
    <h1 id="tutorial-step-title" class="title">Your workspace</h1>
    <p class="subtitle">Here's where everything lives.</p>
  </div>

  <!-- Desktop: side-by-side mockup + legend -->
  <div class="workspace-mockup desktop-only">
    <div class="workspace-panel">
      <div class="top-bar">
        <div class="header-actions header-leading">
          {#each headerLeadingButtons as entry (entry.id)}
            {@render mockSpot(entry, "")}
          {/each}
        </div>
        <span class="word-label">{displayWord}</span>
        <div class="header-actions header-trailing">
          {#each headerTrailingButtons as entry (entry.id)}
            {@render mockSpot(entry, "")}
          {/each}
        </div>
      </div>

      <div class="grid-area">
        {#if beatSteps.length > 0}
          {#await import("$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte") then mod}
            <mod.default steps={beatSteps} startPlacement={startPlacementStep} />
          {/await}
        {/if}

        <div class="tap-hint">
          <span class="badge grid-badge">{gridButton?.order}</span>
          <i class="fas fa-hand-pointer" aria-hidden="true"></i>
          <span>Tap any step to edit it</span>
        </div>
      </div>

      <!-- Mirrors the real ButtonPanel: Clear pinned left, Play absolutely
           centered (can't drift), [Sequence Actions, Share] right. -->
      <div class="button-bar">
        <div class="btn-group">
          {#each leftButtons as entry (entry.id)}
            {@render mockSpot(entry, "")}
          {/each}
        </div>

        {#each centerButtons as entry (entry.id)}
          {@render mockSpot(entry, "center-spot")}
        {/each}

        <div class="btn-group">
          {#each rightButtons as entry (entry.id)}
            {@render mockSpot(entry, "")}
          {/each}
        </div>
      </div>
    </div>

    <div class="legend-panel">
      {#each LAYOUT as entry (entry.id)}
        <div class="legend-item">
          <span class="legend-badge {meta[entry.id].colorClass}"
            >{entry.order}</span
          >
          <div class="legend-text">
            <strong>{meta[entry.id].label}</strong>
            <span class="legend-desc">{meta[entry.id].description}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Mobile: accordion list, no mockup -->
  <div class="accordion-list mobile-only">
    {#each LAYOUT as entry, i (entry.id)}
      <button
        class="accordion-item"
        class:expanded={expandedIndex === i}
        onclick={() => toggleAccordion(i)}
        aria-expanded={expandedIndex === i}
      >
        <div class="accordion-header">
          <span class="legend-badge {meta[entry.id].colorClass}">
            {@render glyph(entry.id, 15)}
          </span>
          <span class="accordion-label">{meta[entry.id].label}</span>
          <i class="fas fa-chevron-down accordion-chevron" aria-hidden="true"
          ></i>
        </div>
        {#if expandedIndex === i}
          <p class="accordion-body">{meta[entry.id].description}</p>
        {/if}
      </button>
    {/each}
  </div>

  <button class="go-button" onclick={onAdvance}>
    Start building <i class="fas fa-arrow-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .tutorial-step {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 1100px;
    width: 100%;
    text-align: center;
    padding: 20px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-radius: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    /* Ensure content doesn't overflow behind the wizard step-dots */
    max-height: calc(100vh - 120px);
    overflow-y: auto;
  }

  .title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .subtitle {
    font-size: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0;
    line-height: 1.5;
  }


  .desktop-only {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 20px;
    width: 100%;
    /* flex-grow to fill a tall card, but never shrink below the mockup +
       legend's own height. Without this floor (min-height:auto), a short
       viewport compressed this box below its content, so the legend column
       spilled downward over the "Start building" button. The card
       (.tutorial-step, overflow-y:auto) scrolls instead when space is tight. */
    flex: 1 1 auto;
    min-height: min-content;
  }

  .mobile-only {
    display: none;
  }

  .workspace-panel {
    display: flex;
    flex-direction: column;
    border: 1px solid
      color-mix(in srgb, var(--semantic-info, #38bdf8) 25%, transparent);
    border-radius: 12px;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    min-height: clamp(280px, 45vh, 550px);
  }

  .top-bar {
    display: grid;
    grid-template-columns:
      calc(96px + var(--settings-spacing-sm, 8px))
      minmax(0, 1fr)
      calc(96px + var(--settings-spacing-sm, 8px));
    align-items: center;
    gap: var(--settings-spacing-sm, 8px);
    padding: 10px 14px;
    flex-shrink: 0;
  }

  .word-label {
    grid-column: 2;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--settings-spacing-sm, 8px);
  }

  .header-trailing {
    grid-column: 3;
  }

  .header-leading {
    grid-column: 1;
  }

  .grid-area {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .tap-hint {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: color-mix(
      in srgb,
      var(--semantic-info, #38bdf8) 20%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-info, #38bdf8) 35%, transparent);
    border-radius: 20px;
    color: var(--semantic-info, #38bdf8);
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    animation: tap-hint-pulse 2.4s ease-in-out infinite;
  }

  .tap-hint i {
    font-size: 0.85rem;
  }

  @keyframes tap-hint-pulse {
    0%,
    100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }

  .button-bar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    flex-shrink: 0;
  }

  .btn-group {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }

  /* Play is anchored dead-center like the real ButtonPanel, so it can never
     drift with the side groups' widths. */
  .center-spot {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  /* Inline number badge for the in-grid "tap a step" hint. Its number comes
     from the shared layout's `grid` zone, so it follows the button order. */
  .tap-hint .grid-badge {
    position: static;
    width: 18px;
    height: 18px;
  }

  .button-spot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .badge {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--theme-text, #fff);
    color: var(--theme-panel-bg, #111);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    line-height: 1;
  }

  .mock-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: var(--theme-text, #fff);
    font-size: 1.1rem;
  }

  .mock-button.accent {
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, #8b5cf6) 0%,
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 85%, #6d28d9) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 30%, transparent);
  }

  .mock-button.success {
    background: linear-gradient(
      135deg,
      var(--semantic-success, #22c55e) 0%,
      color-mix(in srgb, var(--semantic-success, #22c55e) 85%, #16a34a) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
  }

  .mock-button.error {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 80%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
  }

  .mock-button.glow.accent {
    animation: button-glow-accent 2.4s ease-in-out infinite;
  }

  .mock-button.glow.success {
    animation: button-glow-success 2.4s ease-in-out infinite;
  }

  .mock-button.glow.error {
    animation: button-glow-error 2.4s ease-in-out infinite;
  }

  @keyframes button-glow-accent {
    0%,
    100% {
      box-shadow: 0 4px 12px
        color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 40%, transparent);
    }
    50% {
      box-shadow:
        0 4px 16px
          color-mix(
            in srgb,
            var(--theme-accent-strong, #8b5cf6) 60%,
            transparent
          ),
        0 0 28px
          color-mix(
            in srgb,
            var(--theme-accent-strong, #8b5cf6) 35%,
            transparent
          );
    }
  }

  @keyframes button-glow-success {
    0%,
    100% {
      box-shadow: 0 4px 12px
        color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
    }
    50% {
      box-shadow:
        0 4px 16px
          color-mix(in srgb, var(--semantic-success, #22c55e) 60%, transparent),
        0 0 28px
          color-mix(in srgb, var(--semantic-success, #22c55e) 35%, transparent);
    }
  }

  @keyframes button-glow-error {
    0%,
    100% {
      box-shadow: 0 4px 12px
        color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
    }
    50% {
      box-shadow:
        0 4px 16px
          color-mix(in srgb, var(--semantic-error, #ef4444) 60%, transparent),
        0 0 28px
          color-mix(in srgb, var(--semantic-error, #ef4444) 35%, transparent);
    }
  }

  /* ── Desktop legend (flat list) ── */

  .legend-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    justify-content: center;
  }

  .legend-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    text-align: left;
  }

  .legend-badge {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
    line-height: 1;
  }

  .legend-badge.accent {
    background: var(--theme-accent-strong, #8b5cf6);
    color: var(--theme-text, #fff);
  }

  .legend-badge.success {
    background: var(--semantic-success, #22c55e);
    color: var(--theme-text, #fff);
  }

  .legend-badge.error {
    background: var(--semantic-error, #ef4444);
    color: var(--theme-text, #fff);
  }

  .legend-badge.info {
    background: var(--semantic-info, #38bdf8);
    color: var(--theme-text, #fff);
  }

  .legend-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .legend-text strong {
    color: var(--theme-text, #fff);
    font-size: 0.95rem;
  }

  .legend-desc {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: 0.85rem;
    line-height: 1.4;
  }


  .accordion-list {
    display: none;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .accordion-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text, #fff);
    cursor: pointer;
    text-align: left;
    transition: border-color var(--duration-fast, 150ms) var(--ease-out);
  }

  .accordion-item.expanded {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .accordion-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
  }

  .accordion-header .legend-badge i {
    font-size: 12px;
    line-height: 1;
  }

  .accordion-label {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .accordion-chevron {
    font-size: 0.7rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    transition: transform var(--duration-fast, 150ms) var(--ease-out);
  }

  .accordion-item.expanded .accordion-chevron {
    transform: rotate(180deg);
  }

  .accordion-body {
    padding: 0 14px 12px 48px;
    margin: 0;
    font-size: 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    line-height: 1.45;
  }


  .go-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 32px;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 40%,
      transparent
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 60%, transparent);
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out);
    margin-top: 4px;
    flex-shrink: 0;
  }

  .go-button:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 50%,
      transparent
    );
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 30%, transparent);
  }

  .go-button:active {
    transform: scale(0.97);
  }

  .go-button:focus-visible {
    outline: 2px solid var(--theme-accent-strong, #8b5cf6);
    outline-offset: 2px;
  }

  /* ── Compact: swap the side-by-side mockup for the accordion ──
     Breakpoint matches the wizard's fullscreen threshold (900px). Below it the
     card goes edge-to-edge, where the wide desktop mockup + legend can't fit on
     a short viewport without shoving the "Start building" button under the fixed
     step-dots. The accordion is content-sized and always clears them. */

  @media (max-width: 900px) {
    .desktop-only {
      display: none;
    }

    .mobile-only {
      display: flex;
    }

    .tutorial-step {
      padding: 16px;
      gap: 12px;
      max-height: calc(100vh - 100px);
    }

    .title {
      font-size: 1.25rem;
    }

    .go-button {
      padding: 14px 28px;
      width: 100%;
    }
  }

  @media (max-width: 480px) {
    .tutorial-step {
      padding: 14px;
      gap: 10px;
    }

    .go-button {
      padding: 12px 24px;
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .mock-button.glow.accent,
    .mock-button.glow.success,
    .mock-button.glow.error {
      animation: none;
      box-shadow: 0 0 12px var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    }

    .go-button,
    .accordion-item,
    .accordion-chevron {
      transition: none;
    }

    .go-button:active {
      transform: none;
    }

    .tap-hint {
      animation: none;
      opacity: 0.85;
    }
  }
</style>
