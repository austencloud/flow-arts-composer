<!--
  The full board: every type band (BoardAtlas) with the controls in a rail
  beside it, and the letter explorer as a dialog dealt from the clicked cell.
  /codex shows it when every cell can be at least 80px with nothing
  scrolling (codex-fit.ts); the page hands over that cell size. Without a
  cell (an older host, no fit decided) the controls sit in a row above the
  board instead.
-->
<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import OrientationCycler from "#lib/features/create/construct/start-placement-picker/components/OrientationCycler.svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import BoardAtlas from "./BoardAtlas.svelte";
  import LetterExplorer from "./LetterExplorer.svelte";
  import CodexBoardControls from "./CodexBoardControls.svelte";
  import CodexLetterGlyph from "./CodexLetterGlyph.svelte";
  import { CODEX_DEFAULT_PROP, CODEX_PROPS } from "../../../codex/_data/codex-props";
  import { RAIL_GAP_REM, RAIL_REM } from "../../../codex/_data/codex-fit";
  import type { CodexStartOrientations } from "../../../codex/_data/codex-orientation";
  import type { CodexExplorerState } from "./codex-explorer-state.svelte";

  let {
    codex,
    propType,
    startOrientations,
    onChooseProp,
    onChooseStart,
    cell,
  }: {
    codex: CodexExplorerState;
    propType?: PropType;
    startOrientations?: CodexStartOrientations;
    onChooseProp?: (next: PropType) => void;
    onChooseStart?: (hand: "left" | "right", next: Orientation) => void;
    /** The board's cell in px (fullBoardCell). Given, the controls stand in
     *  a rail beside the board and the board is drawn at this size. */
    cell?: number;
  } = $props();

  const rail = $derived(cell !== undefined && codex.boardControls);

  let headerHeight = $state(0);
</script>

{#snippet controls(layout: "row" | "rail")}
  <CodexBoardControls
    {layout}
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
{/snippet}

<div
  class="codex codex-dark"
  class:with-rail={rail}
  data-codex-mode={rail ? "full-board" : undefined}
  data-codex-screen={rail ? (codex.overlayOpen ? "letter" : "home") : undefined}
  style:--codex-rail-w={`${RAIL_REM}rem`}
  style:--codex-rail-gap={`${RAIL_GAP_REM}rem`}
  onpointerdowncapture={codex.notePress}
  onkeydowncapture={codex.notePress}
>
  {#if codex.boardControls && !rail}
    {@render controls("row")}
  {/if}
  <div
    class="board"
    class:fit={rail}
    style:--codex-picto-size-override={rail ? `${cell}px` : undefined}
  >
    <BoardAtlas
      onSelect={codex.select}
      {propType}
      getData={codex.boardData}
      visibility={codex.boardControls ? codex.visibility : undefined}
    />
  </div>
  {#if rail}
    <aside class="rail" aria-label={tDynamic("guide_codex_prop")}>
      <div class="props">
        <PropChoiceRow
          value={propType ?? CODEX_DEFAULT_PROP}
          options={CODEX_PROPS}
          iconOnly
          label={tDynamic("guide_codex_prop")}
          onchange={(next: PropType) => onChooseProp?.(next)}
        />
      </div>
      {#if startOrientations}
        <div class="start" role="group" aria-labelledby="codex-rail-start">
          <span id="codex-rail-start" class="start-label"
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
      {@render controls("rail")}
      <div class="print">
        <PanelButton variant="secondary" href={localHref("/codex/print")}>
          {tDynamic("guide_codex_print")}
        </PanelButton>
      </div>
    </aside>
  {/if}
</div>

<BaseModal
  bind:open={codex.overlayOpen}
  size="fit"
  animation={codex.fanning ? "none" : "pop"}
  labelledBy="codex-overlay-title"
  class="codex-explorer-modal codex-dark"
  onclose={codex.closeExplorer}
>
  {#snippet header()}
    <div bind:clientHeight={headerHeight}>
      <ModalHeader
        id="codex-overlay-title"
        title={codex.shownInfo.name
          ? `${codex.shownLabel} · ${codex.shownInfo.name}`
          : codex.shownLabel}
        iconColor={codex.shownInfo.typeColor}
        onClose={codex.closeExplorer}
      >
        {#snippet titleContent()}
          <Crossfade key={codex.shownLabel} duration={DURATION.normal}>
            <CodexLetterGlyph letter={codex.shownLabel} />
          </Crossfade>
        {/snippet}
      </ModalHeader>
    </div>
  {/snippet}
  <LetterExplorer
    label={codex.shownLabel}
    tileKey={`${codex.info.id}-${codex.gridMode}`}
    variations={codex.editedVariations}
    selectedIndex={codex.selectedVariationIndex}
    leftTurns={codex.leftTurns}
    rightTurns={codex.rightTurns}
    leftRotation={codex.leftRotation}
    rightRotation={codex.rightRotation}
    transformed={codex.explorerOps.length > 0}
    isLoading={codex.isLoading}
    loadError={codex.loadError}
    learningMatches={codex.learningMatches}
    learningError={codex.learningError}
    composerHref={codex.composerHref}
    {headerHeight}
    onTurnsChange={codex.changeTurns}
    onRotationChange={codex.changeRotation}
    onResetTurns={codex.resetExplorerEdits}
    onTransform={codex.transformExplorer}
    onResetTransforms={codex.resetExplorerTransforms}
    onRetry={() => codex.loadGrid(codex.gridMode)}
    onLearningRetry={codex.loadLearningDeck}
    onCopyLink={codex.copyExactLink}
    {propType}
    fan={codex.fan}
  />
</BaseModal>

<style>
  .codex {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.35rem 0 0;
  }

  /* The board takes the width the rail leaves, at the cell size the page
     decided; the rail holds every control, top to bottom, and never
     scrolls: if its groups outgrow the height, the Show chips wrap. */
  .codex.with-rail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--codex-rail-w);
    gap: var(--codex-rail-gap);
    height: 100%;
    min-height: 0;
    padding: 0;
  }

  .board.fit {
    container: codex-atlas-fit / size;
    min-width: 0;
    min-height: 0;
  }

  .rail {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
    overflow: hidden;
  }

  .props {
    --prop-choice-justify: center;
    --prop-img-size: 2rem;
  }

  .start {
    display: grid;
    justify-items: center;
    gap: 6px;
  }

  .start-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .cycler {
    display: flex;
    width: 9.5rem;
  }

  .print {
    display: flex;
    justify-content: center;
    margin-top: auto;
  }
</style>
