<!--
  CardHeader.svelte

  Renders the ChoreoCard header section: difficulty badge, word title,
  and LOOP icon strip. Extracted from ChoreoCard.svelte.
-->
<script lang="ts" module>
  /** Header show/hide duration. ChoreoCard's preview stack transitions its
   *  height on the same clock (see `data-header-motion` there), so the grid
   *  keeps its size while the header folds — the two must stay equal. */
  export const HEADER_MOTION_MS = 250;
</script>

<script lang="ts">
  import { fade, scale, slide } from "svelte/transition";
  import { TextRenderer } from "$lib/shared/render/services/text-renderer";
  import { cubicOut } from "svelte/easing";
  import DifficultyBadge from "$lib/shared/components/DifficultyBadge.svelte";
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import {
    calculateHeaderWordSideInset,
    LOOP_ICON_SIZE_SCALE,
    type LOOPComponentId,
    type LoopReflectionAxis,
  } from "@tka/render-composition";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";

  interface Props {
    sequence: { word?: string };
    showHeader: boolean;
    isBrowseSoloMode: boolean;
    soloHand: "left" | "right" | undefined;
    browseViewMode?: import("$lib/shared/browse/domain/browse-view-mode").BrowseViewMode;
    customTitleText?: string;
    showDifficultyLevel: boolean;
    difficultyLevel: number;
    currentLevelStyle: { bg: string; border: string; text: string };
    wordVisible: boolean;
    showLoopGlyph: boolean;
    loopComponents: Set<LOOPComponent> | null;
    loopRotationPeriod: Period | undefined;
    loopInversionPeriod: Period | undefined;
    loopReflectionAxis?: LoopReflectionAxis;
    loopOverlayComponents?: Set<LOOPComponent> | undefined;
    scaledHeaderHeight: number;
    badgeSize: number;
    badgePadding: number;
    badgeNumberFontSize: number;
    wordTitleFontSize: number;
    activeDarkMode: boolean;
    /** The downloaded artifact uses the canvas card palette exactly. */
    exportPresentation?: boolean;
  }

  const {
    sequence,
    showHeader,
    isBrowseSoloMode,
    soloHand,
    browseViewMode,
    customTitleText,
    showDifficultyLevel,
    difficultyLevel,
    currentLevelStyle,
    wordVisible,
    showLoopGlyph,
    loopComponents,
    loopRotationPeriod,
    loopInversionPeriod,
    loopReflectionAxis,
    loopOverlayComponents,
    scaledHeaderHeight,
    badgeSize,
    badgePadding,
    badgeNumberFontSize,
    wordTitleFontSize,
    activeDarkMode,
    exportPresentation = false,
  }: Props = $props();

  const wordSideInset = $derived.by(() => {
    const activeComponents = loopComponents
      ? new Set([...loopComponents] as unknown as LOOPComponentId[])
      : undefined;
    const overlayComponents = loopOverlayComponents
      ? new Set([...loopOverlayComponents] as unknown as LOOPComponentId[])
      : undefined;
    return calculateHeaderWordSideInset({
      headerHeight: scaledHeaderHeight,
      indicatorSizeScale:
        scaledHeaderHeight > 0 ? badgeSize / scaledHeaderHeight : undefined,
      showDifficultyBadge: showDifficultyLevel,
      loopComponents:
        showLoopGlyph && activeComponents?.size ? activeComponents : undefined,
      overlayComponents,
    });
  });
  const exportTextRenderer = new TextRenderer();
  let exportCanvas = $state<HTMLCanvasElement>();
  let exportCanvasWidth = $state(0);
  $effect(() => {
    const canvas = exportCanvas;
    if (!exportPresentation || !canvas || exportCanvasWidth < 1) return;
    const width = Math.round(exportCanvasWidth);
    const height = Math.round(scaledHeaderHeight);
    if (height < 1) return;
    const customTitle = customTitleText?.trim();
    const renderAsText = Boolean(customTitle) || !wordVisible;
    const snapshot = {
      word: wordVisible ? customTitle || sequence.word || "" : "",
      indicatorSizeScale: badgeSize / scaledHeaderHeight,
      difficultyLevel,
      showDifficultyBadge: showDifficultyLevel,
      loopComponents: showLoopGlyph ? (loopComponents ?? undefined) : undefined,
      rotationPeriod: loopRotationPeriod,
      inversionPeriod: loopInversionPeriod,
      reflectionAxis: loopReflectionAxis,
      overlayComponents: loopOverlayComponents,
      darkMode: activeDarkMode,
      renderAsText,
    };
    let cancelled = false;
    void (async () => {
      if (!snapshot.renderAsText && snapshot.word) {
        await exportTextRenderer.preloadGlyphImagesForWord(snapshot.word);
      }
      if (cancelled) return;
      canvas.width = width;
      canvas.height = height;
      exportTextRenderer.renderWordHeader({
        canvas,
        headerHeight: height,
        ...snapshot,
      });
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

{#if showHeader}
  <div
    class="header-section"
    class:dark-mode={activeDarkMode}
    class:export-presentation={exportPresentation}
    style="height: {scaledHeaderHeight}px;"
    transition:slide|local={{
      duration: exportPresentation ? 0 : HEADER_MOTION_MS,
      easing: cubicOut,
    }}
  >
    {#if exportPresentation}
      <canvas
        class="export-header-canvas"
        bind:this={exportCanvas}
        bind:clientWidth={exportCanvasWidth}
        role="img"
        aria-label={wordVisible
          ? customTitleText?.trim() || sequence.word || "Card header"
          : "Card header"}
      ></canvas>
    {:else if isBrowseSoloMode}
      <span
        class="word-title"
        style="font-size: {wordTitleFontSize}px; color: {soloHand === 'left'
          ? 'var(--prop-blue, #2196f3)'
          : 'var(--prop-red, #f44336)'};"
      >
        {soloHand === "left" ? "Left" : "Right"}
        {browseViewMode?.subject === "hands" ? "Hand Path" : "Prop Path"}
      </span>
    {:else}
      {#if showDifficultyLevel}
        <div
          class="badge-wrapper"
          style="left: {badgePadding}px;"
          transition:scale|local={{ duration: 200, easing: cubicOut }}
        >
          <DifficultyBadge
            level={difficultyLevel}
            size="{badgeSize}px"
            fontSize="{badgeNumberFontSize}px"
          />
        </div>
      {/if}

      {#if customTitleText?.trim()}
        <div
          class="word-title text-title"
          style:width={`max(0px, calc(100% - ${Math.ceil(wordSideInset * 2)}px))`}
          style:font-size={`max(var(--font-size-min, 14px), ${wordTitleFontSize}px)`}
          transition:fade|local={{ duration: 200 }}
        >
          {customTitleText}
        </div>
      {:else if wordVisible}
        <div
          class="word-title"
          style:width={`max(0px, calc(100% - ${Math.ceil(wordSideInset * 2)}px))`}
          transition:fade|local={{ duration: 200 }}
        >
          <TKAWordGlyph
            word={simplifyRepeatedWord(sequence.word!)}
            height={Math.floor(wordTitleFontSize * 0.85)}
            darkMode={activeDarkMode}
            fitToParent
          />
        </div>
      {/if}

      {#if showLoopGlyph && loopComponents}
        <div
          class="loop-icon-badge"
          style="height: {badgeSize}px; right: {badgePadding}px;"
          transition:fade|local={{ duration: 200 }}
        >
          <LOOPIconStrip
            activeComponents={loopComponents}
            rotationPeriod={loopRotationPeriod}
            inversionPeriod={loopInversionPeriod}
            reflectionAxis={loopReflectionAxis}
            overlayComponents={loopOverlayComponents}
            size={Math.floor(badgeSize * LOOP_ICON_SIZE_SCALE)}
            darkMode={activeDarkMode}
            showFreeformWhenEmpty={false}
          />
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* Header section */
  .header-section {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(245, 245, 245, 0.98);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    transition:
      background-color 350ms ease,
      border-color 350ms ease;
  }

  .header-section.dark-mode {
    background: rgba(10, 10, 15, 0.98);
    border-bottom-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .header-section.export-presentation {
    background: transparent;
    border-bottom: 0;
  }

  .export-header-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .badge-wrapper {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .word-title {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 75%;
    overflow: hidden;
  }

  .text-title {
    color: #111;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 700;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-section.dark-mode .text-title {
    color: white;
  }

  .loop-icon-badge {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0 4px;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .header-section,
    .word-title {
      transition: none;
    }
  }
</style>
