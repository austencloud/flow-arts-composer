<!--
GridModeToggle.svelte - Single-button toggle showing opposite grid mode
Action-oriented pattern: Shows the mode you can switch TO (not current mode)
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";

  const { currentGridMode = GridMode.DIAMOND, onGridModeChange } = $props<{
    currentGridMode?: GridMode;
    onGridModeChange?: (gridMode: GridMode) => void;
  }>();

  const hapticService = getHapticFeedback();

  // Action-oriented: Show the mode you can switch TO
  const oppositeMode = $derived(
    currentGridMode === GridMode.DIAMOND ? GridMode.BOX : GridMode.DIAMOND
  );

  const oppositeLabel = $derived(
    oppositeMode === GridMode.DIAMOND
      ? t("assembly_diamond")
      : t("assembly_box")
  );

  const switchAriaLabel = $derived(
    t("assembly_switch_to_mode", { mode: oppositeLabel })
  );

  function handleToggle() {
    hapticService?.trigger("selection");
    onGridModeChange?.(oppositeMode);
  }
</script>

<button
  class="grid-mode-toggle"
  type="button"
  onclick={handleToggle}
  aria-label={switchAriaLabel}
  title={switchAriaLabel}
>
  <i
    class="fas fa-square mode-icon"
    class:diamond={currentGridMode === GridMode.DIAMOND}
    aria-hidden="true"
  ></i>
  <Crossfade key={oppositeMode}>
    <span class="mode-label">{switchAriaLabel}</span>
  </Crossfade>
</button>

<style>
  .grid-mode-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    /* Bigger touch target */
    min-height: var(--min-touch-target);
    padding: 0 20px;

    /* Same surface, border and type as the picker's view button beside it */
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    min-width: 13rem;

    /* Typography */
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
    letter-spacing: 0.3px;

    /* Interaction */
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;

    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast);
  }

  .mode-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  .mode-icon {
    transition: transform var(--transition-normal);
  }

  .mode-icon.diamond {
    transform: rotate(45deg);
  }

  /* Hover state */
  @media (hover: hover) {
    .grid-mode-toggle:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      transform: translateY(-1px);
    }
  }

  /* Active/pressed state */
  .grid-mode-toggle:active {
    transform: translateY(0) scale(0.98);
    transition: transform var(--transition-micro);
  }

  /* Focus state */
  .grid-mode-toggle:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .grid-mode-toggle {
      transition: none;
    }

    .mode-icon {
      transition: none;
    }

    .grid-mode-toggle:hover {
      transform: none;
    }

    .grid-mode-toggle:active {
      transform: scale(0.98);
    }
  }

  /* Mobile responsive */
  @media (max-width: 600px) {
    .grid-mode-toggle {
      min-height: var(--min-touch-target);
      padding: 0 16px;
    }

    .mode-label {
      font-size: var(--font-size-sm);
    }
  }
</style>
