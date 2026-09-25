<!--
  LOOPCompletionPopover.svelte

  Popover content for the LOOP ring button. Shows 6 LOOP components
  as labeled icon buttons with color states matching the ring segments.

  Full color = already active (status only).
  Faint = available for auto-completion (clickable).
  Gray = not possible (disabled).
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { LOOP_COMPONENT_MAP } from "$lib/features/create/generate/shared/domain/constants/loop-constants";
  import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
  import type { LOOPOption } from "../../../services/loop-validator";
  import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

  interface Props {
    /** Components active in detected LOOP */
    activeComponents: Set<LOOPComponent>;
    /** Available LOOPOptions for completion */
    availableLOOPOptions: LOOPOption[];
    /** Formatted display name of current LOOP type (if active) */
    currentLoopLabel: string | null;
    /** Whether the sequence is circular (even if no named pattern) */
    isCircular: boolean;
    /** Whether the sequence has enough beats for analysis */
    hasSufficientBeats: boolean;
    /** Called when user selects a component for auto-completion */
    onComponentSelect?: (component: LOOPComponent, loopType: LOOPType) => void;
  }

  let {
    activeComponents,
    availableLOOPOptions,
    currentLoopLabel,
    isCircular,
    hasSufficientBeats,
    onComponentSelect,
  }: Props = $props();

  // All 6 components in canonical display order
  const ALL_COMPONENTS: LOOPComponent[] = [
    LOOPComponent.ROTATED,
    LOOPComponent.MIRRORED,
    LOOPComponent.FLIPPED,
    LOOPComponent.SWAPPED,
    LOOPComponent.INVERTED,
    LOOPComponent.REWOUND,
  ];

  // Decompose available LOOPOptions into per-component availability
  const availableComponents = $derived.by(() => {
    const set = new Set<LOOPComponent>();
    for (const option of availableLOOPOptions) {
      const components = parseLoopComponents(option.loopType);
      for (const c of components) set.add(c);
    }
    return set;
  });

  function getComponentState(
    component: LOOPComponent
  ): "active" | "available" | "unavailable" {
    if (activeComponents.has(component)) return "active";
    if (availableComponents.has(component)) return "available";
    return "unavailable";
  }

  /**
   * Find the best matching LOOPType for a tapped component.
   * Prefers the option with fewest total components (simplest extension).
   */
  function findBestLoopType(component: LOOPComponent): LOOPOption | null {
    const matching = availableLOOPOptions.filter((opt) => {
      const components = parseLoopComponents(opt.loopType);
      return components.has(component);
    });
    if (matching.length === 0) return null;
    matching.sort((a, b) => {
      const aSize = parseLoopComponents(a.loopType).size;
      const bSize = parseLoopComponents(b.loopType).size;
      return aSize - bSize;
    });
    return matching[0] ?? null;
  }

  function handleClick(component: LOOPComponent) {
    const option = findBestLoopType(component);
    if (!option) return;
    onComponentSelect?.(component, option.loopType);
  }
</script>

<div
  class="popover-content"
  role="region"
  aria-label={t("create_ui_loop_completion_options")}
>
  {#if !hasSufficientBeats}
    <p class="empty-message">
      {t("create_ui_add_more_steps_to_see_loop_options")}
    </p>
  {:else}
    {#if currentLoopLabel}
      <div class="loop-status">
        <i class="fas fa-infinity" aria-hidden="true"></i>
        <span>{currentLoopLabel}</span>
      </div>
    {:else if isCircular}
      <div class="loop-status circular-only">
        <i class="fas fa-circle-notch" aria-hidden="true"></i>
        <span>Circular sequence (no LOOP pattern detected)</span>
      </div>
    {/if}

    <div class="component-grid">
      {#each ALL_COMPONENTS as component}
        {@const info = LOOP_COMPONENT_MAP.get(component)}
        {@const state = getComponentState(component)}
        {#if info}
          <button
            type="button"
            class="component-button"
            class:active={state === "active"}
            class:available={state === "available"}
            class:unavailable={state === "unavailable"}
            disabled={state !== "available"}
            onclick={() => handleClick(component)}
            title={state === "active"
              ? `${info.label} - active`
              : state === "available"
                ? `Apply ${info.label} LOOP`
                : `${info.label} - not available`}
            style:--component-color={info.color}
          >
            <i class="fas fa-{info.icon}" aria-hidden="true"></i>
            <span class="component-label">{info.label}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .popover-content {
    padding: 12px;
    min-width: 200px;
  }

  .empty-message {
    margin: 0;
    padding: 8px;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim);
    text-align: center;
  }

  .loop-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-accent);
  }

  .component-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .component-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .component-button i {
    font-size: 14px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
  }

  .component-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    white-space: nowrap;
  }

  /* Active: full color, non-interactive */
  .component-button.active {
    background: color-mix(in srgb, var(--component-color) 20%, transparent);
    border-color: color-mix(in srgb, var(--component-color) 40%, transparent);
    cursor: default;
  }
  .component-button.active i {
    color: var(--component-color);
  }
  .component-button.active .component-label {
    color: var(--component-color);
  }

  /* Available: faint color, clickable */
  .component-button.available {
    border-color: color-mix(in srgb, var(--component-color) 25%, transparent);
  }
  .component-button.available i {
    color: var(--component-color);
    opacity: 0.5;
  }
  .component-button.available .component-label {
    color: var(--theme-text-dim);
  }
  .component-button.available:hover {
    background: color-mix(in srgb, var(--component-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--component-color) 40%, transparent);
  }
  .component-button.available:hover i {
    opacity: 1;
  }
  .component-button.available:active {
    transform: scale(0.95);
    transition-duration: 50ms;
  }

  /* Unavailable: gray, disabled */
  .component-button.unavailable {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .component-button.unavailable i {
    color: var(--theme-text-dim);
  }
  .component-button.unavailable .component-label {
    color: var(--theme-text-dim);
  }

  @media (prefers-reduced-motion: reduce) {
    .component-button {
      transition: none;
    }
  }
</style>
