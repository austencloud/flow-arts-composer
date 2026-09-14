<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import PathShapePanel from "$lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import ShapeMatrixGrid from "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import ElementChipRow from "$lib/shared/shape-matrix/components/ElementChipRow.svelte";
  import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
  import { matrixFiltersForTurn } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    flowerKey,
    type Flower,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import { buildModeRealization } from "$lib/shared/shape-matrix/services/build-mode-realizations";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import GuideStepStrip from "../../level-1/_components/GuideStepStrip.svelte";
  import { sequenceToStrip } from "../../level-1/_data/guide-sequence-adapter";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { createMotionPathExplorerState } from "../_data/motion-path-explorer-state.svelte";
  import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import type { TurnValue } from "$lib/shared/create/services/level-turn-values";

  const explorer = createMotionPathExplorerState();
  setAnimationVisibilityContext(explorer.scope.visibility);
  let pickerOpen = $state(false);
  let ready = $state(false);
  let playerFailed = $state(false);
  let matrixData = $state<ShapeMatrixData | null>(null);
  let matrixError = $state<string | null>(null);
  let turnBand = $state<TurnValue>(0);
  let mounted = true;
  let matrixRequest = 0;
  const strip = $derived(sequenceToStrip(explorer.sequence));
  const matrixAxis = $derived(
    matrixData
      ? applyFilter(matrixData.axis, matrixFiltersForTurn(turnBand).left, false)
      : []
  );

  function chooseTurnBand(value: string): void {
    turnBand = Number(value) as TurnValue;
    explorer.clearMatrixPair();
  }

  async function loadMatrix(): Promise<void> {
    const request = ++matrixRequest;
    matrixError = null;
    matrixData = null;
    try {
      const data = await loadShapeMatrix(PropType.STAFF);
      if (mounted && request === matrixRequest) matrixData = data;
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
        tipPoint: matrixData.tipPoint,
        clubTipDx: matrixData.clubTipDx,
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
    return () => {
      mounted = false;
      preference.removeEventListener("change", pauseForReducedMotion);
    };
  });
</script>

