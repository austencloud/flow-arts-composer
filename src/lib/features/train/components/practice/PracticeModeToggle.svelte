<!--
  PracticeModeToggle.svelte - Practice Mode Selector

  Segmented control for switching between Adaptive, Step-by-Step, and Timed modes.
  Shows labels and descriptions to make mode purposes clear to users.

  Props:
  - compact: When true, shows icon-only (for use in space-constrained areas)
-->
<script lang="ts">
  import { PracticeMode } from "../../domain/enums/train-enums";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    activeMode: PracticeMode;
    onModeChange: (mode: PracticeMode) => void;
    compact?: boolean;
  }

  let { activeMode, onModeChange, compact = false }: Props = $props();

  const modes = [
    {
      value: PracticeMode.ADAPTIVE,
      label: t('train_mode_adaptive'),
      shortDesc: t('train_mode_adaptive_short'),
      icon: "fa-brain",
      description: t('train_mode_adaptive_desc'),
    },
    {
      value: PracticeMode.STEP_BY_STEP,
      label: t('train_mode_step'),
      shortDesc: t('train_mode_step_short'),
      icon: "fa-shoe-prints",
      description: t('train_mode_step_desc'),
    },
    {
      value: PracticeMode.TIMED,
      label: t('train_mode_timed'),
      shortDesc: t('train_mode_timed_short'),
      icon: "fa-stopwatch",
      description: t('train_mode_timed_desc'),
    },
  ];
</script>

<div class="mode-toggle" class:compact>
  {#each modes as mode}
    <button
      class="mode-button"
      class:active={activeMode === mode.value}
      onclick={() => onModeChange(mode.value)}
      title={mode.description}
      aria-label={`${mode.label} mode: ${mode.description}`}
    >
      <i class="fas {mode.icon}" aria-hidden="true"></i>
      {#if !compact}
        <div class="mode-text">
          <span class="mode-label">{mode.label}</span>
          <span class="mode-desc">{mode.shortDesc}</span>
        </div>
      {/if}
    </button>
  {/each}
</div>

<style>
  .mode-toggle {
    display: flex;
    gap: 0.375rem;
    padding: 0.25rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 0.75rem;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .mode-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    min-height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal);
    white-space: nowrap;
  }

  .mode-button:hover {
    background: var(--theme-stroke);
    color: color-mix(in srgb, var(--theme-text, white) 90%, transparent);
  }

  .mode-button.active {
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 25%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 40%,
        transparent
      );
    color: var(--theme-text);
  }

  .mode-button i {
    font-size: 1.125rem;
    flex-shrink: 0;
  }

  /* Text container for label + description */
  .mode-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.0625rem;
  }

  .mode-label {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .mode-desc {
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.2;
  }

  .mode-button.active .mode-desc {
    color: color-mix(in srgb, var(--theme-text, white) 70%, transparent);
  }

  /* Compact mode - icon-only */
  .mode-toggle.compact {
    gap: 0.25rem;
    padding: 0.2rem;
  }

  .mode-toggle.compact .mode-button {
    padding: 0.5rem;
  }

  .mode-toggle.compact .mode-button i {
    font-size: 1.25rem;
  }

  /* Responsive: collapse to icon + label only on smaller screens */
  @media (max-width: 640px) {
    .mode-toggle {
      gap: 0.25rem;
    }

    .mode-button {
      padding: 0.5rem 0.75rem;
      gap: 0.5rem;
    }

    .mode-desc {
      display: none;
    }

    .mode-button i {
      font-size: 1rem;
    }

    .mode-label {
      font-size: 0.8125rem;
    }
  }

  /* Very small screens: icon only */
  @media (max-width: 420px) {
    .mode-text {
      display: none;
    }

    .mode-button {
      padding: 0.5rem;
    }

    .mode-button i {
      font-size: 1.25rem;
    }
  }
</style>
