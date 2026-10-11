<script lang="ts">
  /**
   * Visual harness for the live "Compose your catalog" screen. The route owns
   * only representative data and viewport controls; production ConfigureStep
   * remains the single presentation owner.
   */
  import { onMount } from "svelte";
  import ConfigureStep from "#lib/features/choreo-card/components/deck-releaser/ConfigureStep.svelte";
  import { runDeckReleaserTransition } from "#lib/features/choreo-card/components/deck-releaser/deck-releaser-motion.js";
  import { createDeckReleaserState } from "#lib/features/choreo-card/components/deck-releaser/state/deck-releaser-state.svelte.js";
  import { setDeckReleaserContext } from "#lib/features/choreo-card/components/deck-releaser/context/deck-releaser-context.js";
  import {
    initializeTkaTheme,
    applyThemeForBackground,
    applyTkaPropColors,
  } from "#lib/shared/theme/config/tka-theme-config.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { getTnDTurnPatternOptions } from "#lib/features/choreo-card/services/deck-composer.js";
  import type {
    StartOriMode,
    VariationConfig,
  } from "#lib/features/choreo-card/services/deck-variation.js";
  import type { ResolvedReversalPattern } from "#lib/features/choreo-card/domain/reversal-transform.js";
  import type { TnDFamilyOption } from "#lib/features/choreo-card/services/deck-composer.js";

  const deckState = createDeckReleaserState({
    storage: null,
    getLeftPropType: () => null,
    getRightPropType: () => null,
    mintSeed: () => "configure-preview",
    nextReferenceNumber: () => 1,
  });
  setDeckReleaserContext({ state: deckState });

  const FAMILY_DEFS = [
    { id: "split-same", label: "Split-Same", count: 21 },
    { id: "tog-same", label: "Tog-Same", count: 21 },
    { id: "quarter-same", label: "Quarter-Same", count: 28 },
    { id: "split-opp", label: "Split-Opp", count: 21 },
    { id: "tog-opp", label: "Tog-Opp", count: 21 },
    { id: "quarter-opp", label: "Quarter-Opp", count: 21 },
  ];

  const tndFamilies: TnDFamilyOption[] = FAMILY_DEFS.map((f) => ({
    familyId: f.id,
    label: f.label,
    sequenceCount: f.count,
    entries: Array.from({ length: f.count }, (_, i) => ({
      sequenceId: `${f.id}-${i}`,
      sourceCatalogId: "mock",
      turnRatio: "1:1",
      turnPattern: "0|0",
      gridMode: "diamond" as const,
    })),
  }));

  const tndTurnPatterns = getTnDTurnPatternOptions(126);

  let deckMode = $state<"loop" | "tnd" | "gallery">("gallery");

  const modeOrder = { loop: 0, tnd: 1, gallery: 2 } as const;

  function changeMode(next: "loop" | "tnd" | "gallery") {
    if (next === deckMode) return;

    const direction =
      modeOrder[next] > modeOrder[deckMode] ? "forward" : "backward";
    runDeckReleaserTransition("source", direction, () => {
      deckMode = next;
      deckState.deckMode = next;
    });
  }

  // ── LOOP mock state ──
  let weights = $state([
    { stepCount: 16, weight: 40, available: 12612 },
    { stepCount: 12, weight: 20, available: 1252 },
    { stepCount: 8, weight: 25, available: 108 },
    { stepCount: 4, weight: 15, available: 10 },
  ]);
  deckState.totalCards = 54;
  deckState.notes = "Fire Drums 2026";
  const sources = [
    { sliceType: "halved" as const, catalogCount: 2, sequenceCount: 11972 },
    { sliceType: "quartered" as const, catalogCount: 4, sequenceCount: 19804 },
  ];
  let selectedSlices = $state<Set<"halved" | "quartered">>(
    new Set(["quartered"])
  );
  let variationConfig = $state<VariationConfig>({
    reversalFrequency: 0.4,
    enabledReversals: ["book", "long-book", "alternating"],
    turnFrequency: 0.5,
    enabledTurnPatterns: [
      "hold-1",
      "pulse-1",
      "trade-1",
      "half-trade",
      "wave-21",
    ],
  });
  let selectedTnDFamilies = $state<Set<string>>(new Set(["split-opp"]));
  let selectedTnDTurnPatterns = $state<Set<string>>(
    new Set(["0|0", "0.5|0.5", "1|1", "1.5|1.5", "2|2", "2.5|2.5", "3|3"])
  );
  let startOriModes = $state<Set<StartOriMode>>(new Set(["radial"]));
  let gridModes = $state<Set<"diamond" | "box">>(new Set(["diamond"]));
  let reversalPattern = $state<ResolvedReversalPattern | null>(null);

  const selectedTurnPatternCount = $derived(selectedTnDTurnPatterns.size);
  const familySeqSum = $derived(
    [...selectedTnDFamilies].reduce((sum, id) => {
      const fam = tndFamilies.find((f) => f.familyId === id);
      return sum + (fam ? fam.sequenceCount : 0);
    }, 0)
  );
  // Source pool = families × turn patterns (before the Transform panel multiplies).
  const sourceCount = $derived(familySeqSum * selectedTurnPatternCount);
  const tndCardCount = $derived(
    sourceCount * startOriModes.size * gridModes.size
  );

  function toggleIn<T>(set: Set<T>, v: T, allowEmpty = false): Set<T> {
    const next = new Set(set);
    if (next.has(v)) {
      if (!allowEmpty && next.size === 1) return next;
      next.delete(v);
    } else next.add(v);
    return next;
  }

  // ── Harness controls ──
  const WIDTHS = [
    { id: "app", label: "App pane (~1300)", px: 1300 },
    { id: "wide", label: "Wide (1560)", px: 1560 },
    { id: "medium", label: "Medium (1100)", px: 1100 },
    { id: "landscape", label: "Landscape (960)", px: 960 },
    { id: "narrow", label: "Narrow (820)", px: 820 },
    { id: "phone", label: "Phone (375)", px: 375 },
    { id: "full", label: "Full bleed", px: 0 },
  ] as const;
  let paneWidth = $state<number>(1300);

  // ── Theme preview ── apply the app's real theme palettes so the screen renders
  // under the user's chosen theme tokens (--theme-accent/-card-bg/-stroke/-text…)
  // exactly as it will in production, instead of harness-hardcoded colours.
  const THEMES = [
    { id: BackgroundType.COSMIC, label: "Cosmic" },
    { id: BackgroundType.OCEAN, label: "Ocean" },
    { id: BackgroundType.EMBER, label: "Ember" },
    { id: BackgroundType.FOREST, label: "Forest" },
    { id: BackgroundType.BLOSSOM, label: "Blossom" },
    { id: BackgroundType.VOID, label: "Void" },
  ] as const;
  let activeTheme = $state<BackgroundType>(BackgroundType.COSMIC);

  function selectTheme(bt: BackgroundType) {
    activeTheme = bt;
    applyThemeForBackground(bt);
  }

  onMount(() => {
    initializeTkaTheme(); // registers palettes (must run before applyThemeForBackground)
    applyTkaPropColors(); // domain-constant --prop-blue/--prop-red
    applyThemeForBackground(activeTheme);
  });
