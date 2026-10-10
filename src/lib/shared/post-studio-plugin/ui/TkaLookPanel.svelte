<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /** The Animation defaults tool: the post's prop and the animation's look. */
  let { editor }: { editor: VideoEditorState } = $props();

  const tka = useTkaEditor();
</script>

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
