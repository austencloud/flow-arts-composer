<!--
  V7 "Brand-forward" - Choreo Cards branding as the hero, flexible content slots.

  Designed for physical printed cards. Fills its parent container and
  scales proportionally using container query units (cqi).

  Layout: four absolute corners + centered content.
    Top-left:     Turn glyph (fixed box) + label
    Top-right:    Reversal glyph (fixed box) + label
    Top-center:   Brand text
    Center:       Mandala + designation pills
    Bottom-left:  Label + start placement pictograph
    Bottom-right: Label + step count
    Bottom-center: URL

  Corner glyphs sit in fixed-size boxes so their labels stay at the same
  pixel position across all card variations.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import DifficultyBadge from "$lib/shared/components/DifficultyBadge.svelte";
  import CardBackDecorations from "./CardBackDecorations.svelte";
  import { deriveCardBackData } from "./card-back-data";
  import { getCardBackThemeVisuals } from "./card-back-theme-visuals";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import StartPlacementPictograph from "./StartPlacementPictograph.svelte";
  import { ensureStepPlacement } from "$lib/shared/pictograph/shared/services/motion-placement";
  import TurnPatternGlyph from "./TurnPatternGlyph.svelte";
  import ReversalPatternGlyph from "./ReversalPatternGlyph.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import MotionTypePills from "../MotionTypePills.svelte";
  import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import CheckerboardCircleIcon from "$lib/shared/icons/CheckerboardCircleIcon.svelte";
  import type { CardBackThemeVisuals } from "./card-back-theme-visuals";
  import {
    getReflectionIconTransform,
    type LOOPComponentId,
    type LoopReflectionAxis,
  } from "@tka/render-composition";
  interface Props {
    sequence: SequenceData;
    themeOverride?: { visuals: CardBackThemeVisuals; name: string };
    showTnDDesignation?: boolean;
    /**
     * Opt-in live layer over the printed mandala (the shop hero's animated
     * back). The snippet renders inside a positioned box that IS the printed
     * mandala's box — same centre, same side — so a child absolutely centred
     * in it is concentric with the printed figure by construction.
     * `--card-mandala-size` carries that side length for a consumer that needs
     * to size an engine square from it.
     * Supplying the snippet also ghosts the printed mandala underneath, which
     * is what lets a drawn trail read against it. Print and raster paths never
     * pass this.
     */
    mandalaOverlay?: Snippet;
    /**
     * Called with the printed mandala's box (and null on teardown). The one
     * hook a live overlay needs: the printed figure is the alignment target,
     * and its on-screen box is the only honest way to find it — the card's
     * size comes from a container query, so it is not knowable up front.
     */
    onMandalaBox?: (el: HTMLDivElement | null) => void;
    /**
     * Prop the card is printed with. A card is printed with ONE prop pair and
     * the mandala is that prop's tip locus, so a surface depicting a specific
     * printed card passes the prop the bake used. Omitted, the card follows the
     * viewer's own prop settings — right for an in-app preview of the viewer's
     * sequence, wrong for a storefront showing a physical product.
     */
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    primaryPropColorsOverride?: { left: string; right: string } | null;
  }
  let {
    sequence,
    themeOverride,
    showTnDDesignation = false,
    mandalaOverlay,
    onMandalaBox,
    leftPropTypeOverride,
    rightPropTypeOverride,
    primaryPropColorsOverride,
  }: Props = $props();

  let mandalaAnchorEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    onMandalaBox?.(mandalaAnchorEl);
    return () => onMandalaBox?.(null);
  });

  const d = $derived(deriveCardBackData(sequence));

  /**
   * The bottom-left start placement, with its render-required placement data
   * guaranteed present.
   *
   * `MotionData.propPlacementData` is non-optional in the type and absent in
   * practice: a sequence read straight out of the catalog (or any stored blob)
   * carries a `startPlacement` serialized before those fields existed, and
   * PictographPreparer.calculateProps early-returns on a missing one. The cell
   * then draws its grid with no props on it, and the only trace is a console
   * warning naming this exact backfill. The print path never showed the bug
   * because renderBack goes through `hydrateSequence`, which re-runs the
   * motions through `createMotionData` first — this makes the LIVE card agree
   * with the print instead of depending on who hydrated the caller's data.
   *
   * Fixed here rather than at one call site because CardBack is the boundary
   * where the data reaches a renderer, and motion-placement.ts exists because
   * this backfill drifted once already by living in two hydrators.
   */
  const startPlacement = $derived(
    sequence.startPlacement ? ensureStepPlacement(sequence.startPlacement) : undefined
  );
  const loopDisplay = $derived.by(() => resolveLoopDisplay(sequence));

  // Single-ended prop (club) traces one tip; staff traces both. The mandala
  // must match the card's prop, else a club card shows the double-staff locus.
  // SequenceMandala derives the tip count from these prop types itself.
  const leftPropType = $derived(
    leftPropTypeOverride ?? settingsService.settings.leftPropType
  );
  const rightPropType = $derived(
    rightPropTypeOverride ?? settingsService.settings.rightPropType
  );

  const theme = $derived(themeOverride?.visuals ?? getCardBackThemeVisuals(settingsService.settings.backgroundType));
  const themeName = $derived(themeOverride?.name ?? settingsService.settings.backgroundType ?? "cosmic");
  const brandStyle = $derived(theme.brandStyle ?? "uppercase-sans");
  const ornamentType = $derived(theme.ornamentType ?? "diamond");
  const borderWidth = $derived(theme.borderWidth ?? 2);
  const brandGlow = $derived(theme.brandGlow ?? "drop-shadow(0 0 3cqi rgba(255, 255, 255, 0.1))");
  const decorationOpacity = $derived(theme.decorationOpacity ?? 1);
  const textColor = $derived(theme.textColor ?? "#ffffff");
  const textMutedColor = $derived(theme.textMutedColor ?? "rgba(255,255,255,0.75)");
  const isDarkTheme = $derived(!theme.textColor || theme.textColor === "#ffffff");

  const LOOP_DISPLAY_ORDER: LOOPComponent[] = [
    LOOPComponent.ROTATED, LOOPComponent.MIRRORED, LOOPComponent.FLIPPED,
    LOOPComponent.SWAPPED, LOOPComponent.INVERTED, LOOPComponent.REWOUND,
  ];
  const LOOP_ICONS: Record<string, { fa: string; color: string; label: string }> = {
    [LOOPComponent.ROTATED]:  { fa: "fas fa-rotate",     color: "#36c3ff", label: "Rotated" },
    [LOOPComponent.MIRRORED]: { fa: "fas fa-left-right",  color: "#6F2DA8", label: "Mirrored" },
    [LOOPComponent.FLIPPED]:  { fa: "fas fa-up-down",     color: "#6F2DA8", label: "Flipped" },
    [LOOPComponent.SWAPPED]:  { fa: "fas fa-shuffle",     color: "#26e600", label: "Swapped" },
    [LOOPComponent.INVERTED]: { fa: "fas fa-adjust",      color: "#eb7d00", label: "Inverted" },
    [LOOPComponent.REWOUND]:  { fa: "fas fa-backward",    color: "#00bcd4", label: "Rewound" },
  };
  const REFLECTION_LABELS: Record<LoopReflectionAxis, string> = {
    "north-south": "Mirrored",
    "east-west": "Flipped",
    "northeast-southwest": "NE-SW Reflection",
    "northwest-southeast": "NW-SE Reflection",
  };
  const activeLoopList = $derived(
    LOOP_DISPLAY_ORDER.filter(c => loopDisplay.components.has(c))
  );