</script>

<div class="harness">
  <div class="bar">
    <div class="group">
      <span class="bar-label">Theme</span>
      {#each THEMES as t (t.id)}
        <button
          type="button"
          class="chip"
          class:active={activeTheme === t.id}
          onclick={() => selectTheme(t.id)}
        >
          {t.label}
        </button>
      {/each}
    </div>
    <div class="group">
      <span class="bar-label">Width</span>
      {#each WIDTHS as w (w.id)}
        <button
          type="button"
          class="chip"
          class:active={paneWidth === w.px}
          onclick={() => (paneWidth = w.px)}
        >
          {w.label}
        </button>
      {/each}
    </div>
    <div class="group">
      <span class="bar-label">Mode</span>
      {#each [{ id: "loop", label: "LOOP" }, { id: "tnd", label: "TnD" }, { id: "gallery", label: "Gallery" }] as const as m (m.id)}
        <button
          type="button"
          class="chip"
          class:active={deckMode === m.id}
          onclick={() => changeMode(m.id)}
        >
          {m.label}
        </button>
      {/each}
    </div>
  </div>

  <div
    class="pane"
    style={paneWidth ? `width: ${paneWidth}px;` : "width: 100%;"}
  >
    <ConfigureStep
      {deckMode}
      galleryPreviewSource="community"
      notes={deckState.notes}
      onModeChange={changeMode}
      onNotesChange={(n) => (deckState.notes = n)}
      {tndFamilies}
      {selectedTnDFamilies}
      onTnDFamilyToggle={(id) =>
        (selectedTnDFamilies = toggleIn(selectedTnDFamilies, id, true))}
      onSelectAllFamilies={() =>
        (selectedTnDFamilies = new Set(tndFamilies.map((f) => f.familyId)))}
      onClearFamilies={() => (selectedTnDFamilies = new Set())}
      {selectedTurnPatternCount}
      {tndCardCount}
      {tndTurnPatterns}
      {selectedTnDTurnPatterns}
      onTnDTurnPatternToggle={(tp) =>
        (selectedTnDTurnPatterns = toggleIn(selectedTnDTurnPatterns, tp, true))}
      onTnDTurnPatternsSet={(s) => (selectedTnDTurnPatterns = s)}
      {startOriModes}
      onToggleStartOriMode={(m) => (startOriModes = toggleIn(startOriModes, m))}
      {gridModes}
      onToggleGridMode={(m) => (gridModes = toggleIn(gridModes, m))}
      {reversalPattern}
      onReversalChange={(p) => (reversalPattern = p)}
      onDraw={() => {}}
      {weights}
      totalCards={deckState.totalCards}
      sourceSummaries={sources}
      selectedSliceTypes={selectedSlices}
      {variationConfig}
      onTotalCardsChange={(n) => (deckState.totalCards = n)}
      onSliceTypeToggle={(s) => (selectedSlices = toggleIn(selectedSlices, s))}
      onWeightChange={(stepCount, weight) =>
        (weights = weights.map((w) =>
          w.stepCount === stepCount ? { ...w, weight } : w
        ))}
      onVariationConfigChange={(c) => (variationConfig = c)}
      isLoading={false}
    />
  </div>
</div>

<style>
  .harness {
    min-height: 100vh;
    background: radial-gradient(circle at 30% 20%, #141a2e, #0a0d18 70%);
    color: var(--theme-text, #fff);
    /* Theme colour tokens (--theme-accent / -card-bg / -stroke / -text …) and
       prop colours are applied to :root by the real theme system on mount, so
       they are intentionally NOT set here — that lets the chosen palette cascade
       in (a harness-scoped value would out-specify :root and block the theme).
       Only tokens the theme package doesn't emit + design constants stay. */
    --theme-text-muted: rgba(255, 255, 255, 0.55);
    --theme-text-on-accent: #fff;
    --min-touch-target: 44px;
    --duration-fast: 150ms;
    --duration-normal: 220ms;
    --font-size-compact: 12px;
    --font-size-min: 14px;
    --font-size-sm: 14px;
    --z-dropdown: 50;
  }

  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    width: 100%;
    padding: 12px 24px;
    box-sizing: border-box;
    background: rgba(10, 13, 24, 0.85);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .group {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
  }

  .bar-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.45);
  }

  .chip {
    min-height: var(--min-touch-target, 44px);
    padding: 6px 12px;
    box-sizing: border-box;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .chip.active {
    background: var(--theme-accent, #8b5cf6);
    border-color: var(--theme-accent, #8b5cf6);
    color: #fff;
  }

  .pane {
    margin: 0 auto;
    max-width: 100%;
    border-inline: 1px dashed rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 520px) {
    .bar {
      position: static;
      gap: 12px;
      padding: 10px 12px;
    }

    .group {
      flex-wrap: wrap;
      width: 100%;
    }

    .bar-label {
      flex: 0 0 100%;
    }
  }

  @media (min-width: 2600px) {
    .harness {
      --font-size-compact: 14px;
      --font-size-min: 16px;
      --font-size-sm: 16px;
      --min-touch-target: 52px;
    }
  }
</style>
