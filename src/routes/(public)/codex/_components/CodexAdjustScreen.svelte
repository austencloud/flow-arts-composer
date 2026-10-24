<!--
  Every control the full board's rail holds, on one screen: a live preview,
  where each hand starts, then Turns, Transform (with Invert when opened
  from a letter) and Show. Opened from Home or a Type screen the controls
  change the board and the preview is that type's first letter; opened
  from a letter they change its variations and the preview is the
  selected one. The preview takes the height the controls leave; when the
  controls alone outgrow the area they pan inside it and the preview keeps
  96px.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PictographTypeFrame from "#lib/shared/pictograph/shared/components/PictographTypeFrame.svelte";
  import OrientationCycler from "#lib/features/create/construct/start-placement-picker/components/OrientationCycler.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    MotionType,
    type Orientation,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import CodexBoardControls from "../../atlas/_components/codex-boards/CodexBoardControls.svelte";
  import type { CodexExplorerState } from "../../atlas/_components/codex-boards/codex-explorer-state.svelte";
  import type { CodexStartOrientations } from "../_data/codex-orientation";
  import type { CodexScreen } from "../_data/codex-screen";
  import CodexScreenFrame from "./CodexScreenFrame.svelte";
  import { codexData } from "../_data/codex-groups";

  let {
    codex,
    screen,
    propType,
    startOrientations,
    onChooseStart,
    onResetAll,
    onBack,
    backLabel,
  }: {
    codex: CodexExplorerState;
    screen: CodexScreen;
    propType?: PropType;
    startOrientations?: CodexStartOrientations;
    onChooseStart?: (hand: "left" | "right", next: Orientation) => void;
    onResetAll: () => void;
    onBack: () => void;
    backLabel: string;
  } = $props();

  const onLetter = $derived(screen.letter !== null);

  function canRotate(motion: { motionType?: MotionType } | undefined): boolean {
    return (
      motion?.motionType === MotionType.DASH ||
      motion?.motionType === MotionType.STATIC
    );
  }
  const leftCanRotate = $derived(
    onLetter ? canRotate(codex.variations[0]?.motions?.left) : true
  );
  const rightCanRotate = $derived(
    onLetter ? canRotate(codex.variations[0]?.motions?.right) : true
  );

  // ── Fit ────────────────────────────────────────────────────────────────
  const MIN_PREVIEW = 96;
  const GAPS = 24; // the two 12px gaps between preview, start and controls
  let contentWidth = $state(0);
  let contentHeight = $state(0);
  let startHeight = $state(0);
  let controlsHeight = $state(0);
  const previewSize = $derived(
    Math.floor(
      Math.max(
        MIN_PREVIEW,
        Math.min(
          contentWidth - 24,
          contentHeight - startHeight - controlsHeight - GAPS
        )
      )
    )
  );
  const previewCell = $derived(codex.previewFor(screen.type));
  // One renderer for both previews, keyed by what it shows and nothing that
  // a control changes, so a rotate or a turn travels through the
  // pictograph's edit path (grid and props gliding together) instead of
  // remounting, the way the letter board's variation tiles do.
  const previewId = $derived(onLetter ? codex.info.id : previewCell.id);
  const previewShown = $derived(
    onLetter
      ? codex.draft
      : (codex.boardData?.(previewCell.id) ?? codexData(previewCell.id))
  );
  // The grid turns on the edit clock only when the drawing names its grid; a
  // loaded variation carries it on its motions alone until a transform
  // writes it, so the first rotate would turn the grid on its own timer.
  const previewData = $derived(
    previewShown && {
      ...previewShown,
      gridMode: previewShown.gridMode ?? previewShown.motions?.left?.gridMode,
    }
  );
</script>

<CodexScreenFrame
  title="Adjust"
  {onBack}
  {backLabel}
  bind:contentWidth
  bind:contentHeight
