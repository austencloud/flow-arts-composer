<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import { useEditorUi } from "@austencloud/video-editor/ui";

  let { editor, active }: { editor: VideoEditorState; active: boolean } =
    $props();
  const { services } = useEditorUi();
  let anchor = $state<HTMLSpanElement | null>(null);

  $effect(() => {
    if (!active || !anchor) return;
    return services.shortcuts.editHistory(
      {
        undo: () => editor.undo(),
        redo: () => editor.redo(),
        canUndo: () => editor.canUndo,
        canRedo: () => editor.canRedo,
      },
      anchor
    );
  });
</script>

<!-- The host may mount key targets here (tka: its undo bridge), so the anchor is never hidden:
     no hidden, aria-hidden or display: none, which tka's resolver skips (shortcut-target-resolution.ts:17-31). -->
<span class="history-keys" bind:this={anchor}></span>
