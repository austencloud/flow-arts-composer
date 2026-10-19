<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import { updateItem, type PostItemPatch } from "@austencloud/video-editor/core";
  import AnimationPanel from "#lib/shared/animation-panel/components/AnimationPanel.svelte";
  import { mandalaItemClock } from "../mandala-item-clock";
  import MandalaShiftLookPanel from "./MandalaShiftLookPanel.svelte";
  import TkaArrangementTools from "./TkaArrangementTools.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The Look tool: an arrangement's or a mandala clip's own look when one is
   * selected, else the post's animation defaults (its prop and the
   * animation's look).
   */
  let {
    editor,
    appearanceFill = false,
  }: { editor: VideoEditorState; appearanceFill?: boolean } = $props();

  const tka = useTkaEditor();

  const mandala = $derived(
    editor.selectedItem?.kind === "mandala" ? editor.selectedItem : null
  );
  const NO_GRID_NOTE =
    "No beat grid yet: shifting at 120 BPM. Set the music's beats to lock it to the song.";
  const gridNote = $derived(
    mandala && !mandalaItemClock(editor.project, mandala).hasGrid
      ? NO_GRID_NOTE
      : null
  );

  function patchMandala(patch: PostItemPatch): void {
    const item = mandala;
    if (!item || !editor.selectionEditable) return;
    editor.edit((project, ctx) => updateItem(project, item.id, patch, ctx));
  }
</script>

{#if mandala}
  <MandalaShiftLookPanel
    shift={mandala.shift}
    look={mandala.look}
    locked={!editor.selectionEditable}
    {gridNote}
    onShift={(patch) => patchMandala({ shift: { ...mandala.shift, ...patch } })}
    onLook={(patch) => patchMandala({ look: { ...mandala.look, ...patch } })}
  />
{:else if editor.selectedItem?.kind === "arrangement"}
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
