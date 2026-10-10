<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { TURN_VALUES } from "#lib/features/choreo-card/domain/turn-pattern-parser.js";
  import { ratioLabel } from "#lib/shared/shape-matrix/domain/flower-signature.js";
  import type { AxisFilter, MatrixFilters } from "#lib/shared/shape-matrix/domain/filter-flower-axis.js";
  import type { TurnValue } from "#lib/shared/create/services/level-turn-values.js";
  import {
    HandSide,
    type HandSide as HandSideValue,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  interface Props {
    filters: MatrixFilters;
    onchange: (f: MatrixFilters) => void;
  }
  let { filters, onchange }: Props = $props();

  const STYLE_OPTS = [
    { value: "all" as const, label: "All" },
    { value: "pro" as const, label: "Pro" },
    { value: "anti" as const, label: "Anti" },
  ];
  const ORI_OPTS = [
    { value: "all" as const, label: "All" },
    { value: "in" as const, label: "In" },
    { value: "out" as const, label: "Out" },
  ];
  const GRID_OPTS = [
    { value: "all" as const, label: "All" },
    { value: "diamond" as const, label: "◇" },
    { value: "box" as const, label: "□" },
  ];


  function setAxis(which: HandSideValue, patch: Partial<AxisFilter>) {
    onchange({ ...filters, [which]: { ...filters[which], ...patch } });
  }
  function toggleTurn(which: HandSideValue, t: TurnValue) {
    const turns = new Set(filters[which].turns);
    if (turns.has(t)) turns.delete(t);
    else turns.add(t);
    setAxis(which, { turns });
  }
</script>

{#snippet axisRow(which: HandSideValue, color: "blue" | "red")}
  {@const f = filters[which]}
  <div class="group" class:blue={color === "blue"} class:red={color === "red"} role="group" aria-label={`${which} flower filters`}>
    <span class="axis">{which}</span>
    <div class="seg s-style">
      <SegmentedControl options={STYLE_OPTS} value={f.style} {color} onchange={(v) => setAxis(which, { style: v })} />
    </div>
    <div class="turns" role="group" aria-label={`${which} VTG ratios`}>
      {#each TURN_VALUES as t (t)}
        <button
          type="button"
          class="t"
          class:on={f.turns.has(t)}
          aria-pressed={f.turns.has(t)}
          aria-label={`${which} ${ratioLabel(t)} ratio`}
          onclick={() => toggleTurn(which, t)}>{ratioLabel(t)}</button>
      {/each}
    </div>
    <div class="seg s-ori">
      <SegmentedControl options={ORI_OPTS} value={f.ori} {color} onchange={(v) => setAxis(which, { ori: v })} />
    </div>
    <div class="seg s-grid" title="Anchor: ◇ diamond (cardinal) · □ box (45° rotated)">
      <SegmentedControl options={GRID_OPTS} value={f.grid} {color} onchange={(v) => setAxis(which, { grid: v })} />
    </div>
  </div>
{/snippet}

<div class="filters">
  <div class="inner">
    {@render axisRow(HandSide.LEFT, "blue")}
    {@render axisRow(HandSide.RIGHT, "red")}
    <button
      type="button"
      class="collapse"
      class:on={filters.collapse}
      role="switch"
      aria-checked={filters.collapse}
      onclick={() => onchange({ ...filters, collapse: !filters.collapse })}>
      <span class="dot" class:on={filters.collapse} aria-hidden="true"></span>
      Collapse duplicate orientations
    </button>
  </div>
</div>

<style>
  .filters {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.018);
  }
  .inner {
    margin: 0 auto;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px 22px;
    padding: 10px 20px;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: nowrap;
    /* unselected segment label → AAA contrast (default token is ~5:1) */
    --theme-text-dim: rgba(255, 255, 255, 0.74);
  }
  /* Local accents drive both the turn chips AND the SegmentedControl selection
     pill (--prop-blue/red are not defined globally, which is why selection read
     as all-black). Selected segment text is dark for AAA contrast on the pill. */
  .group.blue {
    --accent: #22d3ee;
    --accent-soft: rgba(34, 211, 238, 0.2);
    --prop-blue: #22d3ee;
    --theme-text-on-accent: #06222a;
  }
  .group.red {
    --accent: #fb8a8a;
    --accent-soft: rgba(251, 138, 138, 0.2);
    --prop-red: #fb8a8a;
    --theme-text-on-accent: #2a0707;
  }
  .axis {
    width: 42px;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent);
  }

  /* SegmentedControl is width:100% internally — constrain it */
  .seg.s-style {
    width: 188px;
  }
  .seg.s-ori {
    width: 156px;
  }
  .seg.s-grid {
    width: 132px;
  }

  .turns {
    display: flex;
    gap: 6px;
  }
  .t {
    /* AAA touch target: 44×44 minimum */
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0 12px;
    border-radius: 12px;
    border: 1.5px solid rgba(255, 255, 255, 0.4); /* ≥3:1 non-text contrast (SC 1.4.11) */
    background: transparent;
    color: rgba(255, 255, 255, 0.82); /* ~10:1 on dark → AAA */
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition:
      background var(--duration-fast, 0.12s) ease,
      border-color var(--duration-fast, 0.12s) ease,
      color var(--duration-fast, 0.12s) ease;
  }
  .t:hover {
    border-color: rgba(255, 255, 255, 0.55);
  }
  .t.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: #fff;
  }
  .t:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  .collapse {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: var(--min-touch-target, 44px);
    padding: 0 14px;
    border-radius: 12px;
    border: 1.5px solid rgba(255, 255, 255, 0.4); /* ≥3:1 non-text contrast */
    background: transparent;
    color: rgba(255, 255, 255, 0.82);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 0.12s) ease,
      color var(--duration-fast, 0.12s) ease;
  }
  .collapse .dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.32);
    transition: background var(--duration-fast, 0.12s) ease;
  }
  .collapse.on {
    border-color: rgba(52, 211, 153, 0.8);
    color: #d7f5e7;
  }
  .collapse .dot.on {
    background: #34d399;
    border-color: #34d399;
  }
  .collapse:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .t,
    .collapse,
    .collapse .dot {
      transition: none;
    }
  }
</style>
