<!--
SectionHeader.svelte - Header for option picker sections

Single responsibility: Display section header with colored letter type label.
Uses LetterTypeTextPainter for consistent text formatting.

Styling: Uses CSS cascade from parent OptionPickerContent via custom properties:
  --option-header-bg, --option-header-border, --option-header-shadow, --option-header-text
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { formatSectionTitle } from "../../services/section-title-formatter";

  const { letterType = "mixed" } = $props<{
    letterType?: string;
  }>();

  const buttonText = $derived(
    formatSectionTitle(letterType, (descriptor) => t(descriptor.translationKey))
  );
</script>

<div class="section-header">
  <div class="header-layout">
    <div class="stretch"></div>
    <div class="type-label">
      <span class="label-text">
        {@html buttonText}
      </span>
    </div>
    <div class="stretch"></div>
  </div>
</div>

<style>
  .section-header {
    width: 100%;
  }

  /* On a very short option-picker area (iPhone SE: ~275px tall), the type
     heading's ~41px pushes the 4th pictograph row under the bottom nav. Drop
     the heading entirely so the grid reclaims the space — the type is still
     conveyed by each tile's letter label. Queries the nearest size container,
     .option-picker-content. Taller phones (~420px+) keep the heading. */
  @container (max-height: 340px) {
    .section-header {
      display: none;
    }
  }

  .header-layout {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
    margin-top: 8px;
    width: 100%;
  }

  .stretch {
    flex: 1;
  }

  .type-label {
    /* Use CSS variables from parent container - auto-updates with dark mode */
    background: var(--option-header-bg, rgba(255, 255, 255, 0.9));
    border: 1px solid var(--option-header-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    padding: 6px 6px;
    font-weight: 600;
    font-size: var(--font-size-base);
    min-width: 160px;
    text-align: center;
    box-shadow: 0 2px 8px var(--option-header-shadow, rgba(0, 0, 0, 0.1));
    /* Transitions sync with parent dark mode toggle */
    transition:
      background var(--option-dark-transition, var(--duration-fast) ease-out),
      border-color var(--option-dark-transition, var(--duration-fast) ease-out),
      box-shadow var(--option-dark-transition, var(--duration-fast) ease-out);
  }

  /* Responsive sizing */
  @media (max-height: 800px) {
    .type-label {
      font-size: var(--font-size-sm);
      padding: 4px 4px;
      min-width: 140px;
    }
  }

  @media (max-height: 700px) {
    .type-label {
      font-size: var(--font-size-compact);
      padding: 3px 3px;
      min-width: 120px;
    }
  }

  @media (max-height: 600px) {
    .type-label {
      font-size: var(--font-size-compact);
      padding: 2px 2px;
      min-width: 100px;
    }
  }

  .label-text {
    display: block;
    color: var(--option-header-text, #000000);
    transition: color
      var(--option-dark-transition, var(--duration-fast) ease-out);
  }
</style>
