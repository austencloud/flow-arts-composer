<!--
  VideoRecordDrawer.svelte

  Full-height drawer for camera-based video recording.
  Used in Create and Library modules for low-stakes "proof of completion" videos.
-->
<script lang="ts">
  import { getContext } from "svelte";
  import PanelHeader from "#lib/shared/create/components/PanelHeader.svelte";
  import VideoRecordPanel from "./VideoRecordPanel.svelte";
  import type { RecordingResult } from "../services/types";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let {
    show = $bindable(false),
    sequence = null,
    onClose,
    onSave,
    heading = "Record Video",
  }: {
    show?: boolean;
    sequence?: SequenceData | null;
    onClose?: () => void;
    onSave?: (recording: RecordingResult) => void;
    heading?: string;
  } = $props();

  function handleClose() {
    show = false;
    onClose?.();
  }

  function handleSave(recording: RecordingResult) {
    onSave?.(recording);
    handleClose();
  }

  // Read create-module context directly via Svelte's getContext.
  // Avoids any import from features/ — the context is set by CreateModule
  // and we only need the layout boolean.
  const createModuleCtx = getContext<{ layout: { shouldUseSideBySideLayout: boolean } } | undefined>("createModule");

  // Lazy-loaded to avoid shared/ → features/ static imports
  let CreatePanelDrawer = $state<any>(null);
  let isSideBySideLayout = $derived(createModuleCtx?.layout.shouldUseSideBySideLayout ?? false);

  import("#lib/features/create/shared/components/CreatePanelDrawer.svelte").then(m => { CreatePanelDrawer = m.default; });
</script>

{#if CreatePanelDrawer}
<CreatePanelDrawer
  isOpen={show}
  panelName="video-record"
  fullHeightOnMobile={true}
  showHandle={true}
  closeOnBackdrop={true}
  focusTrap={false}
  lockScroll={false}
  labelledBy="video-record-panel-title"
  onClose={handleClose}
>
  <div
    class="video-record-drawer"
    role="dialog"
    aria-labelledby="video-record-panel-title"
  >
    <PanelHeader
      title={heading}
      isMobile={!isSideBySideLayout}
      onClose={handleClose}
    />

    <h2 id="video-record-panel-title" class="sr-only">{heading}</h2>

    <div class="video-record-drawer__content">
      <VideoRecordPanel {sequence} onClose={handleClose} onSave={handleSave} />
    </div>
  </div>
</CreatePanelDrawer>
{/if}

<style>
  /* Screen reader only class */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* Drawer container - full height, flex layout */
  .video-record-drawer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Content area - takes remaining space */
  .video-record-drawer__content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
