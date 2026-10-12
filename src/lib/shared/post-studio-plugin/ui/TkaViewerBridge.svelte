<script lang="ts">
  import { untrack } from "svelte";
  import { getViewerStudioSurfaces } from "#lib/shared/sequence-viewer/context/viewer-studio-surfaces-context.js";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The sequence viewer's shell around the post editor: its side inspector,
   * its play controls and its shared play state. It renders nothing.
   * TkaEditorScope renders it before the editor.
   */
  const tka = useTkaEditor();
  const editor = tka.editor;
  const sharedSurfaces = getViewerStudioSurfaces();

  // A pre effect runs as the bridge mounts, before the editor after it, so
  // the editor's first layout already knows the viewer's inspector.
  $effect.pre(() => {
    tka.setInspectorTarget(sharedSurfaces?.externalInspectorTarget ?? null);
  });

  // The viewer shell shows the studio's own panel in its side inspector.
  $effect(() => {
    if (tka.active) sharedSurfaces?.setInspectorContent("studio");
  });

  $effect(() =>
    sharedSurfaces?.setControls(() => ({
      playing: editor.isPlaying,
      bpm: 60,
      propType: tka.selectedPropType,
      toggle: editor.togglePlayback,
      setBpm: () => undefined,
      setProp: tka.choosePropType,
    }))
  );

  let sharedEntryRevision = 0;
  $effect(() => {
    if (!tka.active || !sharedSurfaces?.active) return;
    const entry = sharedSurfaces.entry;
    if (entry.revision === sharedEntryRevision) return;
    sharedEntryRevision = entry.revision;
    untrack(() => {
      if (editor.isPlaying !== entry.playing && editor.mode !== "timing") {
        editor.togglePlayback();
      }
    });
  });
</script>
