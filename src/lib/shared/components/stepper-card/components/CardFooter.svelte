<!--
CardFooter.svelte - Footer section with subtitle and description
-->
<script lang="ts">
  let { subtitle = "", description = "" } = $props<{
    subtitle?: string;
    description?: string;
  }>();
</script>

<div class="card-footer">
  {#if subtitle}
    <div class="card-subtitle">{subtitle}</div>
  {/if}
  {#if description}
    <div class="card-description">{description}</div>
  {/if}
</div>

<style>
  /* Portrait mode: Footer - absolutely positioned at bottom */
  .card-footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(2px, 0.5cqh, 4px);
    z-index: 3;
    pointer-events: none;
  }

  /* Portrait mode: Subtitle and description */
  .card-subtitle {
    font-size: var(--card-subtitle-size, clamp(10px, 2.5cqh, 14px));
    font-weight: 500;
    color: color-mix(in srgb, var(--text-color) 85%, transparent);
    text-align: center;
    text-transform: lowercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    flex-shrink: 0;
    transition: color var(--duration-dramatic) var(--ease-standard);
  }

  .card-description {
    font-size: var(--card-description-size, clamp(8px, 2cqh, 11px));
    font-weight: 500;
    color: color-mix(in srgb, var(--text-color) 75%, transparent);
    text-align: center;
    letter-spacing: var(--card-description-letter-spacing, 0.3px);
    text-transform: var(--card-description-transform, uppercase);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    flex-shrink: 0;
    transition: color var(--duration-dramatic) var(--ease-standard);
  }
</style>
