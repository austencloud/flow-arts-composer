<!--
  One letter's variations, alone on the screen, in the largest cells that
  hold all of them (LetterVariations, floor 72px). Below the floor, on a very
  short landscape window, they become one row that pans sideways inside its
  own area. The deck is dealt from the Type screen's cell, as the dialog
  deals it from the board.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import LetterVariations from "../../atlas/_components/codex-boards/LetterVariations.svelte";
  import CodexLetterGlyph from "../../atlas/_components/codex-boards/CodexLetterGlyph.svelte";
  import type { CodexExplorerState } from "../../atlas/_components/codex-boards/codex-explorer-state.svelte";
  import { CODEX_TYPE_BANDS } from "../../atlas/_components/codex-boards/codex-letters";
  import { codexTypeWord } from "../_data/codex-groups";
  import type { CodexScreen } from "../_data/codex-screen";
  import CodexScreenFrame from "./CodexScreenFrame.svelte";
  import CodexEditSummary from "./CodexEditSummary.svelte";

  let {
    codex,
    screen,
    propType,
    summary,
    onResetAll,
    onGo,
    onBack,
  }: {
    codex: CodexExplorerState;
    screen: CodexScreen;
    propType?: PropType;
    summary: string | null;
    onResetAll: () => void;
    onGo: (screen: CodexScreen) => void;
    onBack: () => void;
  } = $props();

  const typeBand = $derived(
    CODEX_TYPE_BANDS.find((b) => b.type.n === screen.type)
  );
  const title = $derived(
    codex.shownInfo.name
      ? `${codex.shownLabel} · ${codex.shownInfo.name}`
      : codex.shownLabel
  );

  let areaWidth = $state(0);
  let areaHeight = $state(0);
</script>

<CodexScreenFrame
  {title}
  {onBack}
  backLabel={typeBand
    ? codexTypeWord(typeBand.type).replace(/:\s*$/, "")
    : "Codex"}
>
  {#snippet titleContent()}
    <CodexLetterGlyph letter={codex.shownLabel} />
    {#if codex.shownInfo.name}
      <span class="letter-name">{codex.shownInfo.name}</span>
    {/if}
  {/snippet}
  {#snippet actions()}
    <FilterChipBase
      mode="action"
      size="md"
      label="Adjust"
      icon="fas fa-sliders"
      onclick={() => onGo({ ...screen, kind: "adjust" })}
    />
    <FilterChipBase
      mode="action"
      size="md"
      label="Links"
      icon="fas fa-link"
      onclick={() => onGo({ ...screen, kind: "links" })}
    />
  {/snippet}

  <CodexEditSummary text={summary} onReset={onResetAll} />
  <div
    class="area"
    bind:clientWidth={areaWidth}
    bind:clientHeight={areaHeight}
  >
    <LetterVariations
      label={codex.shownLabel}
      tileKey={`${codex.info.id}-${codex.gridMode}`}
      variations={codex.editedVariations}
      selectedIndex={codex.selectedVariationIndex}
      {propType}
      fan={codex.fan}
      width={areaWidth}
      height={Math.max(0, areaHeight - 8)}
      overflow="pan"
      minFitCell={72}
      isLoading={codex.isLoading}
      loadError={codex.loadError}
      onRetry={() => codex.loadGrid(codex.gridMode)}
    />
  </div>
</CodexScreenFrame>

<style>
  .area {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding-bottom: 8px;
    box-sizing: border-box;
    --pictograph-border: none;
  }

  /* The load states and a panning row take the area's width. */
  .area > :global(*) {
    max-width: 100%;
  }

  .area > :global(.load-state) {
    width: 100%;
    height: 100%;
  }

  .letter-name {
    color: var(--theme-text);
  }
</style>