>
  <div class="adjust">
    <div
      class="preview"
      aria-hidden="true"
      data-codex-preview
      style:width={`${previewSize}px`}
      style:height={`${previewSize}px`}
      style:--codex-picto-size={`${previewSize}px`}
    >
      {#if previewData}
        <PictographTypeFrame letter={previewData.letter}>
          <div class="drawing">
            <PictographContainer
              pictographData={previewData}
              transitionKey={`codex-adjust-${previewId}`}
              themeOverride="dark"
              showGrid={onLetter || codex.visibility.showGrid}
              showTKA={onLetter || codex.visibility.showTKA}
              showReversals={!onLetter && codex.visibility.showReversals}
              showNonRadialPoints={onLetter
                ? previewData.motions?.left?.gridMode === GridMode.BOX
                : codex.visibility.showNonRadialPoints}
              showHandPoints={false}
              showTnD={!onLetter && codex.visibility.showGlyph}
              showElemental={!onLetter && codex.visibility.showGlyph}
              showPropTnD={false}
              showPlacements={!onLetter && codex.visibility.showPlacements}
              showHandColorKey={false}
              stepNumberOverride={false}
              leftPropTypeOverride={propType ?? PropType.STAFF}
              rightPropTypeOverride={propType ?? PropType.STAFF}
            />
          </div>
        </PictographTypeFrame>
      {/if}
    </div>

    {#if startOrientations}
      <div
        class="start"
        role="group"
        aria-labelledby="codex-adjust-start"
        bind:clientHeight={startHeight}
      >
        <span id="codex-adjust-start" class="start-label"
          >{tDynamic("guide_codex_start")}</span
        >
        <div class="cycler">
          <OrientationCycler
            orientation={startOrientations.left}
            onOrientationChange={(next) => onChooseStart?.("left", next)}
            color="blue"
          />
        </div>
        <div class="cycler">
          <OrientationCycler
            orientation={startOrientations.right}
            onOrientationChange={(next) => onChooseStart?.("right", next)}
            color="red"
          />
        </div>
      </div>
    {/if}

    <div class="controls-box">
      <div bind:clientHeight={controlsHeight}>
        {#if onLetter}
          <CodexBoardControls
            layout="stack"
            leftTurns={codex.leftTurns}
            rightTurns={codex.rightTurns}
            leftRotation={codex.leftRotation}
            rightRotation={codex.rightRotation}
            {leftCanRotate}
            {rightCanRotate}
            transformed={codex.explorerOps.length > 0}
            visibility={codex.visibility}
            onTurnsChange={codex.changeTurns}
            onRotationChange={codex.changeRotation}
            onTransform={codex.transformExplorer}
            onInvert={() => codex.transformExplorer("invert")}
            onResetTransforms={codex.resetExplorerTransforms}
            onResetTurns={codex.resetExplorerEdits}
            onToggleLayer={codex.toggleLayer}
          />
        {:else}
          <CodexBoardControls
            layout="stack"
            leftTurns={codex.leftTurns}
            rightTurns={codex.rightTurns}
            leftRotation={codex.leftRotation}
            rightRotation={codex.rightRotation}
            transformed={codex.transforms.length > 0}
            visibility={codex.visibility}
            onTurnsChange={codex.changeTurns}
            onRotationChange={codex.changeRotation}
            onTransform={codex.transformBoard}
            onResetTransforms={codex.resetTransforms}
            onResetTurns={codex.resetExplorerEdits}
            onToggleLayer={codex.toggleLayer}
          />
        {/if}
      </div>
    </div>
  </div>

  <!-- Reset all rides in the header, so the controls get the height a
       bottom row would take. -->
  {#snippet actions()}
    <FilterChipBase
      mode="action"
      size="md"
      label="Reset all"
      icon="fas fa-rotate-left"
      onclick={onResetAll}
    />
  {/snippet}
</CodexScreenFrame>

<style>
  .adjust {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .preview {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    --pictograph-type-frame-width: 0px;
    --pictograph-border: none;
  }

  .preview > :global(.pictograph-type-frame),
  .drawing {
    width: 100%;
    height: 100%;
  }

  /* One row on every width: the label, then the two hands sharing what is
     left, so the preview keeps the height a second row would take. */
  .start {
    flex: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 26rem;
  }

  .start-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .cycler {
    display: flex;
    min-width: 0;
  }

  /* The one inner pan: when the groups outgrow the area, they scroll inside
     their own box and the page stays still. */
  .controls-box {
    flex: 0 1 auto;
    width: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
</style>
