<!--
  MotionTypePills.svelte - Renders a family label as color-coded abbreviated pills.
  e.g. "Dual-Shift+Static+Dash" → [DS] › [St] › [D]

  Used in: CatalogFamilySection headers, CatalogBrowser section headers,
  FamilyFilterChip dropdown, picker cards.
-->
<script lang="ts">
  import { parseFamilyLabel } from '../domain/motion-type-pills';

  interface Props {
    label: string;
    /** Optional: font size for pills (default 12px) */
    fontSize?: string;
  }

  let { label, fontSize = '12px' }: Props = $props();

  const parts = $derived(parseFamilyLabel(label));
</script>

<span class="pill-row" style="--pill-font-size: {fontSize}">
  {#each parts as part, i}
    {#if i > 0}
      <span class="arrow" aria-hidden="true">›</span>
    {/if}
    <span
      class="motion-pill"
      class:dual={part.isDual}
      style="--c1: {part.colors[0]}; --c2: {part.colors[1]}"
      title={part.full}
      data-abbrev={part.abbrev}
    >{part.abbrev}</span>
  {/each}
</span>

<style>
  .pill-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .motion-pill {
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: var(--pill-font-size, 12px);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--c1);
    background: color-mix(in srgb, var(--c1) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--c1) 30%, transparent);
    white-space: nowrap;
    line-height: 1.4;
  }

  .motion-pill.dual {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--c1) 18%, transparent),
      color-mix(in srgb, var(--c2) 18%, transparent)
    );
    border-color: color-mix(in srgb, var(--c1) 30%, color-mix(in srgb, var(--c2) 30%, transparent));
    position: relative;
    color: transparent;
  }

  .motion-pill.dual::after {
    content: attr(data-abbrev);
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: inherit;
    letter-spacing: inherit;
    background: linear-gradient(90deg, var(--c1), var(--c2));
    -webkit-text-fill-color: transparent;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .motion-pill.dual::after {
    -webkit-background-clip: text;
    background-clip: text;
  }

  .arrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }
</style>
