<script lang="ts">
  import TurnMatrixGrid from "#lib/features/choreo-card/components/TurnMatrixGrid.svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import VariationPicker from "./VariationPicker.svelte";
  import {
    resolveRotationStyleMatrices,
    type RotationStyleMatrix,
    type StyleVariation,
    type LabGridMode,
    type StartOriPair,
  } from "../services/resolve-rotation-style-matrices";
  import { TURN_VALUES } from "#lib/features/choreo-card/domain/turn-pattern-parser.js";
  import { TND_TURNS_RATIO_MAP } from "#lib/features/choreo-card/domain/tnd-element.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { browser } from "$app/env";

  type PropKind = "staff" | "club";

  // Persist the four user-controlled settings across refresh + Vite HMR.
  const GRID_STORAGE_KEY = "vtg-lab-grid";
  const PROP_STORAGE_KEY = "vtg-lab-prop";
  const BLUE_ORI_STORAGE_KEY = "vtg-lab-blue-ori";
  const RED_ORI_STORAGE_KEY = "vtg-lab-red-ori";

  function readStored(key: string): string | null {
    return browser ? sessionStorage.getItem(key) : null;
  }

  function getInitialGrid(): LabGridMode {
    const v = readStored(GRID_STORAGE_KEY);
    return v === "diamond" || v === "box" ? v : "diamond";
  }
  function getInitialProp(): PropKind {
    const v = readStored(PROP_STORAGE_KEY);
    return v === "staff" || v === "club" ? v : "staff";
  }
  function getStoredOri(key: string): Orientation {
    const v = readStored(key);
    if (
      v === Orientation.IN ||
      v === Orientation.OUT ||
      v === Orientation.CLOCK ||
      v === Orientation.COUNTER
    ) {
      return v;
    }
    return Orientation.IN;
  }

  const initialProp = getInitialProp();
  // If the restored prop is a staff, collapse a persisted club orientation
  // (out/counter) back into the staff 2-option set so it stays selectable.
  const initialLeftOri =
    initialProp === "staff"
      ? radialize(getStoredOri(BLUE_ORI_STORAGE_KEY))
      : getStoredOri(BLUE_ORI_STORAGE_KEY);
  const initialRightOri =
    initialProp === "staff"
      ? radialize(getStoredOri(RED_ORI_STORAGE_KEY))
      : getStoredOri(RED_ORI_STORAGE_KEY);

  let matrices = $state<RotationStyleMatrix[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let grid = $state<LabGridMode>(getInitialGrid());
  let prop = $state<PropKind>(initialProp);

  // Open picker context (null = closed).
  let picker = $state<{
    variations: StyleVariation[];
    turnPattern: string;
    accent: string;
  } | null>(null);

  const gridOptions = [
    {
      value: "diamond" as LabGridMode,
      label: "Diamond",
      icon: "fas fa-diamond",
    },
    { value: "box" as LabGridMode, label: "Box", icon: "fas fa-square" },
  ];

  // Staff = two-ended prop (both tips); club = one-ended (single tip → half the
  // paths, so the busy high-turn mandalas read far less overwhelming).
  const propOptions = [
    { value: "staff" as PropKind, label: "Staff" },
    { value: "club" as PropKind, label: "Club" },
  ];
  const tipEnds = $derived(prop === "club" ? (1 as const) : (2 as const));

  // Independent per-hand start orientation — reshapes each hand's rosette.
  let leftOri = $state<Orientation>(initialLeftOri);
  let rightOri = $state<Orientation>(initialRightOri);

  // A two-ended staff is symmetric: in/out land the same tip union, as do
  // clock/counter — so it only distinguishes Radial vs Nonradial. A one-ended
  // club resolves all four. Options follow the selected prop.
  const oriOptions = $derived(
    prop === "staff"
      ? [
          { value: Orientation.IN, label: "Radial" },
          { value: Orientation.CLOCK, label: "Nonradial" },
        ]
      : [
          { value: Orientation.IN, label: "In" },
          { value: Orientation.OUT, label: "Out" },
          { value: Orientation.CLOCK, label: "Clock" },
          { value: Orientation.COUNTER, label: "Counter" },
        ]
  );

  /** Collapse a club orientation to its staff representative (in/out→Radial, clock/counter→Nonradial). */
  function radialize(o: Orientation): Orientation {
    if (o === Orientation.OUT) return Orientation.IN;
    if (o === Orientation.COUNTER) return Orientation.CLOCK;
    return o;
  }

  function setProp(v: PropKind): void {
    prop = v;
    if (v === "staff") {
      // Keep the pickers' value inside the 2-option staff set.
      leftOri = radialize(leftOri);
      rightOri = radialize(rightOri);
    }
  }

  const startOri: StartOriPair = $derived({ left: leftOri, right: rightOri });

  // VTG ratio per turn value (1:1 … 7:1) — the axis numbering for this lab.
  const vtgRatios = TURN_VALUES.map((t) => TND_TURNS_RATIO_MAP[t] ?? String(t));

  function setGrid(next: LabGridMode): void {
    if (next === grid) return;
    picker = null; // stale variations belong to the previous grid
    grid = next;
  }

  // Re-resolve when grid or start orientation changes; family/dedup follow the
  // active grid, each hand's rosette follows its orientation.
  $effect(() => {
    const g = grid;
    const ori = startOri;
    loading = true;
    error = null;
    resolveRotationStyleMatrices(g, ori)
      .then((res) => {
        if (g === grid && ori === startOri) matrices = res;
      })
      .catch((e) => {
        if (g === grid && ori === startOri)
          error = e instanceof Error ? e.message : "Failed to load";
      })
      .finally(() => {
        if (g === grid && ori === startOri) loading = false;
      });
  });

  // Persist the four settings whenever any of them change.
  $effect(() => {
    if (!browser) return;
    sessionStorage.setItem(GRID_STORAGE_KEY, grid);
    sessionStorage.setItem(PROP_STORAGE_KEY, prop);
    sessionStorage.setItem(BLUE_ORI_STORAGE_KEY, leftOri);
    sessionStorage.setItem(RED_ORI_STORAGE_KEY, rightOri);
  });

  function turnKey(left, right): string {
    const f = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    return `${f(left)}|${f(right)}`;
  }
</script>

<div class="explorer">
  <div class="topbar">
    <p class="intro">
      Each cell shows the <strong>archetype</strong> rosette for a prop-spin and turn
      count. Every letter in a panel shares that rosette; they differ only in how
      the two hands phase together (VTG mode — timing and direction). Pick a cell
      to drill into those letters.
    </p>
    <div class="controls">
      <div class="ctl">
        <span class="ctl-label">Grid</span>
        <SegmentedControl
          options={gridOptions}
          value={grid}
          onchange={setGrid}
          color="accent"
          size="sm"
        />
      </div>
      <div class="ctl">
        <span class="ctl-label">Prop</span>
        <SegmentedControl
          options={propOptions}
          value={prop}
          onchange={setProp}
          color="accent"
          size="sm"
        />
      </div>
      <div class="ctl ctl-wide">
        <span class="ctl-label">Left start</span>
        <SegmentedControl
          options={oriOptions}
          value={leftOri}
          onchange={(v) => (leftOri = v)}
          color="blue"
          size="sm"
        />
      </div>
      <div class="ctl ctl-wide">
        <span class="ctl-label">Right start</span>
        <SegmentedControl
          options={oriOptions}
          value={rightOri}
          onchange={(v) => (rightOri = v)}
          color="red"
          size="sm"
        />
      </div>
    </div>
  </div>

  {#if loading}
    <div class="status" role="status">Loading sequences…</div>
  {:else if error}
    <div class="status err" role="alert">
      <i class="fas fa-triangle-exclamation"></i>
      {error}
    </div>
  {:else}
    <div class="axis-key" aria-hidden="true">
      <span class="ak blue"><i class="fas fa-arrow-down"></i> Left (VTG)</span>
      <span class="scale">{vtgRatios.join(" · ")}</span>
      <span class="ak red">Right (VTG) <i class="fas fa-arrow-right"></i></span>
    </div>
    <div class="panels">
      {#each matrices as m (m.style)}
        <section class="panel" style="--accent: {m.accent};">
          <h3><span class="dot"></span>{m.label}</h3>
          <TurnMatrixGrid ariaLabel="{m.label} turn matrix" showAxes={false}>
            {#snippet cell(left, right)}
              {@const seq = m.byTurn.get(turnKey(left, right))}
              {#if seq}
                <button
                  type="button"
                  class="cell"
                  class:diag={left === right}
                  style="--bloom: {(left + right) / 6};"
                  aria-label="{m.label} left {left} right {right} — pick a letter"
                  onclick={() =>
                    (picker = {
                      variations: m.variations,
                      turnPattern: turnKey(left, right),
                      accent: m.accent,
                    })}
                >
                  <SequenceMandala
                    sequence={seq}
                    mode="gallery"
                    show="both"
                    size={120}
                    {tipEnds}
                    darkMode
                  />
                </button>
              {:else}
                <div
                  class="empty"
                  aria-label="No sequence for {left}|{right}"
                ></div>
              {/if}
            {/snippet}
          </TurnMatrixGrid>
        </section>
      {/each}
    </div>
  {/if}
</div>

{#if picker}
  <VariationPicker
    variations={picker.variations}
    turnPattern={picker.turnPattern}
    accent={picker.accent}
    {grid}
    {startOri}
    onClose={() => (picker = null)}
  />
{/if}

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .topbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
    padding-bottom: 0.85rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .intro {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, #9fb2bd);
    max-width: 56ch;
  }
  .intro strong {
    color: var(--theme-text, #fff);
  }
  .controls {
    display: flex;
    gap: 0.85rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .ctl {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 150px;
  }
  .ctl-wide {
    min-width: 220px;
  }
  .ctl-label {
    font-size: var(--font-size-compact, 11px);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--theme-text-secondary, #7e93a0);
  }
  .status {
    padding: 2rem;
    text-align: center;
    color: var(--theme-text-secondary, #888);
    font-size: var(--font-size-min, 14px);
  }
  .status.err {
    color: var(--semantic-warning, #fbbf24);
  }

  .axis-key {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
  }
  .ak {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: 600;
  }
  .ak.blue {
    color: #60a5fa;
  }
  .ak.red {
    color: #f87171;
  }
  .scale {
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
    letter-spacing: 0.04em;
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.25rem;
    align-items: start;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
    padding: 0.9rem;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid
      color-mix(in srgb, var(--accent) 32%, rgba(255, 255, 255, 0.08));
    box-shadow: 0 2px 24px color-mix(in srgb, var(--accent) 12%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .panel h3 {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--theme-text, #fff);
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 70%, transparent);
    flex-shrink: 0;
  }

  .cell {
    width: 100%;
    aspect-ratio: 1;
    padding: 2px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: clamp(4px, 1cqi, 8px);
    transition:
      transform 0.12s ease,
      background 0.12s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cell :global(svg) {
    width: 100%;
    height: 100%;
    filter: drop-shadow(
      0 0 calc(var(--bloom, 0) * 7px)
        color-mix(
          in srgb,
          var(--accent) calc(var(--bloom, 0) * 55%),
          transparent
        )
    );
  }
  .cell.diag {
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent) 20%, transparent),
      transparent 70%
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .cell:hover {
    transform: scale(1.1);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .cell:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
  }
  .empty {
    width: 100%;
    aspect-ratio: 1;
    border-radius: clamp(4px, 1cqi, 8px);
    background: rgba(255, 255, 255, 0.012);
  }
</style>
