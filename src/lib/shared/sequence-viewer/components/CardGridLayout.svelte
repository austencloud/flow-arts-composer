<!--
  CardGridLayout.svelte

  Renders the ChoreoCard grid section: uniform grid and duration-aware
  layout with start position, step cells, QR code, and mandala fill cells.
  Handles both standard and scroll modes. Extracted from ChoreoCard.svelte.
-->
<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import type { AnimationConfig } from "svelte/animate";

  function safeFlip(
    node: Element,
    animation: { from: DOMRect; to: DOMRect },
    params: Parameters<typeof flip>[2]
  ): AnimationConfig {
    const { from, to } = animation;
    if (!from.width || !from.height || !to.width || !to.height) {
      return { duration: 0 };
    }
    if (Math.abs(from.width - to.width) > 2 || Math.abs(from.height - to.height) > 2) {
      return { duration: 0 };
    }
    const dx = Math.abs(from.left - to.left);
    const dy = Math.abs(from.top - to.top);
    if (dx > to.width * 3 || dy > to.height * 3) {
      return { duration: 0 };
    }
    return flip(node, animation, params);
  }
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { BackgroundType } from "@austencloud/backgrounds";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { TimelineRow } from "$lib/shared/create/utils/grid-calculations";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import CellRenderer from "./CellRenderer.svelte";
  import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { getQRCellScale } from "$lib/shared/qr/qr-cell-scale";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { toMandalaPathShape } from "$lib/shared/mandala/services/mandala-path-policy";

  import type { ChoreoCardCell as CellData } from "$lib/shared/choreo-card/services/choreo-card-render-engine";

  interface MandalaPlacement {
    row: number;
    col: number;
    variant: "left" | "right" | "full";
  }

  interface Props {
    sequence: SequenceData;
    cells: CellData[];
    visibleCells: CellData[];
    effectiveColumns: number;
    effectiveRows: number;
    hasMixedDurations: boolean;
    durationRows: TimelineRow[];
    durationColCount: number;
    includeStartPosition: boolean;
    startPositionLayout: "row" | "column";
    needsScroll: boolean;
    showHighlight: boolean;
    highlightedStepIndex: number | null;
    showQRCode: boolean;
    qrDataUrl: string | null;
    /** A QR is being minted for this card — reserve the cell and show it working. */
    qrPending?: boolean;
    qrGridPosition: { gridColumn: number; gridRow: number } | null;
    showMandala: boolean;
    mandalaPlacements: MandalaPlacement[];
    flipDuration: number;
    cellWidth: number;
    activeDarkMode: boolean;
    leftPropType: PropType | undefined;
    rightPropType: PropType | undefined;
    onStepClick: ((stepIndex: number) => void) | undefined;
    /** When provided, render a clickable play badge over the QR (interactive
        viewer only). Click switches to the 2D animation view and starts play. */
    onQrPlayClick?: () => void;
    /** When true, the start-position cell is clickable too (calls onStepClick(-1)). */
    clickableStart?: boolean;
    onGridScrollRefChange: (el: HTMLDivElement | undefined) => void;
    // CellRenderer pass-through props
    showStepNumbers: boolean;
    crossfadeActive: boolean;
    transitionMode: "crossfade" | "swap";
    isBrowseSoloMode: boolean;
    isMotionSoloMode: boolean;
    soloHand: "left" | "right" | undefined;
    stepNumFontSize: number;
    formatDuration: (d: number) => string;
    getMotionSoloMotion: (cellIndex: number) => MotionData | undefined;
    formatSoloTurns: (turns: number | "fl" | undefined | null) => string;
    shortOrientation: (ori: string | undefined | null) => string | null;
  }

  /** Fraction of the cell width the mandala occupies. Tweak for breathing room. */
  const MANDALA_CELL_SCALE = 0.78;

  const {
    sequence,
    cells,
    visibleCells,
    effectiveColumns,
    effectiveRows,
    hasMixedDurations,
    durationRows,
    durationColCount,
    includeStartPosition,
    startPositionLayout,
    needsScroll,
    showHighlight,
    highlightedStepIndex,
    showQRCode,
    qrDataUrl,
    qrPending = false,
    qrGridPosition,
    showMandala,
    mandalaPlacements,
    flipDuration,
    cellWidth,
    activeDarkMode,
    leftPropType,
    rightPropType,
    onStepClick,
    onQrPlayClick,
    clickableStart = false,
    onGridScrollRefChange,
    showStepNumbers,
    crossfadeActive,
    transitionMode,
    isBrowseSoloMode,
    isMotionSoloMode,
    soloHand,
    stepNumFontSize,
    formatDuration,
    getMotionSoloMotion,
    formatSoloTurns,
    shortOrientation,
  }: Props = $props();

  // The card's mandalas trace the same hand paths the animation draws, so they
  // follow the same motion-path policy. Picking Concave on the animation canvas
  // and leaving the card on arcs showed one sequence two different ways in one
  // frame. The manager publishes through observers rather than runes, hence the
  // subscription instead of a plain $derived.
  const visibilityManager = getAnimationVisibilityManager();
  let mandalaPathShape = $state(toMandalaPathShape(visibilityManager.getPathPolicy()));
  $effect(() => {
    const sync = () => {
      mandalaPathShape = toMandalaPathShape(visibilityManager.getPathPolicy());
    };
    sync();
    visibilityManager.registerObserver(sync);
    return () => visibilityManager.unregisterObserver(sync);
  });
  const scaleDuration = $derived(flipDuration > 0 ? 200 : 0);
  const isLightBackground = $derived(settingsService.settings.backgroundType === BackgroundType.CELESTIAL);
  const qrScalePct = $derived(`${getQRCellScale(sequence?.steps?.length ?? 0) * 100}%`);

  // Bind helper: forward the scroll ref to the parent
  function bindGridScrollRef(node: HTMLDivElement) {
    onGridScrollRefChange(node);
    return {
      destroy() {
        onGridScrollRefChange(undefined);
      }
    };
  }