<section class="explorer" aria-label="Motion path comparison">
  <div class="explorer-workspace">
    <section class="shape-picker" aria-labelledby="shape-picker-title">
      <div class="picker-heading">
        <div>
          <h3 id="shape-picker-title">Choose a sequence</h3>
          <p>Pick a shape pairing and its hand timing and direction.</p>
        </div>
        <PanelButton onclick={() => (pickerOpen = true)}
          >Browse sequences</PanelButton
        >
      </div>

      <div class="relationship-picker">
        <span class="control-label">Timing and direction</span>
        <ElementChipRow
          selected={explorer.selectedMode}
          columns={3}
          onpick={(mode) =>
            explorer.chooseHandRelationship(mode, buildMatrixSequence)}
        />
      </div>

      <div class="turn-picker">
        <span class="control-label">Turns</span>
        <SegmentedControl
          options={[
            { value: "0", label: "0 turns" },
            { value: "1", label: "1 turn" },
            { value: "2", label: "2 turns" },
          ]}
          value={String(turnBand)}
          ariaLabel="Shape Matrix turns"
          onchange={chooseTurnBand}
        />
      </div>

      <div class="matrix-stage" aria-busy={!matrixData && !matrixError}>
        {#if matrixError}
          <div class="matrix-status error" role="alert">
            <p>{matrixError}</p>
            <PanelButton onclick={() => void loadMatrix()}
              >Try again</PanelButton
            >
          </div>
        {:else if !matrixData}
          <p class="matrix-status" role="status">Building the Shape Matrix…</p>
        {:else}
          <ShapeMatrixGrid
            data={matrixData}
            rowAxis={matrixAxis}
            colAxis={matrixAxis}
            maxCellPx={108}
            selectedPair={explorer.selectedPair}
            onselect={(pair) =>
              explorer.chooseMatrixPair(pair, buildMatrixSequence)}
          />
        {/if}
      </div>

      <div class="picker-feedback" aria-live="polite">
        {#if explorer.pickerStatus === "loading"}
          <span>Building that sequence…</span>
        {:else if explorer.pickerError}
          <span role="alert">{explorer.pickerError}</span>
          <PanelButton onclick={explorer.retryMatrixSelection}
            >Try again</PanelButton
          >
        {:else if !explorer.selectedPair}
          <span>Pick a cell to compare its sequence.</span>
        {/if}
      </div>
      <p class="arc-reference">Matrix previews use Arc.</p>
    </section>

    <div class="comparison">
      <div class="motion-column">
        <div class="word">
          <TKAWordGlyph
            word={explorer.sequence.word}
            height={28}
            darkMode
            fitToParent
          />
        </div>
        <div class="animation" aria-label="Selected path animation">
          {#if browser}
            <InlineAnimationPlayer
              sequence={explorer.sequence}
              visibilityManagerOverride={explorer.scope.visibility}
              effectsConfigState={explorer.scope.effects}
              trailSettingsOverride={DEFAULT_TRAIL_SETTINGS}
              tipEffectMap={{}}
              tipEffortMap={{}}
              leftPropType={PropType.STAFF}
              rightPropType={PropType.STAFF}
              chrome="minimal"
              fill
              autoPlay={false}
              externalPlaying={explorer.playing}
              externalBpm={48}
              onExternalPlayingChange={(value) => (explorer.playing = value)}
              onStepChange={(value) => (explorer.liveStep = value)}
              onReady={() => {
                ready = true;
                playerFailed = false;
              }}
              onLoadError={() => {
                ready = true;
                playerFailed = true;
              }}
              showControls={false}
              showPositionGlyph
              beatIndicators={false}
              disableContextMenu
            />
          {/if}
          {#if !ready}<span class="loading" role="status"
              >Loading animation…</span
            >{/if}
        </div>
        <div class="transport">
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
      </div>

      <div class="path-column">
        <PathShapePanel
          showHelp={false}
          onSettingChange={() => explorer.syncPolicy()}
        >
          {#snippet preview(path, size)}
            <SequenceMandala
              sequence={explorer.variants[path]}
              pathShape={path}
              {size}
              mode="gallery"
              darkMode
              leftPropType={PropType.STAFF}
              rightPropType={PropType.STAFF}
              tipDx={explorer.trace === "hands" ? 0 : undefined}
              animate={false}
            />
          {/snippet}
        </PathShapePanel>
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
        <p class="comparison-note">
          Hands traces the hand centers. Prop tips includes the staff rotation.
        </p>
      </div>
    </div>
  </div>

  <p class="scope-note">
    Changes here stay in this explorer. Your saved paths and defaults stay as
    they were.
  </p>
  <div class="notation" aria-label="Sequence notation">
    <GuideStepStrip
      items={strip}
      stepLabels={strip.map((_, index) =>
        index === 0 && explorer.sequence.startPosition
          ? "Start"
          : String(index + (explorer.sequence.startPosition ? 0 : 1))
      )}
      activeBeat={explorer.liveStep < 1 ? 0 : Math.floor(explorer.liveStep)}
      render={{ propType: PropType.STAFF, showTKA: true }}
      picTheme="dark"
    />
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
  }
  .shape-picker {
    display: grid;
    gap: var(--spacing-md, 16px);
    margin-bottom: var(--spacing-xl, 32px);
  }
  .explorer-workspace {
    display: grid;
    gap: var(--spacing-xl, 32px);
    align-items: start;
  }
  .picker-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
  }
  .picker-heading h3,
  .picker-heading p {
    margin: 0;
  }
  .picker-heading h3 {
    color: var(--theme-text);
    font-size: var(--font-size-lg, 18px);
  }
  .picker-heading p,
  .comparison-note,
  .scope-note {
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
    line-height: 1.6;
  }
  .picker-heading p {
    margin-top: var(--spacing-xs, 4px);
  }
  .relationship-picker {
    display: grid;
    gap: var(--spacing-xs, 4px);
  }
  .turn-picker {
    display: grid;
    gap: var(--spacing-xs, 4px);
    max-width: 22rem;
  }
  .control-label {
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
  }
  .matrix-stage {
    height: min(70cqw, 34rem);
    min-height: 18rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
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
    min-height: 44px;
    color: var(--theme-text-muted);
    font-size: var(--font-size-sm, 14px);
  }
  .arc-reference {
    margin: 0;
    color: var(--theme-text-muted);
    font-size: var(--font-size-compact, 12px);
  }
  .comparison {
    display: grid;
    gap: var(--spacing-lg, 24px);
    align-items: center;
  }
  .motion-column,
  .path-column {
    min-width: 0;
  }
  .word {
    display: flex;
    justify-content: center;
    height: 32px;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .animation {
    position: relative;
    aspect-ratio: 1;
    max-width: 540px;
    margin-inline: auto;
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
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-sm, 8px);
    min-height: 44px;
  }
  .trace-choice {
    display: grid;
    gap: var(--spacing-xs, 4px);
    max-width: 320px;
    margin-top: var(--spacing-md, 16px);
  }
  .comparison-note {
    min-height: 3.2em;
    margin-bottom: 0;
  }
  .scope-note {
    margin-block: var(--spacing-lg, 24px);
  }
  .notation {
    min-width: 0;
  }
  @container (min-width: 680px) {
    .comparison {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    }
    .shape-picker {
      grid-template-columns: minmax(15rem, 0.45fr) minmax(0, 1fr);
      align-items: start;
    }
    .picker-heading {
      grid-column: 1 / -1;
    }
    .relationship-picker {
      grid-column: 1;
      grid-row: 2;
    }
    .turn-picker {
      grid-column: 1;
      grid-row: 3;
    }
    .matrix-stage {
      grid-column: 2;
      grid-row: 2 / span 2;
      height: min(46cqw, 34rem);
    }
    .picker-feedback,
    .arc-reference {
      grid-column: 1 / -1;
    }
  }
  @container (min-width: 1000px) {
    .explorer-workspace {
      display: grid;
      grid-template-columns: minmax(22rem, 26rem) minmax(0, 1fr);
    }
    .shape-picker {
      grid-column: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      margin: 0;
    }
    .picker-heading,
    .picker-feedback,
    .arc-reference,
    .relationship-picker,
    .turn-picker,
    .matrix-stage {
      grid-column: auto;
      grid-row: auto;
    }
    .relationship-picker {
      position: static;
    }
    .matrix-stage {
      height: min(25cqw, 25rem);
      min-height: 20rem;
    }
    .comparison {
      grid-column: 2;
      grid-row: 1;
    }
    .scope-note,
    .notation {
      grid-column: auto;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .matrix-stage {
      scroll-behavior: auto;
    }
  }
</style>
