<!--
CardHeader.svelte - Shared card header component
Reusable header for all card types with consistent styling
-->
<script lang="ts">
  let { title, headerFontSize } = $props<{
    title: string;
    headerFontSize?: string;
  }>();
</script>

<div class="card-header-container">
  <div class="card-header">
    <div
      class="card-title"
      style={headerFontSize
        ? `font-size: ${headerFontSize}`
        : "font-size: var(--header-font-size, clamp(8px, 2.5cqi, 11px))"}
    >
      {title}
    </div>
  </div>
</div>

<style>
  .card-header-container {
    /* Enable container queries for intrinsic sizing */
    container-type: inline-size;
    container-name: card-header;
    width: 100%;
  }

  .card-header {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: clamp(0.125rem, 1cqi, 0.375rem);
    width: 100%;
    flex-shrink: 0;
    justify-content: center;
    padding: clamp(3px, 0.8cqh, 6px) clamp(6px, 1.5cqw, 10px);
  }

  .card-title {
    font-weight: 600;
    color: var(--text-color, var(--theme-text));
    text-align: center;
    letter-spacing: var(--card-title-letter-spacing, 0.2px);
    text-transform: var(--card-title-transform, uppercase);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    /* Container-aware font sizing - only applies if no inline style is set */
    font-size: clamp(8px, 2.5cqi, 11px);
    transition: color var(--duration-dramatic) var(--ease-standard);
  }

  /* Progressive enhancement for wider containers */
  @container card-header (min-width: 200px) {
    .card-title {
      font-size: clamp(9px, 2.8cqi, 12px);
    }
  }

  @container card-header (min-width: 300px) {
    .card-title {
      font-size: clamp(10px, 3cqi, 13px);
    }
  }
</style>
