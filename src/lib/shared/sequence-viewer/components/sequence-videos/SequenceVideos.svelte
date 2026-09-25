<!--
  The portable Performance workspace used by compact viewer companions and
  focused test hosts. The primary Sequence Viewer composes the same state,
  stage, inspector, and editor directly into its persistent panel tracks.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getSequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { tryGetVideoPlayheadContext } from "../../context/video-playhead-context";
  import { createPerformanceWorkspaceState } from "./state/performance-workspace-state.svelte";
  import { setPerformanceWorkspaceContext } from "./context/performance-workspace-context";
  import PerformanceStage from "./PerformanceStage.svelte";
  import PerformanceInspector from "./PerformanceInspector.svelte";
  import PerformanceEditor from "./PerformanceEditor.svelte";

  interface Props {
    sequence: SequenceData;
    isOwned: boolean;
    active?: boolean;
    isLoggedIn?: boolean;
    bpm?: number;
    canUpload?: boolean;
    uploadRequested?: boolean;
    onSaveFirst?: () => Promise<void>;
    onSaveToLibrary?: () => void | Promise<void>;
    onUploadOpenChange?: (open: boolean) => void;
  }

  let {
    sequence,
    isOwned,
    active = true,
    isLoggedIn = false,
    bpm = 120,
    canUpload = false,
    uploadRequested = false,
    onSaveFirst,
    onSaveToLibrary,
    onUploadOpenChange,
  }: Props = $props();

  const workspace = createPerformanceWorkspaceState(
    {
      getSequence: () => sequence,
      getActive: () => active,
      getUploadRequested: () => uploadRequested,
      onWorkOpenChange: onUploadOpenChange,
    },
    {
      getStore: getSequenceVideosStore,
      playhead: tryGetVideoPlayheadContext(),
      onTimingSaved: () => toast.success(t("viewer_detail_timing_saved")),
    }
  );
  setPerformanceWorkspaceContext(workspace);

  const galleryState = $derived(
    workspace.store.loading
      ? "loading"
      : workspace.store.error
        ? "error"
        : workspace.videos.length > 0
          ? "ready"
          : "empty"
  );
</script>

<div
  class="sequence-videos"
  data-active={active}
  data-gallery-state={galleryState}
  data-performance-composition={workspace.view}
>
  {#if workspace.view === "browse"}
    <div class="performance-composition">
      <div class="performance-stage-pane">
        <PerformanceStage {sequence} {onSaveToLibrary} />
      </div>
      <div class="performance-inspector-pane">
        <PerformanceInspector {isOwned} {isLoggedIn} {canUpload} />
      </div>
    </div>
  {:else}
    <PerformanceEditor {sequence} {isOwned} {bpm} {onSaveFirst} />
  {/if}
</div>

<style>
  .sequence-videos {
    container-type: inline-size;
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .performance-composition {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
  }

  .performance-stage-pane,
  .performance-inspector-pane {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .performance-inspector-pane {
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  @container (max-width: 54rem) {
    .performance-composition {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(16rem, 1fr) minmax(16rem, 45%);
    }

    .performance-inspector-pane {
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
      border-left: none;
    }
  }

  @media (max-height: 34rem) {
    .performance-composition {
      grid-template-columns: minmax(0, 1fr) minmax(18rem, 38%);
      grid-template-rows: 1fr;
    }

    .performance-inspector-pane {
      border-top: none;
      border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    }
  }
</style>
