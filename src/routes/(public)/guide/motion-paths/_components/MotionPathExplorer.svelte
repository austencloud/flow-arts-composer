<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { SequenceViewerVisibilityState } from "$lib/shared/sequence-viewer/state/viewer-visibility-state.svelte";
  import { setViewerVisibilityContext } from "$lib/shared/sequence-viewer/context/viewer-visibility-context";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { browser } from "$app/environment";
  import MotionPathTransitionStage from "./MotionPathTransitionStage.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TurnNotationControls from "$lib/shared/shape-matrix/app/components/TurnNotationControls.svelte";
  import ShapeMatrixGrid from "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import ElementChipRow from "$lib/shared/shape-matrix/components/ElementChipRow.svelte";
  import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
  import {
    matrixFiltersForTurns,
    type MatrixLabelMode,
  } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    flowerKey,
    flowerPetals,
    type Flower,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import { pairAtTurns } from "$lib/shared/shape-matrix/domain/flower-at-turn";
  import { buildModeRealization } from "$lib/shared/shape-matrix/services/build-mode-realizations";
  import {
    loadShapeMatrix,
    shapeMatrixTipPoint,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    createMotionPathExplorerState,
    type ExplorerSource,
  } from "../_data/motion-path-explorer-state.svelte";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import type { TurnValue } from "$lib/shared/create/services/level-turn-values";
  import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";

  const explorer = createMotionPathExplorerState();
  const matrixTipDx = shapeMatrixTipPoint(PropType.STAFF)?.dx;
  setAnimationVisibilityContext(explorer.scope.visibility);
  let pickerOpen = $state(false);
  // The lesson is the path. Everything that picks what plays (the matrix, a
  // browsed sequence, turns, timing) waits behind one button.
  let chooserOpen = $state(false);
  // Four boxes on one screen. Once the tiles and the canvas sit side by side
  // (a 900px container) on a viewport tall enough (900px), the workspace
  // takes the viewport's height, every box scales to its quadrant and the
  // chooser is simply there. The fit-mode CSS below carries the same two
  // thresholds; this flag drives what CSS cannot (the tiles' size, the
  // chooser's presence, the chips' shape).
  const FIT_MIN_CONTAINER = 900;
  const FIT_MEDIA = "(min-height: 900px)";
  let explorerWidth = $state(0);
  let viewportTall = $state(false);
  const fitMode = $derived(explorerWidth >= FIT_MIN_CONTAINER && viewportTall);
  // Which hands the canvas draws. The animator owns per-hand motion
  // visibility; this surface scopes its own instance so a header's solo hides
  // the other prop and its trail through that owner, as the Shape Engine does.
  const motionVisibility = new SequenceViewerVisibilityState(true);
  setViewerVisibilityContext(motionVisibility);
  $effect(() => {
    const solo = explorer.soloHand;
    untrack(() => {
      motionVisibility.leftMotion = solo !== "right";
      motionVisibility.rightMotion = solo !== "left";
    });
  });
  // The first thing on screen is a real matrix shape, not a frozen example.
  // One turn each keeps both hands drawing petals (pro 2, anti 4), and mixing
  // pro with anti means the Hybrid default puts each hand on a different path.
  const DEFAULT_TURN: TurnValue = 1;
  const DEFAULT_PAIR: { left: Flower; right: Flower } = {
    left: {
      style: "pro",
      turns: DEFAULT_TURN,
      ori: "in",
      grid: "diamond",
      petals: flowerPetals({ style: "pro", turns: DEFAULT_TURN }),
    },
    right: {
      style: "anti",
      turns: DEFAULT_TURN,
      ori: "in",
      grid: "diamond",
      petals: flowerPetals({ style: "anti", turns: DEFAULT_TURN }),
    },
  };
  let ready = $state(false);
  let playerFailed = $state(false);
  let matrixData = $state<ShapeMatrixData | null>(null);
  let matrixPreviews = $state<Map<string, ShapeMatrixData>>(new Map());
  let matrixError = $state<string | null>(null);
  let leftTurn = $state<TurnValue>(DEFAULT_TURN);
  let rightTurn = $state<TurnValue>(DEFAULT_TURN);
  let labelMode = $state<MatrixLabelMode>("turns");
  let mounted = true;
  let matrixRequest = 0;
  const matrixFilters = $derived(matrixFiltersForTurns(leftTurn, rightTurn));
  // The matrix always traces prop tips. Hand paths are identical across the
  // whole grid, so a hands-traced matrix would show one shape in every cell.
  const previewMatrix = $derived(
    matrixPreviews.get(
      `${explorer.selectedPath}:tips:${explorer.selectedPath === "hybrid" ? explorer.fixedPath : "arc"}`
    )
  );
  const rowAxis = $derived(
    matrixData ? applyFilter(matrixData.axis, matrixFilters.left, false) : []
  );
  const colAxis = $derived(
    matrixData ? applyFilter(matrixData.axis, matrixFilters.right, false) : []
  );

  const SOURCE_OPTIONS: { value: ExplorerSource; label: string }[] = [
    { value: "matrix", label: "Shape matrix" },
    { value: "sequence", label: "Sequence" },
  ];

  function describeHand(flower: Flower): string {
    if (flower.style === "float") return "float";
    const turns = flower.turns === 1 ? "1 turn" : `${flower.turns} turns`;
    return `${flower.style}, ${turns}`;
  }

  // One plain line for what the canvas is playing. Sighted readers get it
  // from the canvas's own glyphs; this line is announced, not shown.
  const nowPlaying = $derived.by(() => {
    if (explorer.source === "sequence") {
      const word = simplifyRepeatedWord(explorer.browsed.word ?? "");
      const count = explorer.browsed.steps.length;
      const steps = `${count} ${count === 1 ? "step" : "steps"}`;
      return word ? `${word}, ${steps}.` : `A browsed sequence, ${steps}.`;
    }
    const pair = explorer.selectedPair;
    if (!pair) return "Loading a sequence…";
    if (explorer.soloHand === "left")
      return `Left hand ${describeHand(pair.left)}, on its own.`;
    if (explorer.soloHand === "right")
      return `Right hand ${describeHand(pair.right)}, on its own.`;
    return `Left hand ${describeHand(pair.left)}. Right hand ${describeHand(pair.right)}.`;
  });

  function chooseSource(value: ExplorerSource): void {
    if (value === explorer.source) return;
    if (value === "sequence") explorer.showSequence();
    else
      explorer.showMatrix(
        pairAtTurns(DEFAULT_PAIR, leftTurn, rightTurn),
        buildMatrixSequence
      );
  }

  function chooseTurn(hand: "left" | "right", value: TurnValue): void {
    if (hand === "left") leftTurn = value;
    else rightTurn = value;
    // A turn change asks to see the same shapes at the new turn value, so the
    // loaded animation follows the selection instead of going stale.
    const pair = explorer.selectedPair;
    if (!pair) return;
    explorer.chooseMatrixPair(
      pairAtTurns(pair, leftTurn, rightTurn),
      buildMatrixSequence
    );
  }

  async function loadMatrix(): Promise<void> {
    const request = ++matrixRequest;
    matrixError = null;
    matrixData = null;
    try {
      const paths: MandalaPathShape[] = ["arc", "linear", "concave", "hybrid"];
      const previews = await Promise.all(
        paths.flatMap((pathShape) =>
          (pathShape === "hybrid"
            ? (["arc", "linear", "concave"] as const)
            : (["arc"] as const)
          ).map(async (hybridFallback) => {
            const data = await loadShapeMatrix(PropType.STAFF, {
              pathShape,
              trace: "tips",
              hybridFallback,
            });
            return [`${pathShape}:tips:${hybridFallback}`, data] as const;
          })
        )
      );
      if (mounted && request === matrixRequest) {
        matrixPreviews = new Map(previews);
        // Realization matching uses the original flower geometry. Changing
        // the displayed path should never select a different sequence.
        matrixData = matrixPreviews.get("arc:tips:arc")!;
        if (!explorer.selectedPair)
          explorer.chooseMatrixPair(DEFAULT_PAIR, buildMatrixSequence);
      }
    } catch {
      if (mounted && request === matrixRequest)
        matrixError = "The Shape Matrix could not load.";
    }
  }

  async function buildMatrixSequence(
    pair: { left: Flower; right: Flower },
    mode: VtgMode
  ) {
    if (!matrixData) return null;
    const realization = await buildModeRealization(
      pair,
      {
        left: matrixData.left.get(flowerKey(pair.left))?.left ?? [],
        right: matrixData.right.get(flowerKey(pair.right))?.right ?? [],
        tips: matrixData.tips,
      },
      mode
    );
    return realization?.seq ?? null;
  }

  onMount(() => {
    registerLoopDetector(loopDetector);
    void loadMatrix();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    explorer.playing = !preference.matches;
    const pauseForReducedMotion = () => {
      if (preference.matches) explorer.playing = false;
    };
    preference.addEventListener("change", pauseForReducedMotion);
    const tall = window.matchMedia(FIT_MEDIA);
    viewportTall = tall.matches;
    const syncTall = () => (viewportTall = tall.matches);
    tall.addEventListener("change", syncTall);
    return () => {
      mounted = false;
      preference.removeEventListener("change", pauseForReducedMotion);
      tall.removeEventListener("change", syncTall);
    };
  });
