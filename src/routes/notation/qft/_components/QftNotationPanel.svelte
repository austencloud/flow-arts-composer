<script lang="ts">
  import QftTable from "#lib/shared/notation/qft/components/QftTable.svelte";
  import { getQftAppContext } from "../_context/qft-app-context";

  const state = getQftAppContext();
</script>

<section
  class="notation"
  class:duet={state.handCount === "two"}
  aria-label="QfT notation"
>
  <div
    class="hand-table"
    data-tone={state.handCount === "one" ? "accent" : "blue"}
  >
    {#if state.handCount === "two"}<span class="hand-name">Left</span>{/if}
    <QftTable
      increments={state.leftIncrements}
      activeStep={state.step}
      compact={state.tableCompact}
    />
  </div>

  {#if state.handCount === "two" && state.rightIncrements}
    <div class="hand-table" data-tone="red">
      <span class="hand-name">Right</span>
      <QftTable
        increments={state.rightIncrements}
        activeStep={state.step}
        compact={state.tableCompact}
      />
    </div>
  {/if}
</section>

<style>
  .notation {
    display: grid;
    gap: 0.7rem;
    min-width: 0;
  }

  .notation.duet {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hand-table {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.6rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: var(--radius-2026-sm, 0.75rem);
    background: var(--theme-card-bg, rgb(0 0 0 / 0.2));
  }

  .hand-table[data-tone="blue"] {
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3575e2) 42%,
      transparent
    );
  }

  .hand-table[data-tone="red"] {
    border-color: color-mix(in srgb, var(--prop-red, #ed1c24) 42%, transparent);
  }

  .hand-table[data-tone="accent"] {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 42%,
      transparent
    );
  }

  .hand-name {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    color: var(--theme-text-dim);
  }

  @container (max-width: 30rem) {
    .notation.duet {
      grid-template-columns: 1fr;
    }
  }
</style>
