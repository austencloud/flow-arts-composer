<script lang="ts">
  /**
   * LoopComposeBoard — the de-overwhelmed LOOP board for "Compose Your Catalog".
   *
   * Surfaces only high-level choices; precision folds behind an opt-in disclosure:
   *   Left   — Source catalogs · quiet Deck Size · live "This Deck" recipe
   *   Center — Deck Shape: Step Count + Turn Variation single-tap rows, with a
   *            "Customize mix & turns" disclosure for the weight sliders, turn
   *            density, and turn-pattern toggles.
   *   Right  — shared Transform rail (Orientations · Grid · Reversal), identical
   *            to the TnD board; the Reversal spin grid stays folded by default.
   *
   * Real primitives only (SegmentedControl, AxisCardGroup, FilterChipBase,
   * CollapsibleLabSection, TransformPanel). Color is reserved for the elemental
   * families — every control here is mono accent.
   *
   * Design: docs/superpowers/specs/active/2026-05-30-loop-composer-deoverwhelm-design.md
   */
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import AxisCardGroup from "./AxisCardGroup.svelte";
  import TransformPanel from "./TransformPanel.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import CollapsibleLabSection from "#lib/shared/components/lab/CollapsibleLabSection.svelte";
  import { TURN_PATTERNS, type VariationConfig, type StartOriMode } from "../../services/deck-variation";
  import { loopDrawCounts } from "../../services/deck-composer";
  import type { ResolvedReversalPattern } from "../../domain/reversal-transform";
  import type { StepCountWeight } from "../../domain/models/DeckRelease";
  import type { CatalogSourceSummary } from "../../services/deck-composer";

  interface Props {
    weights: StepCountWeight[];
    totalCards: number;
    sourceSummaries: CatalogSourceSummary[];
    selectedSliceTypes: Set<"halved" | "quartered">;
    variationConfig: VariationConfig;
    startOriModes: Set<StartOriMode>;
    gridModes: Set<"diamond" | "box">;
    reversalPattern?: ResolvedReversalPattern | null;
    onWeightChange: (stepCount: number, weight: number) => void;
    onTotalCardsChange: (total: number) => void;
    onSliceTypeToggle: (sliceType: "halved" | "quartered") => void;
    onVariationConfigChange: (config: VariationConfig) => void;
    onToggleStartOriMode: (mode: StartOriMode) => void;
    onToggleGridMode: (mode: "diamond" | "box") => void;
    onReversalChange?: (pattern: ResolvedReversalPattern) => void;
  }

  let {
    weights,
    totalCards,
    sourceSummaries,
    selectedSliceTypes,
    variationConfig,
    startOriModes,
    gridModes,
    reversalPattern = null,
    onWeightChange,
    onTotalCardsChange,
    onSliceTypeToggle,
    onVariationConfigChange,
    onToggleStartOriMode,
    onToggleGridMode,
    onReversalChange,
  }: Props = $props();

  // Step-count distribution presets. The row is the source of truth in the
  // resting view; the Customize sliders are an advanced override that may
  // diverge from the chosen preset.
  const STEP_PRESETS: Record<string, Record<number, number>> = {
    beginner: { 16: 10, 12: 20, 8: 30, 4: 40 },
    balanced: { 16: 25, 12: 25, 8: 25, 4: 25 },
    advanced: { 16: 40, 12: 30, 8: 20, 4: 10 },
  };
  const TURN_PRESETS: Record<string, number> = { clean: 0, sprinkle: 0.4, spicy: 0.7 };

  let stepPreset = $state<string>("balanced");
  let turnPreset = $state<string>("sprinkle");

  function selectStep(id: string) {
    stepPreset = id;
    const preset = STEP_PRESETS[id]!;
    for (const w of weights) {
      const target = preset[w.stepCount];
      if (target !== undefined) onWeightChange(w.stepCount, target);
    }
  }
  function selectTurn(id: string) {
    turnPreset = id;
    onVariationConfigChange({ ...variationConfig, turnFrequency: TURN_PRESETS[id]! });
  }

  // Deck Size is the FINAL target; orientation + grid axes duplicate each base
  // card, so the true output equals the target (when it divides by the axis
  // multiplier) or the nearest reachable size. Drives the recipe + per-step ~cards
  // so what's shown matches what Draw emits.
  const effectiveTotal = $derived(
    loopDrawCounts(totalCards, startOriModes.size, gridModes.size).effective
  );

  const totalWeight = $derived(weights.reduce((s, w) => s + w.weight, 0));
  function pct(w: StepCountWeight): number {
    return totalWeight > 0 ? Math.round((w.weight / totalWeight) * 100) : 0;
  }
  function cardCount(w: StepCountWeight): number {
    return totalWeight > 0 ? Math.round((effectiveTotal * w.weight) / totalWeight) : 0;
  }

  const sourceOptions = $derived(
    sourceSummaries.map((s) => ({
      id: s.sliceType,
      label: s.sliceType === "halved" ? "Halved" : "Quartered",
      icon: s.sliceType === "halved" ? "fa-circle-half-stroke" : "fa-table-cells-large",
      sub: `${s.catalogCount} catalogs`,
    })),
  );

  // ── Live deck recipe — plain-English readout of what Draw will produce ──
  const ORI_LABEL: Record<string, string> = { radial: "Radial", nonradial: "Nonradial", split: "Mixed" };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const recipe = $derived([
    { k: "Cards", v: `${effectiveTotal}` },
    { k: "Source", v: [...selectedSliceTypes].map(cap).join(" + ") || "—" },
    { k: "Step Count", v: cap(stepPreset) },
    { k: "Turns", v: cap(turnPreset) },
    { k: "Orientation", v: [...startOriModes].map((m) => ORI_LABEL[m] ?? m).join(" · ") || "—" },
    { k: "Grid", v: [...gridModes].map(cap).join(" · ") || "—" },
    { k: "Reversal", v: reversalPattern?.label ?? "Continuous" },
  ]);

  const turnFreqPct = $derived(Math.round(variationConfig.turnFrequency * 100));
  function setTurnFreq(v: number) {
    onVariationConfigChange({ ...variationConfig, turnFrequency: v / 100 });
  }
  function toggleTurn(id: string) {
    const next = new Set(variationConfig.enabledTurnPatterns);
    if (next.has(id)) next.delete(id); else next.add(id);
    onVariationConfigChange({ ...variationConfig, enabledTurnPatterns: [...next] });
  }
