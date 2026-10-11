<script lang="ts">
  /**
   * ModifierAxis — a labelled row of multi-select toggle chips for a small enum
   * axis (Start register, Grid mode). Uses the shared FilterChipBase so it speaks
   * the same chip language as every other control on the screen. Mono by default
   * (theme accent on selected): color is reserved for the elemental families.
   */
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import GridModeGlyph from "./GridModeGlyph.svelte";

  interface AxisOption {
    id: string;
    label: string;
    /** Font Awesome class, e.g. "fa-diamond". */
    icon: string;
    /** When "grid", the chip shows a live mini grid mark (id = diamond|box)
     *  instead of the Font Awesome icon. */
    glyph?: "grid";
  }

  interface Props {
    label: string;
    hint?: string;
    options: AxisOption[];
    selected: Set<string>;
    onToggle: (id: string) => void;
  }

  const { label, hint, options, selected, onToggle }: Props = $props();
</script>

<div class="axis">
  <div class="axis-head">
    <span class="axis-label">{label}</span>
    {#if hint}<span class="axis-hint">{hint}</span>{/if}
  </div>
  <div class="chips" role="group" aria-label={label}>
    {#each options as opt (opt.id)}
      {#snippet gridGlyph()}
        <GridModeGlyph mode={opt.id as "diamond" | "box"} />
      {/snippet}
      <FilterChipBase
        label={opt.label}
        icon={"fas " + opt.icon}
        iconSnippet={opt.glyph === "grid" ? gridGlyph : undefined}
        mode="toggle"
        active={selected.has(opt.id)}
        onclick={() => onToggle(opt.id)}
      />
    {/each}
  </div>
</div>

<style>
  .axis {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .axis-head {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .axis-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .axis-hint {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.38));
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
</style>
