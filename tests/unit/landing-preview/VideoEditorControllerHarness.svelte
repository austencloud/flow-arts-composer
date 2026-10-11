<script lang="ts">
  import {
    createVideoEditorController,
    type VideoEditorController,
    type VideoEditorControllerOptions,
  } from "#lib/features/landing-preview/state/video-editor-controller.svelte.js";

  interface Props {
    options: VideoEditorControllerOptions;
    onReady: (controller: VideoEditorController) => void;
  }

  let { options, onReady }: Props = $props();
  const controller = createVideoEditorController(options);
  onReady(controller);
</script>
