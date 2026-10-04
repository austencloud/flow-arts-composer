<script lang="ts">
  import SequenceViewerOrchestrator from "$lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte";
  import SequenceViewerShell from "$lib/shared/sequence-viewer/components/SequenceViewerShell.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  let {
    sequence,
    isMobile,
    onBack,
  }: {
    sequence: SequenceData;
    isMobile: boolean;
    onBack: () => void;
  } = $props();
</script>

<div class="inline-viewer">
  <SequenceViewerOrchestrator
    {sequence}
    {isMobile}
    initialViewerMode="animation"
    pathPolicyOverride={{ pathShape: "arc", motionAwarePaths: false }}
    onClose={onBack}
  >
    {#snippet children(ctx)}
      <SequenceViewerShell
        {ctx}
        {sequence}
        {isMobile}
        analyticsSource="browse_gallery"
        onClose={onBack}
        embedded
        navigation={{ label: "Back to sequences" }}
      />
    {/snippet}
  </SequenceViewerOrchestrator>
</div>

<style>
  .inline-viewer {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-radius: 0.7rem;
  }
  .inline-viewer :global(.drawer-viewer-container) {
    height: 100%;
    min-height: 0;
  }
</style>