</script>

<div class="loop-board">
  <!-- Left: where cards come from + how many + the live recipe -->
  <div class="col col-source">
    <section class="block">
      <span class="area-label">Source</span>
      <AxisCardGroup
        label="Source Catalogs"
        options={sourceOptions}
        selected={selectedSliceTypes as Set<string>}
        onToggle={(id) => onSliceTypeToggle(id as "halved" | "quartered")}
      />
    </section>
    <section class="block">
      <span class="sub-label">Deck Size</span>
      <SegmentedControl
        options={[
          { value: "26", label: "26" },
          { value: "36", label: "36" },
          { value: "52", label: "52" },
        ]}
        value={String(totalCards)}
        onchange={(v) => onTotalCardsChange(parseInt(v))}
        color="accent"
        size="sm"
      />
    </section>

    <section class="recipe">
      <span class="recipe-title">This Deck</span>
      <dl class="recipe-list">
        {#each recipe as r (r.k)}
          <div class="recipe-row">
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
          </div>
        {/each}
      </dl>
    </section>
  </div>

  <!-- Center: the two shape decisions; precision folded away -->
  <div class="col col-shape">
    <section class="block">
      <span class="area-label">Deck Shape</span>
      <div class="choice">
        <span class="sub-label">Step Count</span>
        <SegmentedControl
          options={[
            { value: "beginner", label: "Beginner" },
            { value: "balanced", label: "Balanced" },
            { value: "advanced", label: "Advanced" },
          ]}
          value={stepPreset}
          onchange={selectStep}
          color="accent"
          size="sm"
        />
      </div>
      <div class="choice">
        <span class="sub-label">Turn Variation</span>
        <SegmentedControl
          options={[
            { value: "clean", label: "Clean" },
            { value: "sprinkle", label: "Sprinkle" },
            { value: "spicy", label: "Spicy" },
          ]}
          value={turnPreset}
          onchange={selectTurn}
          color="accent"
          size="sm"
        />
      </div>
    </section>

    <CollapsibleLabSection title="Customize mix & turns" icon="fa-sliders" accentColor="purple" defaultOpen>
      <div class="customize">
        <div class="cz-group">
          <span class="sub-label">Step-length weighting</span>
          <div class="sliders">
            {#each weights as w (w.stepCount)}
              <div class="slider-row">
                <span class="slider-name">{w.stepCount}-step</span>
                <input
                  type="range" min="0" max="100" value={w.weight} class="slider"
                  aria-label="{w.stepCount}-step weight"
                  oninput={(e) => onWeightChange(w.stepCount, parseInt((e.target as HTMLInputElement).value))}
                />
                <span class="slider-pct">{pct(w)}%</span>
                <span class="slider-count">~{cardCount(w)}</span>
                <span class="slider-pool">{w.available.toLocaleString()}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="cz-group">
          <span class="sub-label">Turn density</span>
          <div class="slider-row freq">
            <span class="slider-name">Turns</span>
            <input
              type="range" min="0" max="100" value={turnFreqPct} class="slider"
              aria-label="Turn frequency"
              oninput={(e) => setTurnFreq(parseInt((e.target as HTMLInputElement).value))}
            />
            <span class="slider-pct">{turnFreqPct}%</span>
          </div>
          <div class="turn-chips">
            {#each TURN_PATTERNS as t (t.id)}
              <FilterChipBase
                label={t.label}
                mode="toggle"
                size="sm"
                active={variationConfig.enabledTurnPatterns.includes(t.id)}
                onclick={() => toggleTurn(t.id)}
              />
            {/each}
          </div>
        </div>
      </div>
    </CollapsibleLabSection>
  </div>

  <!-- Right: shared Transform rail (identical to TnD) -->
  <div class="col col-transform">
    <section class="block transform-block">
      <TransformPanel
        {startOriModes}
        {onToggleStartOriMode}
        {gridModes}
        {onToggleGridMode}
        {reversalPattern}
        onReversalChange={(p) => onReversalChange?.(p)}
        reversalCustomDefault={false}
      />
    </section>
  </div>
</div>

<style>
  /* Calmer than TnD's full bleed: capped + centered so the lighter control set
     reads as deliberate matting, not a void. Source | Shape | Transform. */
  .loop-board {
    display: grid;
    grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.1fr) minmax(300px, 0.95fr);
    gap: 28px;
    align-items: start;
    width: 100%;
    max-width: 1240px;
    margin-inline: auto;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-width: 0;
  }

  .col-transform {
    align-self: stretch;
  }
  .col-transform :global(.transform) {
    height: 100%;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .transform-block {
    height: 100%;
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .recipe {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
    padding: 16px 18px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
  }
  .recipe-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--theme-text, #fff);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .recipe-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin: 0;
  }
  .recipe-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .recipe-row dt {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }
  .recipe-row dd {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-text, #fff);
    text-align: right;
  }

  .area-label {
    display: block;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.07));
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .sub-label {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .customize {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .cz-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sliders {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* label | track | % | ~cards | pool — fixed numeric columns with tabular-nums
     so changing values never reflow the row (no-layout-shift). */
  .slider-row {
    display: grid;
    grid-template-columns: 60px 1fr 3ch 4ch 6ch;
    align-items: center;
    gap: 10px;
  }
  .slider-row.freq {
    grid-template-columns: 60px 1fr 3ch;
  }
  .slider-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }
  .slider {
    width: 100%;
    accent-color: var(--theme-accent, #8b5cf6);
  }
  .slider-pct {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-accent, #a78bfa);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .slider-count {
    font-size: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .slider-pool {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .turn-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Narrow pane: single column, rail drops below. */
  @container configure (max-width: 860px) {
    .loop-board {
      grid-template-columns: 1fr;
      max-width: none;
    }
  }
</style>
