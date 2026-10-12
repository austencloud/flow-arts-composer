<script lang="ts">
  import type { ToolPanelProps } from "@austencloud/video-editor";
  import PostArrangementTool from "./PostArrangementTool.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * An arrangement's panels. Grid and Speed are the item's own; Look and
   * Effects are the grid's, or the cell's over it when one is in hand;
   * Sequence, Layers, Offset and Effort belong to the cell in hand.
   */
  let { item, tool, locked, appearanceFill = false }: ToolPanelProps = $props();
  const tka = useTkaEditor();
  const editor = tka.editor;
</script>

{#if item?.kind === "arrangement"}
  {@const arrangement = item}
  {#if tool === "grid" || tool === "speed" || tool === "look" || tool === "effects" || tool === "effort" || tool === "layers" || tool === "offset" || (tool === "sequence" && editor.selectedCell !== null)}
    <PostArrangementTool
      {editor}
      item={arrangement}
      {tool}
      cell={editor.selectedCell}
      {locked}
      sequence={tka.displaySequence}
      fill={appearanceFill}
    />
  {/if}
{/if}
