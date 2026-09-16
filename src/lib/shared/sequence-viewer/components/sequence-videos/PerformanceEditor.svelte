<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import StepMapEditor from "../step-mapping/StepMapEditor.svelte";
  import VideoUploadFlow from "./VideoUploadFlow.svelte";
  import { getPerformanceWorkspaceContext } from "./context/performance-workspace-context";

  interface Props {
    sequence: SequenceData;
    isOwned: boolean;
    bpm?: number;
    onSaveFirst?: () => Promise<void>;
  }

  let { sequence, isOwned, bpm = 120, onSaveFirst }: Props = $props();
  const workspace = getPerformanceWorkspaceContext();
</script>

<div class="performance-editor" data-performance-editor={workspace.view}>
  {#if workspace.view === "upload"}
    <VideoUploadFlow
      {sequence}
      {isOwned}
      hasExistingVideos={workspace.videos.length > 0}
      {onSaveFirst}
      onUploaded={workspace.handleUploaded}
      onCancel={workspace.returnToBrowsing}
    />
  {:else if workspace.view === "map" && workspace.mappingVideo}
    <StepMapEditor
      videoUrl={workspace.mappingVideo.videoUrl}
      videoDuration={workspace.mappingVideo.duration}
      steps={sequence.steps}
      startPlacement={sequence.startPlacement ?? sequence.startingPlacement}
      initialStepMap={workspace.mappingVideo.beatMap}
      draftKey={`${sequence.id}:${workspace.mappingVideo.id}`}
      {bpm}
      onSave={workspace.saveStepMap}
      onClose={workspace.returnToBrowsing}
    />
  {/if}
</div>

<style>
  .performance-editor {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }
</style>
