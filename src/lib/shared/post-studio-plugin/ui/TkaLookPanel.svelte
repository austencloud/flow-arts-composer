<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import AnimationPanel from "#lib/shared/animation-panel/components/AnimationPanel.svelte";
  import TkaArrangementTools from "./TkaArrangementTools.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The Look tool: an arrangement's own look when one is selected, else the
   * post's animation defaults (its prop and the animation's look).
   */
  let {
    editor,
    appearanceFill = false,
  }: { editor: VideoEditorState; appearanceFill?: boolean } = $props();

  const tka = useTkaEditor();
</script>

{#if editor.selectedItem?.kind === "arrangement"}
  <TkaArrangementTools
    {editor}
    item={editor.selectedItem}
    tool="look"
    locked={!editor.selectionEditable}
    {appearanceFill}
  />
{:else if tka.displaySequence}
  <AnimationPanel
  layout="sidebar"
  isExporting={false}
  isPlaying={editor.isPlaying}
  onPlaybackToggle={editor.togglePlayback}
  showTempoControls={false}
  showEffectsPlayback={false}
  selectedPropType={tka.selectedPropType}
  onPropChange={tka.choosePropType}
  sequence={tka.displaySequence}
/>
{/if}
