<script lang="ts">
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import GridSvg from "#lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  type Mode = "diamond" | "box" | "merged";
  type ModeOption = { mode: Mode; label: string; ariaLabel: string };

  let {
    modes,
    initialMode,
    darkMode = false,
  }: {
    modes: ModeOption[];
    initialMode: Mode;
    darkMode?: boolean;
  } = $props();

  let selected = $state(initialMode);
  const selectedOption = $derived(
    modes.find((option) => option.mode === selected) ?? modes[0]
  );
  const options = $derived(
    modes.map((option) => ({
      value: option.mode,
      label: option.label,
      id: `grid-mode-${option.mode}`,
      controls: "guide-grid-mode-panel",
      tone: "accent" as const,
    }))
  );
</script>

<div class="grid-explorer" class:dark={darkMode}>
  <div class="mode-picker">
    <SegmentedControl
      {options}
      value={selected}
      onchange={(mode) => (selected = mode)}
      color="accent"
      size="sm"
      semantics="tabs"
      ariaLabel="Grid mode"
    />
  </div>

  <div
    class="grid-stage"
    id="guide-grid-mode-panel"
    role="tabpanel"
    aria-labelledby={`grid-mode-${selected}`}
  >
    <Crossfade key={selected} duration={DURATION.normal} fill>
      <figure>
        <svg
          viewBox="0 0 950 950"
          role="img"
          aria-label={selectedOption?.ariaLabel}
        >
          <desc>{selectedOption?.ariaLabel}</desc>
          <rect width="950" height="950" rx="18" />
          {#if selected === "merged"}
            <GridSvg gridMode={GridMode.DIAMOND} {darkMode} />
            <GridSvg gridMode={GridMode.BOX} {darkMode} />
          {:else}
            <GridSvg
              gridMode={selected === "box" ? GridMode.BOX : GridMode.DIAMOND}
              {darkMode}
            />
          {/if}
        </svg>
        <figcaption>{selectedOption?.label}</figcaption>
      </figure>
    </Crossfade>
  </div>
</div>

<style>
  .grid-explorer {
    width: min(100%, 34rem);
    margin-inline: auto;
    display: grid;
    gap: 0.65rem;
    --theme-card-bg: color-mix(in oklab, var(--ink, #1a1a1a) 6%, transparent);
    --theme-stroke: color-mix(in oklab, var(--ink, #1a1a1a) 18%, transparent);
    --theme-text: var(--ink, #1a1a1a);
    --theme-text-dim: var(--ink-dim, #555);
    --theme-accent: #647ff1;
    --segmented-selected-ink: var(--ink, #1a1a1a);
  }

  .mode-picker {
    width: min(100%, 28rem);
    margin-inline: auto;
  }

  .grid-stage {
    width: min(100%, 21rem);
    aspect-ratio: 1 / 1.08;
    margin-inline: auto;
    display: grid;
    align-items: start;
  }

  figure {
    width: 100%;
    margin: 0;
    display: grid;
    gap: 0.35rem;
    justify-items: center;
  }

  svg {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 17%, transparent);
    border-radius: 14px;
    background: #ffffff;
  }

  svg rect {
    fill: #ffffff;
  }

  .grid-explorer.dark svg {
    background: #0a0a0f;
  }

  .grid-explorer.dark svg rect {
    fill: #0a0a0f;
  }

  svg :global(line) {
    display: none;
  }

  figcaption {
    color: var(--ink-dim, #555);
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1rem;
    font-style: italic;
    font-weight: 500;
    line-height: 1.25;
  }

  @container (max-width: 30rem) {
    .grid-stage {
      width: min(100%, 18rem);
    }
  }
</style>
