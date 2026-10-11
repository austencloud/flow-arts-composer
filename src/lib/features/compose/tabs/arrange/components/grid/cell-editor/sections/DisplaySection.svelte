<!--
  DisplaySection.svelte

  Media type selector: two radio-style chips for Animation and Choreo Card.
  Choreo Card is disabled when layerCount > 1 (requires a single layer).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { CellMediaType } from "#lib/shared/animation-engine/domain/compose-types.js";

  let {
    currentMediaType,
    layerCount,
    onMediaTypeChange,
  }: {
    currentMediaType: CellMediaType;
    layerCount: number;
    onMediaTypeChange: (type: CellMediaType) => void;
  } = $props();

  const choreoDisabled = $derived(layerCount > 1);
</script>

<div class="display-section">
  <div
    class="chip-grid"
    role="radiogroup"
    aria-label={t("compose_ui_display_type")}
  >
    <button
      class="chip"
      class:active={currentMediaType === "animation"}
      role="radio"
      aria-checked={currentMediaType === "animation"}
      onclick={() => onMediaTypeChange("animation")}
    >
      <i class="fas fa-film" aria-hidden="true"></i>
      Animation
    </button>

    <button
      class="chip"
      class:active={currentMediaType === "choreo-card"}
      class:disabled={choreoDisabled}
      role="radio"
      aria-checked={currentMediaType === "choreo-card"}
      disabled={choreoDisabled}
      onclick={() => onMediaTypeChange("choreo-card")}
      title={choreoDisabled ? "Choreo Card requires a single layer" : ""}
    >
      <i class="fas fa-id-card" aria-hidden="true"></i>
      Choreo Card
    </button>
  </div>
</div>

<style>
  .display-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slideDown 180ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--chip-gap, 6px);
  }

  .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px clamp(12px, 3cqi, 14px);
    min-height: 44px;
    border-radius: var(--chip-radius, 22px);
    background: var(--surface-idle, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--stroke-idle, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .chip:hover:not(:disabled) {
    background: var(--surface-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  .chip.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #60a5fa) var(--surface-active-pct, 12%),
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #60a5fa) var(--stroke-active-pct, 35%),
      transparent
    );
    color: var(--theme-accent, #60a5fa);
  }

  .chip.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .display-section {
      animation: none;
    }

    .chip {
      transition: none;
    }
  }
</style>
