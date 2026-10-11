<script lang="ts">
  import { TYPE_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type { FeedbackType } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const {
    selectedType,
    onTypeChange,
    isInputMode = false,
  } = $props<{
    selectedType: FeedbackType;
    onTypeChange: (type: FeedbackType) => void;
    isInputMode?: boolean;
  }>();
</script>

<fieldset class="type-selector" class:collapsed={isInputMode}>
  <legend class="sr-only">{t("feedback_type")}</legend>
  <div class="segment-control">
    {#each Object.entries(TYPE_CONFIG) as [type, config]}
      <button
        type="button"
        class="segment"
        class:selected={selectedType === type}
        onclick={() => onTypeChange(type as FeedbackType)}
        style="--type-color: {config.color}"
        aria-pressed={selectedType === type}
      >
        <i class="fas {config.icon}" aria-hidden="true"></i>
        <span class="segment-label"
          >{t(
            type === "bug"
              ? "feedback_type_bug_short"
              : type === "feature"
                ? "feedback_type_feature_short"
                : "feedback_type_general_short"
          )}</span
        >
      </button>
    {/each}
  </div>
</fieldset>

<style>
  .type-selector {
    border: none;
    padding: 0;
    margin: 0;
    max-height: 100px;
    opacity: 1;
    overflow: hidden;
    transition:
      max-height var(--duration-fast, 150ms) ease-out,
      opacity var(--duration-fast, 150ms) ease-out,
      margin var(--duration-fast, 150ms) ease-out;
  }

  .type-selector.collapsed {
    max-height: 0;
    opacity: 0;
    margin: 0;
  }

  .segment-control {
    display: flex;
    gap: clamp(4px, 1cqi, 8px);
    padding: clamp(3px, 0.8cqi, 5px);
    background: color-mix(in srgb, var(--theme-panel-bg) 80%, transparent);
    border-radius: clamp(8px, 2cqi, 12px);
    border: 1px solid var(--theme-stroke);
  }

  .segment {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(4px, 1cqi, 8px);
    min-height: var(--min-touch-target);
    padding: clamp(6px, 1.5cqi, 10px) clamp(8px, 2cqi, 14px);
    background: transparent;
    border: 1.5px solid transparent;
    border-radius: clamp(6px, 1.5cqi, 10px);
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 80%,
      transparent
    );
    font-size: clamp(0.8rem, 2.5cqi, 0.9375rem);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    position: relative;
    overflow: hidden;
  }

  .segment::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--type-color) 20%, transparent) 0%,
      color-mix(in srgb, var(--type-color) 8%, transparent) 100%
    );
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .segment i {
    position: relative;
    z-index: 1;
    font-size: clamp(0.9em, 2cqi, 1.15em);
    transition: color var(--duration-normal) ease;
  }

  .segment-label {
    position: relative;
    z-index: 1;
  }

  .segment:hover:not(.selected) {
    color: var(--theme-text-dim);
    border-color: color-mix(in srgb, var(--type-color) 35%, transparent);
  }

  .segment:hover:not(.selected)::before {
    opacity: 0.4;
  }

  .segment:hover:not(.selected) i {
    color: var(--type-color);
  }

  .segment.selected {
    color: var(--theme-text);
    border-color: var(--type-color);
    background: color-mix(in srgb, var(--type-color) 12%, transparent);
  }

  .segment.selected::before {
    opacity: 1;
  }

  .segment.selected i {
    color: var(--type-color);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .type-selector {
      transition: none;
    }
  }
</style>