</script>

<div class="border-frame" style="background: {theme.borderGradient}; padding: {borderWidth}cqi;">
  <div class="back" style="background: {theme.background}; --card-text: {textColor}; --card-text-muted: {textMutedColor};">
    {#if decorationOpacity > 0}
      <div style="opacity: {decorationOpacity};">
        <CardBackDecorations theme={themeName} />
      </div>
    {/if}

    <!-- TOP CENTER: brand -->
    <div class="brand-slot">
      <span
        class="brand-main"
        class:italic-serif={brandStyle === "italic-serif"}
        class:uppercase-sans={brandStyle === "uppercase-sans"}
        class:small-caps={brandStyle === "small-caps"}
        style="background: {theme.brandGradient}; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: {brandGlow};"
      >The Kinetic Alphabet</span>
      <div class="brand-ornament">
        {#if ornamentType === "diamond"}
          <span class="ornament-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 20%, {theme.ornamentLineColor} 80%, transparent);"></span>
          <span class="ornament-diamond" style="background: linear-gradient(135deg, {theme.ornamentColor}, {theme.ornamentLineColor}, {theme.ornamentColor});"></span>
          <span class="ornament-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 20%, {theme.ornamentLineColor} 80%, transparent);"></span>
        {:else if ornamentType === "triple-dot"}
          <span class="ornament-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 20%, {theme.ornamentLineColor} 80%, transparent);"></span>
          <span class="ornament-dot" style="background: {theme.ornamentColor};"></span>
          <span class="ornament-dot" style="background: {theme.ornamentColor};"></span>
          <span class="ornament-dot" style="background: {theme.ornamentColor};"></span>
          <span class="ornament-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 20%, {theme.ornamentLineColor} 80%, transparent);"></span>
        {:else if ornamentType === "star"}
          <span class="ornament-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 20%, {theme.ornamentLineColor} 80%, transparent);"></span>
          <span class="ornament-star" style="color: {theme.ornamentColor};">✦</span>
          <span class="ornament-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 20%, {theme.ornamentLineColor} 80%, transparent);"></span>
        {:else if ornamentType === "double-line"}
          <span class="ornament-line double" style="border-color: {theme.ornamentLineColor};"></span>
        {:else if ornamentType === "none"}
          <!-- no ornament -->
        {/if}
      </div>
      <span
        class="brand-sub"
        class:uppercase-sans-sub={brandStyle === "uppercase-sans"}
        class:small-caps-sub={brandStyle === "small-caps"}
        style="background: {theme.brandSubGradient}; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;"
      >Choreo Cards</span>
    </div>

    <!-- TOP-LEFT: turn glyph in fixed box -->
    <div class="corner top-left">
      <div class="glyph-box">
        <TurnPatternGlyph entries={d.turnGlyphEntries} />
      </div>
    </div>

    <!-- TOP-RIGHT: reversal glyph in fixed box -->
    <div class="corner top-right">
      <div class="glyph-box">
        <ReversalPatternGlyph sequence={d.reversalSequence} period={d.reversalPeriod} />
      </div>
    </div>

    <!-- CENTER: mandala -->
    <div class="content">
      <div class="mandala-zone" class:ghosted={!!mandalaOverlay}>
        <div class="mandala-anchor" bind:this={mandalaAnchorEl}>
          <SequenceMandala
            {sequence}
            mode="card-back"
            style="stroke"
            show="both"
            size={380}
            darkMode={isDarkTheme}
            pathShape="arc"
            {leftPropType}
            {rightPropType}
            primaryPropColors={primaryPropColorsOverride}
          />
        </div>
      </div>
      {#if mandalaOverlay}
        <div class="mandala-overlay">
          <div class="mandala-overlay-box">{@render mandalaOverlay()}</div>
        </div>
      {/if}
    </div>

    <!-- LOOP ROW: between mandala and bottom elements -->
    {#if activeLoopList.length > 0}
      <div class="loop-row">
        {#each activeLoopList as comp}
          {@const icon = LOOP_ICONS[comp]!}
          {@const reflection = getReflectionIconTransform(
            comp as LOOPComponentId,
            loopDisplay.reflectionAxis
          )}
          {@const isQuarteredRot = comp === LOOPComponent.ROTATED}
          {@const isQuarteredInv = comp === LOOPComponent.INVERTED && loopDisplay.inversionPeriod === Period.QUARTERED}
          <div class="loop-col">
            <span class="loop-icon-cell" style="overflow: hidden; width: 9cqi; height: 9cqi;">
              {#if isQuarteredInv}
                <CheckerboardCircleIcon size="8cqi" color={icon.color} />
              {:else}
                <i
                  class={reflection
                    ? "fas fa-left-right"
                    : isQuarteredRot
                      ? "fas fa-arrows-spin"
                      : icon.fa}
                  style="font-size: 8cqi; color: {icon.color}; line-height: 1; display: block;{reflection
                    ? ` transform: rotate(${reflection.rotationDegrees}deg) scale(${reflection.scale});`
                    : ''}"
                  aria-hidden="true"
                ></i>
              {/if}
            </span>
            <span class="loop-col-label">{reflection
                ? REFLECTION_LABELS[reflection.axis]
                : icon.label}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- BOTTOM-LEFT: start placement pictograph -->
    <div class="corner bottom-left">
      {#if startPlacement}
        <StartPlacementPictograph pictographData={startPlacement} darkMode={isDarkTheme} {leftPropType} {rightPropType} primaryPropColors={primaryPropColorsOverride} />
      {/if}
    </div>

    <!-- BOTTOM-RIGHT: step count -->
    <div class="corner bottom-right">
      <span class="corner-label">{d.stepCount}</span>
    </div>

    <!-- LEVEL BADGE: above the URL ornament -->
    <div class="level-badge-slot">
      <DifficultyBadge level={d.level.number} size="7cqi" fontSize="4.2cqi" />
    </div>

    <!-- BOTTOM CENTER: URL -->
    <div class="url-slot">
      <div class="url-ornament">
        <span class="url-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 30%, {theme.ornamentLineColor} 70%, transparent);"></span>
        <span class="url-diamond" style="background: linear-gradient(135deg, {theme.ornamentColor}, {theme.ornamentLineColor}, {theme.ornamentColor});"></span>
        <span class="url-line" style="background: linear-gradient(90deg, transparent, {theme.ornamentLineColor} 30%, {theme.ornamentLineColor} 70%, transparent);"></span>
      </div>
      <span class="brand-url">tkaflowarts.com</span>
      <span class="brand-year">© {new Date().getFullYear()}</span>
    </div>
  </div>
</div>

<style>
  .border-frame {
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-sizing: border-box;
    overflow: hidden;
    container-type: inline-size;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .back {
    position: relative;
    width: 100%;
    height: 100%;
    color: var(--card-text, #ffffff);
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    overflow: hidden;
    border-radius: 0;
    box-sizing: border-box;
  }

  /* ═══════ BRAND (top center, truly centered) ═══════ */

  .brand-slot {
    position: absolute;
    top: 3.2cqi;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.8cqi;
    z-index: 2;
    pointer-events: none;
  }

  .brand-main {
    font-size: 4.4cqi;
    font-weight: 300;
    letter-spacing: 0.22em;
    font-style: italic;
    font-family: Georgia, "Times New Roman", serif;
    white-space: nowrap;
  }

  .brand-main.italic-serif {
    font-style: italic;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 300;
    letter-spacing: 0.22em;
  }

  .brand-main.uppercase-sans {
    font-style: normal;
    font-family: Didot, "Bodoni MT", "Playfair Display", Georgia, serif;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 4.2cqi;
  }

  .brand-main.small-caps {
    font-style: normal;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400;
    letter-spacing: 0.3em;
    font-variant: small-caps;
    font-size: 4cqi;
  }

  .brand-ornament {
    display: flex;
    align-items: center;
    gap: 1.2cqi;
    width: 60%;
    justify-content: center;
  }

  .ornament-line {
    flex: 1;
    max-width: 16cqi;
    height: 0.3cqi;
  }

  .ornament-line.double {
    max-width: 32cqi;
    height: 0;
    border-top: 0.25cqi solid;
    border-bottom: 0.25cqi solid;
    padding-top: 0.5cqi;
    background: none;
  }

  .ornament-diamond {
    width: 2cqi;
    height: 2cqi;
    transform: rotate(45deg);
    flex-shrink: 0;
  }

  .ornament-dot {
    width: 1.2cqi;
    height: 1.2cqi;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ornament-star {
    font-size: 2.6cqi;
    line-height: 1;
    flex-shrink: 0;
  }

  .brand-sub {
    font-size: 3.2cqi;
    font-weight: 500;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .brand-sub.uppercase-sans-sub {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    font-weight: 400;
    letter-spacing: 0.35em;
    font-size: 3.2cqi;
  }

  .brand-sub.small-caps-sub {
    font-variant: small-caps;
    letter-spacing: 0.35em;
    text-transform: none;
  }

  /* ═══════ URL (bottom center) ═══════ */

  .url-slot {
    position: absolute;
    bottom: 2.8cqi;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6cqi;
    z-index: 2;
    pointer-events: none;
  }

  .url-ornament {
    display: flex;
    align-items: center;
    gap: 0.8cqi;
    width: 36%;
    justify-content: center;
  }

  .url-line {
    flex: 1;
    max-width: 10cqi;
    height: 0.5cqi;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .url-diamond {
    width: 1.6cqi;
    height: 1.6cqi;
    transform: rotate(45deg);
    flex-shrink: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .brand-url {
    font-size: 3cqi;
    color: var(--card-text-muted, rgba(255, 255, 255, 0.7));
    letter-spacing: 0.12em;
    font-weight: 400;
  }

  .brand-year {
    font-size: 2.2cqi;
    color: var(--card-text-muted, rgba(255, 255, 255, 0.7));
    letter-spacing: 0.1em;
    font-weight: 300;
  }

  /* ═══════ CORNERS (absolute, fixed position) ═══════ */

  .corner {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4cqi;
    z-index: 2;
  }

  .top-left     { top: 3.2cqi;    left: 3.2cqi; }
  .top-right    { top: 3.2cqi;    right: 3.2cqi; }
  .bottom-left  { bottom: 2cqi; left: 3.2cqi; gap: 1.2cqi; }
  .bottom-right { bottom: 2cqi; right: 3.2cqi; gap: 1.2cqi; justify-content: flex-end; }

  /* Fixed-size box for glyphs — bars/dots sit inside, bottom-aligned.
     Height accommodates max 3 turns (5.4cqi) or reversal dots.
     Ensures label below is always at the same Y position. */
  .glyph-box {
    width: 10cqi;
    height: 6cqi;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    filter: drop-shadow(0 0.5cqi 1cqi rgba(0, 0, 0, 0.1));
  }

  .corner-sublabel {
    font-size: 3cqi;
    font-weight: 600;
    color: var(--card-text-muted, rgba(255, 255, 255, 0.75));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    line-height: 1;
  }

  .corner-label {
    font-size: 9cqi;
    font-weight: 700;
    color: var(--card-text-muted, rgba(255, 255, 255, 0.9));
    line-height: 1;
    filter: drop-shadow(0 0.5cqi 1cqi rgba(0, 0, 0, 0.08));
  }

  /* ═══════ CENTER CONTENT ═══════ */

  .loop-row {
    position: absolute;
    bottom: 28cqi;
    left: 3cqi;
    right: 3cqi;
    display: flex;
    justify-content: center;
    gap: 6cqi;
    z-index: 2;
  }

  .content {
    position: absolute;
    inset: 10cqi 3.2cqi 30cqi;
    z-index: 1;
    overflow: hidden;
    /* Named so an opt-in overlay can derive its own square from the printed
       mandala's side instead of hardcoding this number a second time. */
    --card-mandala-size: 72cqi;
  }

  .level-badge-slot {
    position: absolute;
    bottom: 18cqi;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 2;
    pointer-events: none;
    filter: drop-shadow(0 0.5cqi 2cqi rgba(0, 0, 0, 0.15));
  }

  .mandala-zone {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Ghosted under a live overlay so the drawn trail reads against the printed
     figure instead of fighting it (the ShapeMatrixDrill value). */
  .mandala-zone.ghosted {
    opacity: 0.55;
  }

  /* Deliberately the SAME two-element shape as .mandala-zone/.mandala-anchor
     below, with the same centring and the same box rules, so the overlay box
     is congruent with the printed mandala by construction rather than by two
     sets of numbers agreeing.

     Two things it must not be. Not `inset: 0` with grid centring: a child
     larger than its grid container gets an auto track its own width and is
     placed at that track's start, which put the oversized engine square down
     and right of the mandala instead of around it. And not centred by
     `translate`, because transforms are invisible to offsetLeft/offsetTop —
     a consumer measuring its own alignment would read the box's untranslated
     position and correct for a shift that had already happened. Flex centring
     is layout, so it reads true. */
  .mandala-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1;
  }

  .mandala-overlay-box {
    position: relative;
    width: var(--card-mandala-size, 72cqi);
    max-height: 100%;
    aspect-ratio: 1;
  }

  .mandala-anchor {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--card-mandala-size, 72cqi);
    max-height: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }

  .mandala-anchor :global(.mandala-container) {
    width: 100% !important;
    height: 100% !important;
  }

  .loop-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6cqi;
    filter: drop-shadow(0 0.5cqi 1.5cqi rgba(0, 0, 0, 0.12));
  }

  .loop-icon-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 9cqi;
    height: 9cqi;
    overflow: hidden;
  }

  .loop-icon-cell i {
    filter: none;
  }

  .loop-col-label {
    font-size: 2.2cqi;
    color: var(--card-text-muted, rgba(255, 255, 255, 0.7));
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 500;
  }

  .deck-designation {
    margin: 0;
    font-size: 3cqi;
    color: var(--card-text-muted, rgba(255, 255, 255, 0.8));
    line-height: 1.4;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: center;
  }

  .deck-designation.pills {
    display: flex;
    justify-content: center;
    text-transform: none;
  }

  .deck-designation.tnd {
    color: var(--card-text-muted, rgba(255, 255, 255, 0.7));
    font-size: 3cqi;
  }

  /* ═══════ CHILD COMPONENT OVERRIDES ═══════ */

  .bottom-left :global(.start-placement-picto) {
    width: 12cqi !important;
    height: 12cqi !important;
    filter: drop-shadow(0 0.5cqi 1.5cqi rgba(0, 0, 0, 0.12));
  }

  .bottom-left :global(.start-placement-picto svg) {
    width: 100% !important;
    height: 100% !important;
  }

  @media print {
    .border-frame,
    .back,
    .brand-main,
    .brand-sub {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