</script>

<section
  class="explorer"
  aria-label="Motion path comparison"
  bind:clientWidth={explorerWidth}
>
  <div class="explorer-workspace">
    <!-- The path comes first. It is the one thing this page teaches, so it is
         the first thing to see and the first thing to touch. -->
    <div class="path-column">
      <PathShapePanel
        showHelp={false}
        fill={fitMode}
        onSettingChange={() => explorer.syncPolicy()}
      >
        {#snippet preview(path, size)}
          <SequenceMandala
            sequence={explorer.variants[path]}
            pathShape={path}
            show={explorer.soloHand ?? "both"}
            {size}
            mode="gallery"
            darkMode
            leftPropType={PropType.STAFF}
            rightPropType={PropType.STAFF}
            tipEnds={1}
            tipDx={explorer.trace === "hands" ? 0 : matrixTipDx}
            animate={false}
          />
        {/snippet}
      </PathShapePanel>
    </div>

    <div class="motion-column">
      <!-- Trace sits with the other drawing switches. It also brings the two
           columns to about the same height; the button then pins to the
           bottom of the row so the chooser opens right under it. -->
      <div class="transport">
        <span class="stage-label">Animation</span>
        <div class="transport-buttons">
          <PanelButton
            disabled={!ready || playerFailed}
            onclick={() => (explorer.playing = !explorer.playing)}
          >
            {explorer.playing ? "Pause" : "Play"}
          </PanelButton>
          <PanelButton
            ariaPressed={explorer.guides}
            onclick={explorer.toggleGuides}>Path lines</PanelButton
          >
        </div>
        <div class="trace-choice">
          <span class="control-label">Trace</span>
          <SegmentedControl
            options={[
              { value: "hands", label: "Hands" },
              { value: "tips", label: "Prop tips" },
            ]}
            value={explorer.trace}
            ariaLabel="Trace point"
            onchange={(value) => (explorer.trace = value)}
          />
        </div>
      </div>
      <div class="motion-stage" aria-label="Selected path animation">
        <div class="animation">
          {#if browser}
            <MotionPathTransitionStage
              sequence={explorer.sequence}
              transitionKey={explorer.transitionKey}
              scope={explorer.scope}
              playing={explorer.playing}
              trace={explorer.trace}
              leftPropType={PropType.STAFF}
              rightPropType={PropType.STAFF}
              hideGlyph={explorer.soloHand !== null}
              onplayingchange={(value) => (explorer.playing = value)}
              onstepchange={(value) => (explorer.liveStep = value)}
              onready={() => {
                ready = true;
                playerFailed = false;
              }}
              onloaderror={() => {
                ready = true;
                playerFailed = true;
              }}
            />
          {/if}
          {#if !ready}<span class="loading" role="status"
              >Loading animation…</span
            >{/if}
        </div>
      </div>
      <span class="sr-only" aria-live="polite">{nowPlaying}</span>
      {#if !fitMode}
        <div class="now-playing">
          <PanelButton
            ariaExpanded={chooserOpen}
            ariaControls="motion-path-chooser"
            onclick={() => (chooserOpen = !chooserOpen)}
          >
            Change what plays
            <i
              class="fas fa-chevron-down chooser-chevron"
              class:open={chooserOpen}
              aria-hidden="true"
            ></i>
          </PanelButton>
        </div>
      {/if}
    </div>

    {#if chooserOpen || fitMode}
      <!-- The played sequence has two sources. Each owns its own controls and
           its own stage, and the two swap in place. -->
      <section
        id="motion-path-chooser"
        class="chooser"
        aria-label="Change what plays"
        transition:growFade={{ axis: "y", duration: DURATION.normal }}
      >
        <div class="source-controls">
          <div class="picker-heading">
            <SegmentedControl
              options={SOURCE_OPTIONS}
              value={explorer.source}
              ariaLabel="Sequence source"
              onchange={chooseSource}
            />
          </div>
          <!-- Stacked, the box eases between the two control heights. In fit
               mode the controls fill their row, so the layers fill the box
               and the chips take whatever the turn picker leaves. -->
          <Crossfade
            key={explorer.source}
            duration={DURATION.normal}
            animateHeight
            fill={fitMode}
          >
            {#if explorer.source === "matrix"}
              <div class="matrix-controls">
                <div class="turn-picker">
                  <TurnNotationControls
                    {leftTurn}
                    {rightTurn}
                    {labelMode}
                    onturn={chooseTurn}
                    onlabelmodechange={(value) => (labelMode = value)}
                  />
                </div>
                <!-- Timing and direction belong to the matrix pair. A solo has
                     one hand, so the row leaves with it. -->
                {#if !explorer.soloHand}
                  <div
                    class="relationship"
                    transition:growFade={{
                      axis: "y",
                      duration: DURATION.normal,
                    }}
                  >
                    <ElementChipRow
                      selected={explorer.selectedMode}
                      columns={3}
                      compact={!fitMode}
                      fill={fitMode}
                      disabled={!explorer.selectedPair}
                      onpick={(mode) =>
                        explorer.chooseHandRelationship(
                          mode,
                          buildMatrixSequence
                        )}
                    />
                  </div>
                {/if}
              </div>
            {:else}
              <div class="browse-row">
                <PanelButton fullWidth onclick={() => (pickerOpen = true)}
                  >Browse sequences</PanelButton
                >
              </div>
            {/if}
          </Crossfade>
          <!-- The strip keeps its height while idle so a build in progress
               moves nothing beside it. -->
          <div class="picker-feedback" aria-live="polite">
            {#if explorer.pickerStatus === "loading"}
              <span>Building that sequence…</span>
            {:else if explorer.pickerError}
              <span role="alert">{explorer.pickerError}</span>
              <PanelButton onclick={explorer.retryMatrixSelection}
                >Try again</PanelButton
              >
            {/if}
          </div>
        </div>
        <!-- The stage is a square the height of the controls beside it (never
             smaller than 20rem, never larger than the matrix's 34rem), so the
             chooser packs into one band with nothing under the controls. -->
        <div class="source-stage">
          <Crossfade key={explorer.source} duration={DURATION.normal} fill>
            {#if explorer.source === "matrix"}
              <div class="matrix-stage" aria-busy={!matrixData && !matrixError}>
                {#if matrixError}
                  <div class="matrix-status error" role="alert">
                    <p>{matrixError}</p>
                    <PanelButton onclick={() => void loadMatrix()}
                      >Try again</PanelButton
                    >
                  </div>
                {:else if !matrixData}
                  <p class="matrix-status" role="status">
                    Building the Shape Matrix…
                  </p>
                {:else}
                  <ShapeMatrixGrid
                    data={previewMatrix}
                    {rowAxis}
                    {colAxis}
                    maxCellPx={108}
                    selectedPair={explorer.selectedPair}
                    soloHand={explorer.soloHand}
                    onselect={(pair) =>
                      explorer.chooseMatrixPair(pair, buildMatrixSequence)}
                    onsolo={(hand, flower) =>
                      explorer.chooseMatrixSolo(
                        hand,
                        flower,
                        pairAtTurns(DEFAULT_PAIR, leftTurn, rightTurn),
                        buildMatrixSequence
                      )}
                  />
                {/if}
              </div>
            {:else}
              <!-- The browsed sequence's card, with the notation the player is
                   reading. The path controls change the animation, not the
                   notation, so the card stays put while the path switches.
                   Contained, the card picks the grid that best fills the
                   matrix's square. -->
              <div class="card-stage">
                <ChoreoCard
                  sequence={explorer.browsed}
                  showWord
                  showStepNumbers
                  includeStartPlacement={false}
                  showDifficultyLevel={false}
                  showNotes={false}
                  showLoopGlyph={false}
                  darkMode
                  leftPropType={PropType.STAFF}
                  rightPropType={PropType.STAFF}
                  hideSoloHeader
                  forceContain
                  fitWidth
                />
              </div>
            {/if}
          </Crossfade>
        </div>
      </section>
    {/if}
  </div>
</section>

{#if pickerOpen}
  {#await import("$lib/shared/components/sequence-picker/SequencePickerModal.svelte")}
    <p role="status">Loading sequence picker…</p>
  {:then { default: SequencePickerModal }}
    <SequencePickerModal
      open
      onClose={() => (pickerOpen = false)}
      onSelect={(sequence) => explorer.chooseSequence(sequence)}
      title="Compare a sequence’s motion paths"
    />
  {:catch}
    <p role="alert">The sequence picker could not load.</p>
    <PanelButton onclick={() => (pickerOpen = false)}>Close</PanelButton>
  {/await}
{/if}

<style>
  .explorer {
    container-type: inline-size;
    min-width: 0;
    /* Under the fixed site header when something scrolls to it. */
    scroll-margin-top: calc(56px + var(--spacing-md, 16px));
  }
  .explorer-workspace,
  .chooser {
    display: grid;
    align-items: start;
    gap: var(--spacing-lg, 24px);
    min-width: 0;
  }
  .chooser {
    gap: var(--spacing-sm, 8px);
    padding-top: var(--spacing-md, 16px);
    border-top: 1px solid var(--theme-stroke);
  }
  .source-controls,
  .matrix-controls {
    display: grid;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .picker-heading,
  .transport,
  .transport-buttons,
  .now-playing {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: 44px;
  }
  .picker-heading :global(.segmented-control) {
    flex: 1;
  }
  .browse-row {
    margin-block: var(--spacing-xs, 4px);
  }
  /* Stacked, the stage is a square as wide as the matrix reads well; the
     layers inside fill it, so the card takes the matrix's square and the
     swap changes nothing below. */
  .source-stage {
    position: relative;
    width: 100%;
    max-width: 34rem;
    aspect-ratio: 1;
    min-width: 0;
  }
  .card-stage {
    width: 100%;
    height: 100%;
    min-width: 0;
  }
  .stage-label {
    margin: 0;
    margin-right: auto;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }
  .turn-picker {
    display: grid;
    gap: var(--spacing-xs, 4px);
    min-width: 0;
    margin-block: var(--spacing-xs, 4px);
    container-type: inline-size;
  }
  .control-label {
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
  }
  .matrix-stage {
    height: 100%;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-panel-bg);
  }
  .matrix-status {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--spacing-sm, 8px);
    height: 100%;
    margin: 0;
    padding: var(--spacing-md, 16px);
    color: var(--theme-text-muted);
    text-align: center;
  }
  .matrix-status p {
    margin: 0;
  }
  .matrix-status.error {
    color: var(--semantic-error);
  }
  .picker-feedback {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: 2.8em;
    color: var(--theme-text-muted);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
  .motion-column,
  .path-column {
    min-width: 0;
    width: 100%;
  }
  .motion-column {
    max-width: 580px;
    margin-inline: auto;
  }
  /* Stacked, the canvas and the first row of tiles share one phone screen,
     and the chooser opens right under the button that names it. Side by
     side, the path comes first; the placements below make that explicit. */
  .path-column {
    order: 1;
  }
  .animation {
    position: relative;
    aspect-ratio: 1;
  }
  .motion-stage {
    width: 100%;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    color: var(--theme-text-muted);
  }
  .transport {
    flex-wrap: wrap;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .now-playing {
    justify-content: flex-end;
    margin-top: var(--spacing-sm, 8px);
  }
  .now-playing > :global(button) {
    flex-shrink: 0;
  }
  .chooser-chevron {
    margin-left: var(--spacing-xs, 4px);
    transition: transform var(--duration-fast) var(--ease-out);
  }
  .chooser-chevron.open {
    transform: rotate(180deg);
  }
  .relationship {
    min-width: 0;
  }
  .path-column :global(.path-header) {
    align-items: center;
    min-height: 44px;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .path-column :global(.rt-section-label) {
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    flex-shrink: 0;
  }
  .path-column :global(.path-shape-grid) {
    margin-top: 0;
  }
  .trace-choice {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin-left: auto;
    min-width: 0;
  }
  /* A set width, not a flex basis: the row sizes itself from content, and
     a basis is not content, so the control would shrink to the labels and
     wrap the longer one. */
  .trace-choice :global(.segmented-control) {
    flex: 0 1 auto;
    width: 13rem;
    max-width: 100%;
  }
  @container (min-width: 640px) {
    .explorer-workspace {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .path-column {
      display: grid;
      grid-column: 1;
      grid-row: 1;
      grid-template-rows: auto minmax(0, 1fr);
      align-self: stretch;
      order: 0;
    }
    .motion-column {
      grid-column: 2;
      grid-row: 1;
      display: flex;
      flex-direction: column;
      align-self: stretch;
    }
    .motion-stage {
      margin-bottom: auto;
    }
    .path-column :global(.path-shape-grid) {
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
    .chooser {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
  /* Two columns in the chooser only once the controls column can hold the
     timing chips unclipped. The columns match the workspace so the stage
     sits under the canvas and the controls under the tiles. The stage
     stretches to the row the controls set and takes its width from that. */
  @container (min-width: 900px) {
    .chooser {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: var(--spacing-lg, 24px);
    }
    .source-controls {
      grid-column: 1;
      align-self: start;
    }
    .source-stage {
      grid-column: 2;
      align-self: stretch;
      justify-self: center;
      width: auto;
      max-width: 100%;
      min-height: 20rem;
      max-height: 34rem;
    }
  }
  @container (min-width: 1100px) {
    .motion-column {
      max-width: 640px;
    }
  }
  /* Fit mode: the same two thresholds as the script. The workspace takes the
     viewport under the 56px site header, the top row gets a little more than
     the bottom (its transport and caption rows are fixed), and each box is
     the largest square its quadrant holds. Capped where the natural layout
     already fits. */
  @container (min-width: 900px) {
    @media (min-height: 900px) {
      .explorer-workspace {
        height: min(calc(100dvh - 56px - 2 * var(--spacing-md, 16px)), 1400px);
        grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
        align-items: stretch;
      }
      .path-column,
      .motion-column,
      .path-column :global(.path-shape-grid) {
        min-height: 0;
      }
      .motion-stage {
        display: flex;
        justify-content: center;
        flex: 1 1 0;
        min-height: 0;
        margin-bottom: 0;
      }
      .animation {
        height: 100%;
        width: auto;
        max-width: 100%;
      }
      .chooser {
        grid-template-rows: minmax(0, 1fr);
        align-self: stretch;
        min-height: 0;
      }
      /* The controls fill the row: heading, then the crossfaded controls,
         then the status strip. The crossfade's layers fill that middle box,
         so a source switch changes nothing the page anchors its scroll to,
         and the chip row takes what the turn picker leaves. */
      .source-controls {
        display: flex;
        flex-direction: column;
        align-self: stretch;
        min-height: 0;
      }
      .source-controls > :global(.crossfade.fill) {
        flex: 1 1 0;
        height: auto;
        min-height: 0;
      }
      .matrix-controls {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      .relationship {
        flex: 1 1 0;
        min-height: 0;
      }
      .source-stage {
        align-self: center;
        height: 100%;
        min-height: 0;
        max-height: 34rem;
      }
    }
  }
</style>
