<script lang="ts">
  /**
   * FormationSelector - Formation preset buttons
   *
   * Quick access to formation presets: Grid, Line, Circle, V-Shape, Diagonal.
   * Shows active state and triggers transitions on selection.
   */

  import type { FormationPreset } from "@austencloud/scene-3d";
  import { FORMATION_PRESET_INFO } from "@austencloud/scene-3d";

  interface Props {
    /** Currently active preset */
    value: FormationPreset;
    /** Whether a transition is in progress */
    isTransitioning?: boolean;
    /** Number of performers (affects visual feedback) */
    performerCount?: number;
    /** Set of preset ids that are disabled (count not in PRESET_VALID_COUNTS) */
    disabledPresets?: Set<FormationPreset>;
    /** Callback when preset is selected */
    onchange: (preset: FormationPreset) => void;
  }

  let {
    value,
    isTransitioning = false,
    performerCount = 1,
    disabledPresets,
    onchange,
  }: Props = $props();
</script>

<div class="formation-bar" class:transitioning={isTransitioning}>
  {#each FORMATION_PRESET_INFO as preset}
    {@const isDisabled =
      isTransitioning || (disabledPresets?.has(preset.id) ?? false)}
    <button
      class="formation-btn"
      class:active={value === preset.id}
      onclick={() => onchange(preset.id)}
      aria-label={preset.description}
      aria-pressed={value === preset.id}
      title={disabledPresets?.has(preset.id)
        ? `${preset.name} - not valid for ${performerCount} performers`
        : preset.description}
      disabled={isDisabled}
    >
      <i class="fa-solid fa-{preset.icon}" aria-hidden="true"></i>
      <span class="label">{preset.name}</span>
    </button>
  {/each}
</div>

<style>
  .formation-bar {
    display: flex;
    flex-wrap: wrap;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    padding: 4px;
    gap: 2px;
  }

  .formation-bar.transitioning {
    opacity: 0.8;
    pointer-events: none;
  }

  .formation-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 1 1 64px;
    min-width: 64px;
    min-height: var(--min-touch-target);
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast);
  }

  .formation-btn:hover:not(:disabled) {
    color: var(--theme-text);
    background: var(--theme-card-hover-bg);
  }

  .formation-btn.active {
    color: white;
    background: var(--theme-accent);
  }

  .formation-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .formation-btn i {
    font-size: 0.95rem;
  }

  .label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    line-height: 1.1;
    text-align: center;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  @media (max-width: 600px) {
    .formation-bar {
      padding: 2px;
    }

    .formation-btn {
      padding: 4px 6px;
    }
  }
</style>
