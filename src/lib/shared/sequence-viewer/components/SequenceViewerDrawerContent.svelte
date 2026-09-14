<!--
  Deferred content for SequenceViewerDrawerHost.

  The app shell keeps the host mounted for URL and native-scan intake. This
  component carries only the viewer runtime that is needed after a sequence
  has entered the overlay, while preserving the shared shell as the sole owner
  of viewer chrome.
-->
<script lang="ts">
  import SequenceViewerOrchestrator from "./SequenceViewerOrchestrator.svelte";
  import SequenceViewerShell from "./SequenceViewerShell.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import type { ViewMode } from "../domain/viewer-orchestrator-context";
  import type { ViewerMode } from "../state/viewer-state.svelte";
  import type {
    TunnelComposition,
    TunnelSaveTarget,
  } from "../tunnel/tunnel-composition";
  import type { TunnelSavedCallback } from "../tunnel/tunnel-snapshot";
  import type { SequenceViewerSource } from "../analytics/viewer-events";

  interface Props {
    sequence: SequenceData | null;
    sessionKey: number;
    isMobile: boolean;
    collectionPropType: PropType | null;
    initialBpm: number;
    initialPlaybackMode: PlaybackMode;
    initialStep: number;
    initialViewMode: ViewMode | undefined;
    initialViewerMode: ViewerMode | undefined;
    handPathMode: boolean;
    playOnOpen: boolean;
    playbackReleased: boolean;
    onReadyForReveal: () => void;
    onClose: (reason?: "navigate") => void;
    shortCode: string | null;
    analyticsSource: SequenceViewerSource;
    shareOnOpen: boolean;
    tunnelComposition: TunnelComposition | null;
    tunnelSaveTarget: TunnelSaveTarget | null;
    onTunnelSaved: TunnelSavedCallback | null;
  }

  let {
    sequence,
    sessionKey,
    isMobile,
    collectionPropType,
    initialBpm,
    initialPlaybackMode,
    initialStep,
    initialViewMode,
    initialViewerMode,
    handPathMode,
    playOnOpen,
    playbackReleased,
    onReadyForReveal,
    onClose,
    shortCode,
    analyticsSource,
    shareOnOpen,
    tunnelComposition,
    tunnelSaveTarget,
    onTunnelSaved,
  }: Props = $props();
</script>

{#if sequence}
  {#key sessionKey}
    <SequenceViewerOrchestrator
      {sequence}
      {isMobile}
      {collectionPropType}
      {initialBpm}
      {initialPlaybackMode}
      {initialStep}
      {initialViewMode}
      {initialViewerMode}
      {handPathMode}
      {playOnOpen}
      {playbackReleased}
      {onReadyForReveal}
      {onClose}
      {shortCode}
    >
      {#snippet children(ctx)}
        <SequenceViewerShell
          {ctx}
          {sequence}
          {analyticsSource}
          {isMobile}
          {onClose}
          {shareOnOpen}
          {tunnelComposition}
          {tunnelSaveTarget}
          {onTunnelSaved}
        />
      {/snippet}
    </SequenceViewerOrchestrator>
  {/key}
{/if}
