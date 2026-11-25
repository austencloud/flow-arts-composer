<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import TnDModeGrid from "#lib/features/choreo-card/components/TnDModeGrid.svelte";
  import {
    MODE_FAMILY_ID,
    MODE_ORDER,
    MODE_WORDS,
    type VtgMode,
  } from "@tka/shape-domain";
  import { TND_BY_FAMILY } from "#lib/features/choreo-card/domain/tnd-element.js";
  import { norm } from "#lib/shared/notation/qft/qft-model.js";
  import { getQftAppContext } from "../_context/qft-app-context";

  const state = getQftAppContext();

  const words = (mode: VtgMode) =>
    `${MODE_WORDS[mode].timing} ${MODE_WORDS[mode].direction}`;

  const stillHand = $derived(state.handRelations.some((mode) => mode === null));
  const changes = $derived(new Set(state.handRelations).size > 1);
  const heading = $derived(
    changes && !stillHand
      ? "Hand timing and direction at the start"
      : "Hand timing and direction"
  );

  const blockedModes = $derived(
    MODE_ORDER.filter((mode) => !state.validVtgModes.includes(mode))
  );
  const reasons = $derived(
    Object.fromEntries(
      blockedModes.map((mode) => [mode, "these hands cannot start this way"])
    )
  );

  /** Each stretch of steps the hands spend in one mode. */
  const runs = $derived.by(() => {
    const found: Array<{ mode: VtgMode; from: number; to: number }> = [];
    state.handRelations.forEach((mode, index) => {
      if (!mode) return;
      const last = found.at(-1);
      if (last?.mode === mode) last.to = index + 1;
      else found.push({ mode, from: index + 1, to: index + 1 });
    });
    return found;
  });

  const originOptions = $derived(
    Array.from({ length: 8 }, (_, phase) => ({
      value: String(phase),
      label: `Position ${norm(phase)}`,
      shortLabel: String(norm(phase)),
      disabled: !state.validOriginPhases.includes(phase),
    }))
  );
</script>

<section class="relationships" class:phone={state.phone}>
  {#if state.handCount === "two"}
    <div class="control-group">
      <span class="label">{heading}</span>
      <TnDModeGrid
        selected={stillHand ? null : state.vtgMode}
        disabled={stillHand}
        disabledModes={blockedModes}
        {reasons}
        fullLabels={!state.phone}
        size={state.compact ? "sm" : "md"}
        ariaLabel={heading}
        onpick={(mode) => state.setVtgMode(mode)}
      />
      {#if stillHand}
        <p class="note">
          One hand is still, so there is no hand timing or direction to set.
        </p>
      {:else if changes}
        <p class="note runs">
          <span>Changes:</span>
          {#each runs as { mode, from, to } (from)}
            <span class="run">
              {from === to ? `step ${from}` : `steps ${from}–${to}`}
              <img
                src={TND_BY_FAMILY[MODE_FAMILY_ID[mode]]?.iconPath}
                alt={words(mode)}
                title={words(mode)}
              />
            </span>
          {/each}
        </p>
      {/if}
    </div>
  {/if}

  <div class="control-group">
    <div class="start-head">
      <span class="label" id="qft-origin-label"
        >{state.handCount === "two"
          ? "Left hand starts at"
          : "Hand starts at"}</span
      >
      {#if state.validOriginPhases.length < 8}
        <span class="note">A pendulum's hand stays low</span>
      {/if}
    </div>
    <SegmentedControl
      options={originOptions}
      value={String(state.originPhase)}
      onchange={(phase: string) => state.setOriginPhase(Number(phase))}
      size={state.phone ? "phone" : "sm"}
      ariaLabelledby="qft-origin-label"
      semantics="radiogroup"
      color="accent"
    />
  </div>
</section>

<style>
  .relationships {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.8rem;
  }

  .control-group {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.4rem;
    min-width: 0;
  }

  .label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .start-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0 0.75rem;
  }

  .runs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.75rem;
  }

  .run {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .run img {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
  }

  /* Same over Opposite, one column per timing: two short rows, so the whole
     tray fits a small phone without scrolling. */
  .phone :global(.mode-grid.sm) {
    grid-template-rows: repeat(2, auto);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-flow: column;
  }

  /* No room for the mark beside the words; the ring and fill say it. */
  .phone :global(.mode-grid.sm .choice-check) {
    display: none;
  }

  .phone.relationships {
    gap: 0.4rem;
  }

  .phone .run img {
    width: 1.25rem;
    height: 1.25rem;
  }

  .note {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }
</style>
