<!--
LandscapeCardFooter.svelte - Absolutely positioned subtitle and description for landscape cards
-->
<script lang="ts">
  let { subtitle = "", description = "" } = $props<{
    subtitle?: string;
    description?: string;
  }>();

  const hasDescription = $derived(description.length > 0);
</script>

{#if subtitle}
  <div class="card-subtitle" class:has-description={hasDescription}>
    {subtitle}
  </div>
{/if}

{#if description}
  <div class="card-description">
    {description}
  </div>
{/if}

<style>
  .card-subtitle {
    position: absolute;
    bottom: clamp(4px, 1cqh, 8px);
    left: clamp(4px, 1cqw, 8px);
    right: clamp(4px, 1cqw, 8px);

    font-size: clamp(9px, 2cqh, 12px);
    font-weight: 500;
    color: color-mix(in srgb, var(--text-color) 80%, transparent);
    text-align: center;
    text-transform: lowercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    transition: color var(--duration-dramatic) var(--ease-standard);
  }

  .card-subtitle.has-description {
    bottom: clamp(16px, 3.5cqh, 22px);
  }

  .card-description {
    position: absolute;
    bottom: clamp(4px, 1cqh, 8px);
    left: clamp(4px, 1cqw, 8px);
    right: clamp(4px, 1cqw, 8px);

    font-size: clamp(9px, 2.2cqh, 11px);
    font-weight: 500;
    color: color-mix(in srgb, var(--text-color) 75%, transparent);
    text-align: center;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    transition: color var(--duration-dramatic) var(--ease-standard);
  }

  @media (min-width: 1280px) {
    .card-description {
      font-size: clamp(11px, 1.8vh, 14px);
    }
  }
</style>
