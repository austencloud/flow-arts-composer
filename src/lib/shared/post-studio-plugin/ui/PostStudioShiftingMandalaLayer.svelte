<script lang="ts">
  /**
   * A mandala clip on the post's clock: the item's sequences, shift and look
   * go to `ShiftingMandala`, with beats counted by the item's clock from the
   * frame's post second. While exporting, the frame is stamped with its
   * source time so the export surface can wait for it.
   */
  import type { VideoEditorState } from "@austencloud/video-editor";
  import ShiftingMandala from "#lib/shared/mandala/components/ShiftingMandala.svelte";
  import type { ShiftingMandalaSource } from "#lib/shared/mandala/services/mandala-shift-render.js";
  import { getViewerAnimationPropConfig } from "#lib/shared/animation-engine/get-viewer-animation-prop-config.js";
  import type { PostMandalaItem } from "../item-kinds";
  import { mandalaItemClock, mandalaItemPostSeconds } from "../mandala-item-clock";

  let {
    editor,
    item,
    sourceTimeSeconds,
    exporting = false,
    exportSize = null,
  }: {
    editor: VideoEditorState;
    item: PostMandalaItem;
    sourceTimeSeconds: number;
    exporting?: boolean;
    /** The pixel size this layer fills in the exported file. */
    exportSize?: { width: number; height: number } | null;
  } = $props();

  const propTypes = getViewerAnimationPropConfig();
  const sources = $derived<ShiftingMandalaSource[]>(
    item.sequences.map((entry) => ({
      steps: entry.sequence.steps,
      leftPropType: propTypes.leftPropType,
      rightPropType: propTypes.rightPropType,
    }))
  );
  const clock = $derived(mandalaItemClock(editor.project, item));
  const beats = $derived(
    clock.beatsAt(mandalaItemPostSeconds(item, sourceTimeSeconds))
  );
  const stamp = $derived(exporting ? String(sourceTimeSeconds) : undefined);
</script>

<div class="mandala-layer">
  <ShiftingMandala
    {sources}
    shift={item.shift}
    look={item.look}
    {beats}
    beatsPerBar={clock.beatsPerBar}
    {stamp}
    exportSize={exporting ? exportSize : null}
  />
</div>

<style>
  .mandala-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
