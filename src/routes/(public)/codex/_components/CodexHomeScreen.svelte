<!--
  The Codex's first screen when the full board does not fit: the prop row,
  the edit summary, and the six types as pressable tiles filling the rest,
  2 by 3 or 3 by 2, whichever gives the larger tile (typeTileGrid).
-->
<script lang="ts">
  import { flip } from "svelte/animate";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { flipDuration } from "#lib/shared/transitions/motion.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { CODEX_TYPE_BANDS } from "../../atlas/_components/codex-boards/codex-letters";
  import { CODEX_DEFAULT_PROP, CODEX_PROPS } from "../_data/codex-props";
  import { typeTileGrid } from "../_data/codex-fit";
  import type { CodexScreen } from "../_data/codex-screen";
  import CodexScreenFrame from "./CodexScreenFrame.svelte";
  import CodexEditSummary from "./CodexEditSummary.svelte";
  import CodexTypeTile from "./CodexTypeTile.svelte";

  let {
    propType,
    summary,
    onResetAll,
    onChooseProp,
    onGo,
  }: {
    propType?: PropType;
    summary: string | null;
    onResetAll: () => void;
    onChooseProp?: (next: PropType) => void;
    onGo: (screen: CodexScreen) => void;
  } = $props();

  const GAP = 12;
  let tilesWidth = $state(0);
  let tilesHeight = $state(0);
  const grid = $derived(typeTileGrid(tilesWidth, tilesHeight, GAP));
</script>

<CodexScreenFrame
  title="Codex"
  subtitle={tDynamic("guide_codex_intro")}
>
  <div class="props">
    <PropChoiceRow
      value={propType ?? CODEX_DEFAULT_PROP}
      options={CODEX_PROPS}
      iconOnly
      label={tDynamic("guide_codex_prop")}
      onchange={(next: PropType) => onChooseProp?.(next)}
    />
  </div>
  <CodexEditSummary text={summary} onReset={onResetAll} />
  <div
    class="tiles"
    bind:clientWidth={tilesWidth}
    bind:clientHeight={tilesHeight}
    style:grid-template-columns={`repeat(${grid.columns}, minmax(0, 1fr))`}
    style:grid-template-rows={`repeat(${grid.rows}, minmax(0, 1fr))`}
    style:gap={`${GAP}px`}
  >
    {#each CODEX_TYPE_BANDS as band (band.type.n)}
      <div class="slot" animate:flip={{ duration: flipDuration() }}>
        <CodexTypeTile
          {band}
          onOpen={(type) => onGo({ kind: "type", type, letter: null })}
        />
      </div>
    {/each}
  </div>

  {#snippet controls()}
    <PanelButton
      variant="secondary"
      onclick={() => onGo({ kind: "adjust", type: null, letter: null })}
    >
      <i class="fa-solid fa-sliders" aria-hidden="true"></i>
      Adjust
    </PanelButton>
    <PanelButton variant="secondary" href={localHref("/codex/print")}>
      {tDynamic("guide_codex_print")}
    </PanelButton>
  {/snippet}
</CodexScreenFrame>

<style>
  .props {
    flex: none;
    --prop-choice-justify: center;
    --prop-img-size: 1.75rem;
  }

  /* One row of props whatever the width: the tiles share it. */
  .props :global(.prop-grid) {
    flex-wrap: nowrap;
    gap: 6px;
    max-width: 30rem;
    margin-inline: auto;
  }

  .props :global(.prop-option) {
    flex: 1 1 0;
    min-width: 0;
    padding: 6px 4px;
  }

  .tiles {
    position: relative;
    display: grid;
    flex: 1;
    min-height: 0;
    padding-bottom: 4px;
  }

  .slot {
    min-width: 0;
    min-height: 0;
  }
</style>