</script>

{#snippet startCellBlock(startCell: CellData)}
  {#if clickableStart && onStepClick}
    <button
      class="pictograph-cell clickable"
      class:dark-mode={activeDarkMode}
      class:current={showHighlight && highlightedStepIndex === -1}
      onclick={() => onStepClick(-1)}
      type="button"
      aria-label="Go to start position"
    >
      <CellRenderer
        cell={startCell}
        showDurBadge={false}
        {showStepNumbers}
        {activeDarkMode}
        {crossfadeActive}
        {transitionMode}
        {isBrowseSoloMode}
        {isMotionSoloMode}
        {soloHand}
        {stepNumFontSize}
        {hasMixedDurations}
        {formatDuration}
        {getMotionSoloMotion}
        {formatSoloTurns}
        {shortOrientation}
      />
    </button>
  {:else}
    <div
      class="pictograph-cell"
      class:dark-mode={activeDarkMode}
      class:current={showHighlight && highlightedStepIndex === -1}
    >
      <CellRenderer
        cell={startCell}
        showDurBadge={false}
        {showStepNumbers}
        {activeDarkMode}
        {crossfadeActive}
        {transitionMode}
        {isBrowseSoloMode}
        {isMotionSoloMode}
        {soloHand}
        {stepNumFontSize}
        {hasMixedDurations}
        {formatDuration}
        {getMotionSoloMotion}
        {formatSoloTurns}
        {shortOrientation}
      />
    </div>
  {/if}
{/snippet}

{#snippet qrImageBlock()}
  {#if onQrPlayClick}
    <!-- Interactive viewer: wrap the QR so a transparent button can sit over
         the baked-in play badge (centered 25%, where modules are cleared). The
         <img> underneath is untouched and still scannable. -->
    <div class="qr-play-wrapper" style="width:{qrScalePct};height:{qrScalePct}">
      <img class="qr-code-image qr-fill" src={qrDataUrl} alt="Scan to get this sequence" draggable="false" />
      <button
        type="button"
        class="qr-play-hit"
        onclick={onQrPlayClick}
        aria-label="Play in 2D"
        title="Play in 2D"
      ></button>
    </div>
  {:else}
    <img class="qr-code-image" src={qrDataUrl} alt="Scan to get this sequence" draggable="false" style="width:{qrScalePct};height:{qrScalePct}" />
  {/if}
{/snippet}

<!-- The reserved QR cell. Minting a code is a Firestore round trip plus a
     two-theme cell warm, so the slot shows it working rather than sitting blank
     and reading as a toggle that did nothing. -->
{#snippet qrCellBlock()}
  {#if qrDataUrl}
    {@render qrImageBlock()}
  {:else if qrPending}
    <div class="qr-pending" role="status" aria-label="Generating QR code">
      <ProgressRing
        percent={-1}
        size={20}
        strokeWidth={2}
        color={activeDarkMode ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.45)"}
      />
    </div>
  {/if}
{/snippet}

{#if hasMixedDurations && durationRows.length > 0}
  <!-- Duration-aware layout: Auto can place Start above or beside the timeline. -->
  {@const startCell = cells.find(c => c.index === -1)}
  {@const startInColumn = includeStartPosition && startPositionLayout === "column"}
  {@const stepMaxUnits = durationColCount - (startInColumn ? 1 : 0)}
  {#if needsScroll}
    <div class="grid-scroll-container themed-scrollbar" use:bindGridScrollRef>
      <div
        class="duration-layout"
        class:start-row={includeStartPosition && startPositionLayout === "row"}
        class:dark-mode={activeDarkMode}
        style="--max-units: {durationColCount}; --step-max: {stepMaxUnits};"
      >
        {#if includeStartPosition && startCell}
          <div class="duration-start-col" class:dark-mode={activeDarkMode} transition:fade|local={{ duration: scaleDuration }}>
            {@render startCellBlock(startCell)}
            {#if showQRCode}
              <div class="pictograph-cell qr-cell" class:dark-mode={activeDarkMode} transition:fade|local={{ duration: scaleDuration }}>
                {@render qrCellBlock()}
              </div>
            {/if}
          </div>
        {/if}
        <div class="duration-steps-area">
          {#each durationRows as row, rowIdx (rowIdx)}
            <div class="duration-row">
              {#each row.steps as { stepIndex, duration } (stepIndex)}
                {@const cell = cells.find(c => c.index === stepIndex)}
                {#if cell}
                  <div class="duration-cell" class:dark-mode={activeDarkMode} style="--dur: {duration}; flex: {duration};">
                    {#if onStepClick}
                      <button
                        class="pictograph-cell clickable"
                        class:dark-mode={activeDarkMode}
                        class:current={showHighlight && highlightedStepIndex === cell.index}
                        class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
                        onclick={() => onStepClick(cell.index)}
                        type="button"
                        aria-label="Go to step {cell.label}"
                      >
                        <CellRenderer
                          {cell}
                          showDurBadge={true}
                          {showStepNumbers}
                          {activeDarkMode}
                          {crossfadeActive}
                {transitionMode}
                          {isBrowseSoloMode}
                          {isMotionSoloMode}
                          {soloHand}
                          {stepNumFontSize}
                          {hasMixedDurations}
                          {formatDuration}
                          {getMotionSoloMotion}
                          {formatSoloTurns}
                          {shortOrientation}
                        />
                      </button>
                    {:else}
                      <div
                        class="pictograph-cell"
                        class:dark-mode={activeDarkMode}
                        class:current={showHighlight && highlightedStepIndex === cell.index}
                        class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
                      >
                        <CellRenderer
                          {cell}
                          showDurBadge={true}
                          {showStepNumbers}
                          {activeDarkMode}
                          {crossfadeActive}
                {transitionMode}
                          {isBrowseSoloMode}
                          {isMotionSoloMode}
                          {soloHand}
                          {stepNumFontSize}
                          {hasMixedDurations}
                          {formatDuration}
                          {getMotionSoloMotion}
                          {formatSoloTurns}
                          {shortOrientation}
                        />
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <div
      class="duration-layout"
      class:start-row={includeStartPosition && startPositionLayout === "row"}
      class:dark-mode={activeDarkMode}
      style="--max-units: {durationColCount}; --step-max: {stepMaxUnits};"
    >
      {#if includeStartPosition && startCell}
        <div class="duration-start-col" class:dark-mode={activeDarkMode}>
          {@render startCellBlock(startCell)}
          {#if showQRCode && (qrDataUrl || qrPending)}
            <div class="pictograph-cell qr-cell" class:dark-mode={activeDarkMode} transition:fade|local={{ duration: scaleDuration }}>
              {@render qrCellBlock()}
            </div>
          {/if}
        </div>
      {/if}
      <div class="duration-steps-area">
        {#each durationRows as row, rowIdx (rowIdx)}
          <div class="duration-row">
            {#each row.steps as { stepIndex, duration } (stepIndex)}
              {@const cell = cells.find(c => c.index === stepIndex)}
              {#if cell}
                <div class="duration-cell" class:dark-mode={activeDarkMode} style="--dur: {duration}; flex: {duration};">
                  {#if onStepClick}
                    <button
                      class="pictograph-cell clickable"
                      class:dark-mode={activeDarkMode}
                      class:current={showHighlight && highlightedStepIndex === cell.index}
                      class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
                      onclick={() => onStepClick(cell.index)}
                      type="button"
                      aria-label="Go to step {cell.label}"
                    >
                      <CellRenderer
                        {cell}
                        showDurBadge={true}
                        {showStepNumbers}
                        {activeDarkMode}
                        {crossfadeActive}
                {transitionMode}
                        {isBrowseSoloMode}
                        {isMotionSoloMode}
                        {soloHand}
                        {stepNumFontSize}
                        {hasMixedDurations}
                        {formatDuration}
                        {getMotionSoloMotion}
                        {formatSoloTurns}
                        {shortOrientation}
                      />
                    </button>
                  {:else}
                    <div
                      class="pictograph-cell"
                      class:dark-mode={activeDarkMode}
                      class:current={showHighlight && highlightedStepIndex === cell.index}
                      class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
                    >
                      <CellRenderer
                        {cell}
                        showDurBadge={true}
                        {showStepNumbers}
                        {activeDarkMode}
                        {crossfadeActive}
                {transitionMode}
                        {isBrowseSoloMode}
                        {isMotionSoloMode}
                        {soloHand}
                        {stepNumFontSize}
                        {hasMixedDurations}
                        {formatDuration}
                        {getMotionSoloMotion}
                        {formatSoloTurns}
                        {shortOrientation}
                      />
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
{:else if needsScroll}
  <!-- Uniform grid: scroll mode -->
  {@const startCellScroll = cells.find(c => c.index === -1)}
  <div class="grid-scroll-container themed-scrollbar" use:bindGridScrollRef>
    <div
      class="grid-section"
      class:dark-mode={activeDarkMode}
      style="grid-template-columns: repeat({effectiveColumns}, 1fr);"
    >
      {#if startCellScroll && includeStartPosition}
        <div
          class="cell-flip-wrapper"
          style="grid-column: 1; grid-row: 1;"
          transition:scale|local={{ duration: scaleDuration, easing: cubicOut }}
        >
          {@render startCellBlock(startCellScroll)}
        </div>
      {/if}
      {#each visibleCells as cell (cell.index)}
        <div
          class="cell-flip-wrapper"
          style="grid-column: {cell.gridColumn}; grid-row: {cell.gridRow};"
          animate:safeFlip={{ duration: flipDuration, easing: cubicOut }}
        >
        {#if onStepClick && cell.index >= 0}
          <button
            class="pictograph-cell clickable"
            class:dark-mode={activeDarkMode}
            class:current={showHighlight && highlightedStepIndex === cell.index}
            class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
            onclick={() => onStepClick(cell.index)}
            type="button"
            aria-label="Go to step {cell.label}"
          >
            <CellRenderer
              {cell}
              showDurBadge={true}
              {showStepNumbers}
              {activeDarkMode}
              {crossfadeActive}
                {transitionMode}
              {isBrowseSoloMode}
              {isMotionSoloMode}
              {soloHand}
              {stepNumFontSize}
              {hasMixedDurations}
              {formatDuration}
              {getMotionSoloMotion}
              {formatSoloTurns}
              {shortOrientation}
            />
          </button>
        {:else}
          <div
            class="pictograph-cell"
            class:dark-mode={activeDarkMode}
            class:current={showHighlight && highlightedStepIndex === cell.index}
            class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
          >
            <CellRenderer
              {cell}
              showDurBadge={true}
              {showStepNumbers}
              {activeDarkMode}
              {crossfadeActive}
                {transitionMode}
              {isBrowseSoloMode}
              {isMotionSoloMode}
              {soloHand}
              {stepNumFontSize}
              {hasMixedDurations}
              {formatDuration}
              {getMotionSoloMotion}
              {formatSoloTurns}
              {shortOrientation}
            />
          </div>
        {/if}
        </div>
      {/each}
      {#if qrGridPosition && (qrDataUrl || qrPending)}
        <div
          class="cell-flip-wrapper qr-cell-wrapper"
          style="grid-column: {qrGridPosition.gridColumn}; grid-row: {qrGridPosition.gridRow};"
          transition:scale|local={{ duration: scaleDuration, easing: cubicOut }}
        >
          <div class="pictograph-cell qr-cell" class:dark-mode={activeDarkMode}>
            {@render qrCellBlock()}
          </div>
        </div>
      {/if}
      {#each mandalaPlacements as placement (placement.row + "-" + placement.col + "-" + placement.variant)}
        <div
          class="cell-flip-wrapper mandala-cell-wrapper"
          style="grid-column: {placement.col}; grid-row: {placement.row};"
          transition:fade|local={{ duration: scaleDuration }}
        >
          <div class="pictograph-cell mandala-cell" class:light-bg={isLightBackground}>
            <SequenceMandala
              {sequence}
              mode="card-back"
              style="stroke"
              show={placement.variant === "full" ? "both" : placement.variant}
              size={Math.round((cellWidth || 120) * MANDALA_CELL_SCALE)}
              darkMode={activeDarkMode}
              {leftPropType}
              {rightPropType}
              pathShape={mandalaPathShape}
            />
          </div>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <!-- Uniform grid: standard mode -->
  {@const startCell = cells.find(c => c.index === -1)}
  <div
    class="grid-section"
    class:dark-mode={activeDarkMode}
    style="grid-template-columns: repeat({effectiveColumns}, 1fr);"
  >
    {#if startCell && includeStartPosition}
      <div
        class="cell-flip-wrapper"
        style="grid-column: 1; grid-row: 1;"
        transition:scale|local={{ duration: scaleDuration, easing: cubicOut }}
      >
        {@render startCellBlock(startCell)}
      </div>
    {/if}
    {#each visibleCells as cell (cell.index)}
      <div
        class="cell-flip-wrapper"
        style="grid-column: {cell.gridColumn}; grid-row: {cell.gridRow};"
        animate:safeFlip={{ duration: flipDuration, easing: cubicOut }}
      >
      {#if onStepClick && cell.index >= 0}
        <button
          class="pictograph-cell clickable"
          class:dark-mode={activeDarkMode}
          class:current={showHighlight && highlightedStepIndex === cell.index}
          class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
          onclick={() => onStepClick(cell.index)}
          type="button"
          aria-label="Go to step {cell.label}"
        >
          <CellRenderer
            {cell}
            showDurBadge={true}
            {showStepNumbers}
            {activeDarkMode}
            {crossfadeActive}
                {transitionMode}
            {isBrowseSoloMode}
            {isMotionSoloMode}
            {soloHand}
            {stepNumFontSize}
            {hasMixedDurations}
            {formatDuration}
            {getMotionSoloMotion}
            {formatSoloTurns}
            {shortOrientation}
          />
        </button>
      {:else}
        <div
          class="pictograph-cell"
          class:dark-mode={activeDarkMode}
          class:current={showHighlight && highlightedStepIndex === cell.index}
          class:played={showHighlight && highlightedStepIndex !== null && cell.index < highlightedStepIndex}
        >
          <CellRenderer
            {cell}
            showDurBadge={true}
            {showStepNumbers}
            {activeDarkMode}
            {crossfadeActive}
                {transitionMode}
            {isBrowseSoloMode}
            {isMotionSoloMode}
            {soloHand}
            {stepNumFontSize}
            {hasMixedDurations}
            {formatDuration}
            {getMotionSoloMotion}
            {formatSoloTurns}
            {shortOrientation}
          />
        </div>
      {/if}
      </div>
    {/each}
    {#if qrGridPosition && (qrDataUrl || qrPending)}
      <div
        class="cell-flip-wrapper qr-cell-wrapper"
        style="grid-column: {qrGridPosition.gridColumn}; grid-row: {qrGridPosition.gridRow};"
        transition:scale|local={{ duration: scaleDuration, easing: cubicOut }}
      >
        <div class="pictograph-cell qr-cell" class:dark-mode={activeDarkMode}>
          {@render qrCellBlock()}
        </div>
      </div>
    {/if}
    {#each mandalaPlacements as placement (placement.row + "-" + placement.col + "-" + placement.variant)}
      <div
        class="cell-flip-wrapper mandala-cell-wrapper"
        style="grid-column: {placement.col}; grid-row: {placement.row};"
        transition:fade|local={{ duration: scaleDuration }}
      >
        <div class="pictograph-cell mandala-cell" class:light-bg={isLightBackground}>
          <SequenceMandala
            {sequence}
            mode="card-back"
            style="stroke"
            show={placement.variant === "full" ? "both" : placement.variant}
            size={Math.round((cellWidth || 120) * MANDALA_CELL_SCALE)}
            darkMode={activeDarkMode}
            {leftPropType}
            {rightPropType}
            pathShape={mandalaPathShape}
          />
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Scroll container for long sequences (>16 steps) */
  .grid-scroll-container {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0;
  }

  /* Duration-aware layout - start column barrier + step rows to the right */
  .duration-layout {
    display: flex;
    width: 100%;
    min-height: 0;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    background: #f5f5f5;
    transition: background-color 350ms ease;
  }

  .duration-layout.dark-mode {
    background: #000;
  }

  /* Start position: fixed column that spans the full height as a barrier */
  .duration-start-col {
    flex: 0 0 calc(1 / var(--max-units, 5) * 100%);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: #f5f5f5;
    transition: background-color 350ms ease;
  }

  .duration-start-col.dark-mode {
    background: #0a0a0f;
  }

  .duration-start-col .pictograph-cell {
    width: 100%;
    aspect-ratio: 1;
  }

  .duration-start-col :global(.cell-image) {
    width: 100%;
    height: auto;
    display: block;
  }

  /* A top Start lane uses the same one-unit square as the timeline cells.
     QR parks at the far edge, matching the uniform-grid row placement. */
  .duration-layout.start-row {
    flex-direction: column;
  }

  .duration-layout.start-row .duration-start-col {
    flex: 0 0 auto;
    width: 100%;
    flex-direction: row;
  }

  .duration-layout.start-row .duration-start-col .pictograph-cell {
    flex: 0 0 calc(1 / var(--max-units, 5) * 100%);
    width: calc(1 / var(--max-units, 5) * 100%);
  }

  .duration-layout.start-row .duration-start-col .qr-cell {
    margin-left: auto;
  }

  .duration-layout.start-row .duration-steps-area {
    flex: 0 0 auto;
    width: 100%;
  }

  /* Steps area: fills remaining width, stacks rows vertically */
  .duration-steps-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .duration-row {
    display: flex;
    gap: 0;
    width: 100%;
  }

  .duration-cell {
    /* flex distributes width proportionally within the row.
       max-width caps each cell so rows with fewer total units
       don't stretch cells beyond their proportion of the max step row. */
    max-width: calc(var(--dur, 1) / var(--step-max, 4) * 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    /* Background matches pictograph so wider cells have seamless side fill */
    background: #f5f5f5;
    transition: background-color 350ms ease;
  }

  .duration-cell.dark-mode {
    background: #0a0a0f;
  }

  .duration-cell .pictograph-cell {
    width: 100%;
    aspect-ratio: auto;
  }

  .duration-cell :global(.cell-image) {
    /* Image fills the cell width; height follows natural aspect ratio */
    width: 100%;
    height: auto;
    display: block;
  }

  /* Grid section - CSS Grid layout */
  .grid-section {
    display: grid;
    gap: 0;
    min-height: 0;
    min-width: 0;
    width: 100%;
    /* Fill remaining space after header/footer. 1fr rows divide the available
       height evenly so the last row isn't clipped behind the footer. Cells
       keep aspect-ratio: 1 but shrink slightly from perfect squares to fit. */
    flex: 1;
    grid-auto-rows: 1fr;
    max-width: 100%;
    overflow: hidden;
    /* Light mode background for empty cells */
    background: #f5f5f5;
    transition: background-color 350ms ease;
  }

  .grid-section.dark-mode {
    /* Dark mode background for empty cells */
    background: #000;
  }

  /* Wrapper for FLIP animation - a real grid item so Svelte can measure bounding rects.
     The pictograph-cell inside fills it completely. */
  .cell-flip-wrapper {
    overflow: hidden;
  }

  .cell-flip-wrapper > .pictograph-cell {
    width: 100%;
  }

  /* Individual pictograph cell */
  .pictograph-cell {
    position: relative;
    /* Container context for step-number-overlay cqw/cqh units */
    container-type: inline-size;
    aspect-ratio: 1;
    overflow: hidden;
    box-sizing: border-box;
    /* Subtle border for cell separation */
    border: 1px solid rgba(0, 0, 0, 0.08);
    /* Button reset for clickable variant */
    background: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: default;
    transition: border-color 350ms ease;
  }

  button.pictograph-cell {
    cursor: pointer;
  }

  .pictograph-cell.dark-mode {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* Clickable cells */
  .pictograph-cell.clickable {
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 150ms ease, border-color 350ms ease;
  }

  /* Hover affordance: scale the cell up so it reads as clickable (click to jump
     to that step). transform is composited — it lifts the cell without shifting
     any neighbor. z-index keeps the grown cell above its siblings. */
  @media (hover: hover) and (pointer: fine) {
    .pictograph-cell.clickable:hover {
      transform: scale(1.06);
      z-index: 8;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    }
  }

  .pictograph-cell.clickable:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
    z-index: 5;
  }

  /* Current step - "Elevated Luxury" selection with scale + glow */
  .pictograph-cell.current {
    z-index: 10;
  }

  /* Golden selection overlay - rendered via ::after so it paints ON TOP of
     the cell image. Stays within cell bounds so nothing overflows. */
  .pictograph-cell.current::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 3px solid rgba(251, 191, 36, 0.9);
    box-shadow: inset 0 0 14px rgba(251, 191, 36, 0.5);
    pointer-events: none;
    animation: cellSelectionGlowIn 0.4s ease-out forwards;
  }

  @keyframes cellSelectionGlowIn {
    0% {
      border-color: rgba(251, 191, 36, 0);
      box-shadow: inset 0 0 0 rgba(251, 191, 36, 0);
    }
    100% {
      border-color: rgba(251, 191, 36, 0.9);
      box-shadow: inset 0 0 14px rgba(251, 191, 36, 0.5);
    }
  }

  /* Played cells (already passed) - dim to distinguish from upcoming */
  .pictograph-cell.played {
    opacity: 0.6;
    transition: opacity 0.15s ease-out;
  }

  /* QR code cell - occupies the last row of column 1, under the start position.
     In duration layouts (flex column), margin-top: auto pushes it to the bottom. */
  .qr-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: auto;
    background: #f5f5f5;
    transition: background-color 350ms ease;
  }

  .qr-cell.dark-mode {
    background: #000;
  }

  /* Fills the reserved cell rather than sizing to the ring, so nothing shifts
     when the real QR image replaces it. */
  .qr-pending {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .qr-code-image {
    object-fit: contain;
    -webkit-user-drag: none;
    user-select: none;
    /* Fade the QR in once it renders so it doesn't pop inside the cell's scale. */
    animation: qrImgIn var(--duration-normal, 200ms) ease;
  }
  @keyframes qrImgIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Interactive viewer only: clickable play badge over the QR. The wrapper
     carries the QR's rendered size (qrScalePct of the cell) so the overlay
     button can be sized as a fraction of the QR image, not the whole cell. */
  .qr-play-wrapper {
    position: relative;
    display: block;
  }

  .qr-code-image.qr-fill {
    width: 100%;
    height: 100%;
  }

  /* Transparent hit area over the baked-in play triangle (centered 25% of the
     QR). Floored at the 44px touch-target minimum; the button is transparent,
     so even if it overlaps modules at small sizes the on-screen QR a phone
     scans is unaffected. */
  .qr-play-hit {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 25%;
    height: 25%;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    transform: translate(-50%, -50%);
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  /* Affordance: a soft accent ring pops in on hover/focus to signal the badge
     does something. The badge underneath is the play icon — no second glyph. */
  .qr-play-hit::after {
    content: "";
    position: absolute;
    inset: -16%;
    border-radius: 50%;
    border: 2px solid var(--theme-accent, #6366f1);
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
    opacity: 0;
    transform: scale(0.82);
    transition: opacity 160ms ease, transform 160ms ease;
    pointer-events: none;
  }

  .qr-play-hit:hover::after,
  .qr-play-hit:focus-visible::after {
    opacity: 1;
    transform: scale(1);
  }

  .qr-play-hit:focus-visible {
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .qr-play-hit::after {
      transition: none;
    }
    .qr-code-image {
      animation: none;
    }
  }

  /* Mandala fill cell - sits in empty col-0 cells and shows left/right/full paths. */
  .mandala-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    background: transparent;
  }

  .mandala-cell.light-bg {
    background: var(--dm-pictograph-bg, #0a0a0f);
    border-radius: 8px;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .pictograph-cell,
    .grid-section,
    .duration-layout,
    .duration-start-col,
    .duration-cell {
      transition: none;
    }

    .pictograph-cell.current::after {
      animation: none;
    }

    .pictograph-cell.clickable:hover {
      transform: none;
    }

    .grid-scroll-container {
      scroll-behavior: auto;
    }
  }
</style>
