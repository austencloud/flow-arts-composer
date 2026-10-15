<!--
  Every codex box, in sheet order, wrapped to whatever width it is given.

  Boxes are atomic: a shared-transition group (ABC, S-V, the Y/Z pair) never
  splits across a wrap, so the grouping the codex actually means survives the
  reflow. Type identity - which the printed page carried through its geometry -
  is carried by the historical nested borders on each pictograph.

  Sizing is the host's: set --codex-picto-size and the flow re-packs itself.
  Rendering is CodexBox's and CodexCell's. Nothing is re-implemented here.
-->
<script lang="ts">
  import CodexBox from "../../../guide/codex/_components/CodexBox.svelte";
  import CodexTransitionGlyph from "../../../guide/codex/_components/CodexTransitionGlyph.svelte";
  import { CODEX_BOXES, type TaggedBox } from "./codex-letters";
  import { codexTypeLabel } from "../../../guide/codex/_data/codex-groups";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  let {
    onSelect,
    /** Which boxes to flow. Defaults to the whole codex in sheet order; a
     *  type-banded board passes one type's boxes per band. */
    boxes = CODEX_BOXES,
    /** A transition shared by the complete flow rather than its first box.
     *  Atlas uses this for the Type 1 gamma land, where the printed sheet only
     *  repeats the caption over M-O even though it describes M-V. */
    flowHeader,
    /** The prop drawn in every cell; omitted keeps the dataset's own. */
    propType,
  }: {
    onSelect: (id: string) => void;
    boxes?: TaggedBox[];
    flowHeader?: string;
    propType?: PropType;
  } = $props();

  function boxForFlow(tagged: TaggedBox, index: number) {
    if (index !== 0 || tagged.box.header !== flowHeader) return tagged.box;
    return { ...tagged.box, header: undefined };
  }
</script>

<div class="flow">
  {#if flowHeader}
    <div class="flow-head">
      <CodexTransitionGlyph text={flowHeader} />
    </div>
  {/if}
  {#each boxes as tagged, index (tagged.key)}
    <div class="abox" aria-label={codexTypeLabel(tagged.type)}>
      <!-- Flat-board captions all occupy this same reserved header slot. The
           print sheet keeps its original per-cell placement. -->
      <CodexBox
        box={boxForFlow(tagged, index)}
        theme="dark"
        reserveHead
        showName={false}
        {propType}
        onCellSelect={onSelect}
      />
    </div>
  {/each}
</div>

<style>
  .flow {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    justify-content: var(--codex-flow-justify, flex-start);
    gap: var(--codex-flow-row-gap, 0.4rem) var(--abox-gap, 0.4rem);
    /* A dense reference grid needs a stable cell matrix. Keep the shared
       selected ring, but do not enlarge one pictograph beyond its neighbors. */
    --selection-selected-transform: none;
  }

  /* Some sheet captions describe a complete position land even though print
     places them over its first box. The flat Atlas gives that relationship one
     centered owner while every box keeps the same reserved header geometry. */
  .flow-head {
    position: absolute;
    inset: 0 0 auto;
    height: 1.25rem;
    display: flex;
    align-items: baseline;
    justify-content: center;
    color: var(--codex-transition, #1a1a1a);
    pointer-events: none;
  }

  /* Every flat-board box reserves the same header height. Grouped transitions
     fill it once; the split Type 4-6 boxes each fill their own header. */
  .flow :global(.box-head) {
    height: 1.25rem;
    min-height: 0;
  }
  .abox {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
</style>
