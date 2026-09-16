<!--
StaffPlacementBadge - Badge showing Alpha/Beta/Gamma placement type
-->
<script lang="ts">
  import {
    PLACEMENT_COLORS,
    type PlacementType,
  } from "../../../../domain/constants/staff-visualizer-data";

  let { type }: { type: PlacementType } = $props();
</script>

<div class="placement-badge" style="--badge-color: {PLACEMENT_COLORS[type]}">
  <span class="badge-icon">
    {#if type === "alpha"}
      <i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i>
    {:else if type === "beta"}
      <i class="fa-solid fa-circle-dot" aria-hidden="true"></i>
    {:else}
      <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
    {/if}
  </span>
  <span class="badge-text">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
</div>

<style>
  .placement-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, var(--badge-color) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--badge-color) 40%, transparent);
    border-radius: 20px;
  }

  .badge-icon {
    color: var(--badge-color);
    font-size: 0.875rem;
  }

  .badge-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--badge-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
