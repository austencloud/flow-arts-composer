<script lang="ts">
  import { onMount } from "svelte";
  import { SIMPLE_PATTERNS } from "../domain/reversal-patterns";
  import { resolvePattern, type ResolvedReversalPattern } from "../domain/reversal-transform";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  interface Props {
    activePatternId: string | null;
    onPatternChange: (resolved: ResolvedReversalPattern) => void;
    /**
     * Preset-first mode: presets + a compact summary show by default; the 2×4
     * Left/right spin timeline stays folded behind a "Custom" toggle. Keeps the
     * builder's footprint to a couple of rows for the common preset case.
     */
    collapsible?: boolean;
    /**
     * Initial open state of the left/right spin timeline in collapsible mode.
     * Defaults to true (legacy: rail had vertical room). Pass false for a
     * preset-first resting view that folds the cryptic spin grid away.
     */
    startCustomOpen?: boolean;
  }
  const { activePatternId, onPatternChange, collapsible = false, startCustomOpen = true }: Props = $props();

  let showCustom = $state(startCustomOpen);
  const timelineOpen = $derived(!collapsible || showCustom);

  const STEPS = 4;
  let left = $state<boolean[]>([false, false, false, false]);
  let right = $state<boolean[]>([false, false, false, false]);

  const resolved = $derived(resolvePattern(left, right));

  function spinCW(hand: boolean[], step: number): boolean {
    let cw = true;
    for (let i = 0; i <= step; i++) if (hand[i]) cw = !cw;
    return cw;
  }

  function tile(sequence: string): { left: boolean[]; right: boolean[] } {
    const b: boolean[] = [], r: boolean[] = [];
    for (let i = 0; i < STEPS; i++) {
      const sym = sequence[i % sequence.length];
      b.push(sym === "P" || sym === "B");
      r.push(sym === "P" || sym === "R");
    }
    return { left: b, right: r };
  }

  function applyPreset(sequence: string) {
    const t = tile(sequence);
    left = t.left;
    right = t.right;
    emit();
  }

  function toggle(hand: "left" | "right", step: number) {
    if (hand === "left") left[step] = !left[step];
    else right[step] = !right[step];
    emit();
  }

  function emit() {
    onPatternChange(resolvePattern(left, right));
  }

  // Apply the default (continuous) filter on mount so the family view starts
  // scoped to continuous catalogs rather than every reversal variant combined.
  onMount(emit);

  function charClass(ch: string): string {
    if (ch === "P") return "pair";
    if (ch === "B") return "blue-only";
    if (ch === "R") return "red-only";
    return "none";
  }
</script>

<div class="reversal-strip" class:collapsible>
  <div class="preset-row" role="group" aria-label="Reversal presets">
    {#each SIMPLE_PATTERNS as p (p.id)}
      <FilterChipBase label={p.label} mode="toggle" active={resolved.id === p.id} onclick={() => applyPreset(p.sequence)} />
    {/each}
  </div>

  {#if timelineOpen}
    <div class="timeline">
      {#each [{ hand: "left", tone: "blue", arr: left, label: "Left" }, { hand: "right", tone: "red", arr: right, label: "Right" }] as row (row.hand)}
        <div class="row">
          <span class="row-label {row.tone}">{row.label}</span>
          {#each row.arr as active, step (step)}
            <button
              type="button"
              role="switch"
              aria-checked={active}
              aria-label="{row.label} reversal at step {step + 1}"
              class="cell {row.tone}"
              class:active
              onclick={() => toggle(row.hand as "left" | "right", step)}
            >
              <span class="arrow" class:ccw={!spinCW(row.arr, step)}>↻</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <div class="footer">
    <span class="pattern-string">
      {#each resolved.sequence.split("") as ch}
        <span class="pat {charClass(ch)}">{ch === "-" ? "—" : ch}</span>
      {/each}
    </span>
    <span class="badge" class:clean={resolved.isCleanLoop} class:broken={!resolved.isCleanLoop}>
      {resolved.isCleanLoop ? "Clean loop" : "Boundary discontinuity"}
    </span>
    <span class="label">{resolved.label}</span>
    {#if collapsible}
      <FilterChipBase
        label={showCustom ? "Hide custom" : "Custom"}
        icon={showCustom ? "fas fa-chevron-up" : "fas fa-sliders"}
        mode="toggle"
        active={showCustom}
        onclick={() => (showCustom = !showCustom)}
      />
    {/if}
  </div>
</div>

<style>
  .reversal-strip {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 18px 20px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    /* Cells below scale to THIS width (cqi) so the builder fits a slim modifier
       rail without overflowing or stranding gutters in a wide panel. */
    container-type: inline-size;
    box-sizing: border-box;
  }

  /* 3-up preset grid: six presets read as two even rows of three. */
  .preset-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    width: 100%;
  }
  .preset-row :global(.filter-chip) {
    width: 100%;
    justify-content: center;
  }

  .timeline { display: flex; flex-direction: column; gap: 6px; align-items: center; }
  .row { display: flex; align-items: center; gap: 6px; }

  .row-label { width: 42px; text-align: right; font-size: 12px; font-weight: 600; padding-right: 6px; }
  .row-label.blue { color: var(--prop-blue, #3498db); }
  .row-label.red { color: var(--prop-red, #e74c3c); }

  .cell {
    width: clamp(40px, 13cqi, 56px);
    height: clamp(40px, 12cqi, 52px);
    flex: 0 0 auto;
    border-radius: 8px;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .cell:hover { border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2)); }
  .cell.blue.active { background: rgba(52, 152, 219, 0.22); border-color: rgba(52, 152, 219, 0.6); color: #fff; }
  .cell.red.active { background: rgba(231, 76, 60, 0.22); border-color: rgba(231, 76, 60, 0.6); color: #fff; }
  .cell:focus-visible { outline: 2px solid var(--theme-accent, #6c8ee8); outline-offset: 2px; }

  .arrow { font-size: 20px; transition: transform 0.2s ease; display: inline-block; }
  .arrow.ccw { transform: scaleX(-1); }

  .footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; }

  /* Collapsible (Transform-rail) mode: drop the card chrome so it reads as a
     bare axis matching Registers / Grid, not a boxed leftover. */
  .reversal-strip.collapsible {
    padding: 0;
    gap: 10px;
    align-items: stretch;
    background: transparent;
    border: none;
  }

  .pattern-string { font-family: var(--font-mono, monospace); font-size: 16px; letter-spacing: 5px; display: inline-flex; }
  .pat { min-width: 16px; text-align: center; }
  .pat.pair { color: #c084fc; }
  .pat.blue-only { color: var(--prop-blue, #3498db); }
  .pat.red-only { color: var(--prop-red, #e74c3c); }
  .pat.none { color: var(--theme-text-dim, rgba(255, 255, 255, 0.3)); }

  .badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 12px; }
  .badge.clean { color: #4ade80; background: rgba(74, 222, 128, 0.15); }
  .badge.broken { color: #facc15; background: rgba(250, 204, 21, 0.15); }

  .label { font-size: 12px; color: var(--theme-text-dim, rgba(255, 255, 255, 0.5)); }

  @media (prefers-reduced-motion: reduce) {
    .preset-chip, .cell, .arrow { transition: none; }
  }
</style>
