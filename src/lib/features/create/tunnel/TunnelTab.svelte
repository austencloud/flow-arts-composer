<script lang="ts">
  import { onMount } from "svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import CreatePanelDrawer from "#lib/features/create/shared/components/CreatePanelDrawer.svelte";
  import { tunnelCollectionState } from "#lib/features/tunnel-collection/state/tunnel-collection-state.svelte.js";
  import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { setPendingBrowseIntent } from "#lib/features/browse/state/pending-browse-intent.svelte.js";
  import {
    consumeTunnelCreatorHandoff,
    createTunnelCreatorHandoff,
    type TunnelCreatorHandoff,
  } from "./services/tunnel-creator-handoff";
  import type { TunnelEditorSessionStatus } from "./domain/tunnel-editor-session";
  import TunnelEditorSession from "./TunnelEditorSession.svelte";
  import TunnelLibraryPicker from "./components/TunnelLibraryPicker.svelte";

  type PendingReplacement =
    | { kind: "open"; tunnel: CollectedTunnel }
    | { kind: "new" };

  const initialInput = consumeTunnelCreatorHandoff();
  let editorInput = $state<TunnelCreatorHandoff | null>(initialInput);
  let restoreDraft = $state(initialInput === null);
  let sessionRevision = $state(0);
  let libraryOpen = $state(false);
  let pendingReplacement = $state<PendingReplacement | null>(null);
  let replacementConfirmOpen = $state(false);
  let sessionStatus = $state<TunnelEditorSessionStatus>({
    editingTunnelId: initialInput?.tunnelId ?? null,
    editingTunnelName: initialInput?.tunnelName ?? null,
    hasContent: initialInput !== null,
    dirty: false,
  });

  const collection = $derived(tunnelCollectionState.collection);
  const replacementName = $derived(
    pendingReplacement?.kind === "open"
      ? pendingReplacement.tunnel.name
      : "a new tunnel"
  );
  const currentWorkspaceName = $derived(
    sessionStatus.editingTunnelName ?? "this tunnel draft"
  );
  const replacementConfirmText = $derived(
    pendingReplacement?.kind === "new" ? "Start new tunnel" : "Open tunnel"
  );

  onMount(() => {
    // Signed-in sessions start during auth boot. This fills the same singleton
    // from guest localStorage without duplicating collection ownership.
    tunnelCollectionState.initLocal();
  });

  function replaceSession(next: PendingReplacement): void {
    editorInput =
      next.kind === "open" ? createTunnelCreatorHandoff(next.tunnel) : null;
    restoreDraft = false;
    sessionRevision += 1;
    libraryOpen = false;
    pendingReplacement = null;
  }

  function requestReplacement(next: PendingReplacement): void {
    if (
      next.kind === "open" &&
      next.tunnel.id === sessionStatus.editingTunnelId
    ) {
      libraryOpen = false;
      return;
    }
    if (
      next.kind === "new" &&
      !sessionStatus.editingTunnelId &&
      !sessionStatus.hasContent
    ) {
      libraryOpen = false;
      return;
    }

    if (sessionStatus.dirty) {
      pendingReplacement = next;
      replacementConfirmOpen = true;
      return;
    }
    replaceSession(next);
  }

  function confirmReplacement(): void {
    if (pendingReplacement) replaceSession(pendingReplacement);
  }

  function cancelReplacement(): void {
    pendingReplacement = null;
  }

  async function manageInBrowse(): Promise<void> {
    setPendingBrowseIntent({
      kind: "art-shelf",
      shelfId: "art_tunnels",
      label: "Tunnels",
    });
    libraryOpen = false;
    await handleModuleChange("browse", "you");
  }

  async function openPublicInBrowse(
    envelope: PublicArtifactEnvelope
  ): Promise<void> {
    setPendingBrowseIntent({
      kind: "explore-visual-detail",
      visualType: "tunnels",
      artifactId: envelope.artifactId,
    });
    libraryOpen = false;
    await handleModuleChange("browse", "explore");
  }
</script>

{#key sessionRevision}
  <TunnelEditorSession
    input={editorInput}
    {restoreDraft}
    collectionCount={collection.length}
    onOpenLibrary={() => (libraryOpen = true)}
    onStatusChange={(status) => (sessionStatus = status)}
  />
{/key}

<CreatePanelDrawer
  bind:isOpen={libraryOpen}
  panelName="tunnel-library"
  fullHeightOnMobile={true}
  closeOnBackdrop={true}
  focusTrap={true}
  lockScroll={true}
  keepMounted={true}
  ariaLabel="Tunnels"
>
  <TunnelLibraryPicker
    items={collection}
    active={libraryOpen}
    loading={tunnelCollectionState.loading}
    activeTunnelId={sessionStatus.editingTunnelId}
    onSelect={(tunnel) => requestReplacement({ kind: "open", tunnel })}
    onOpenPublic={(envelope) => void openPublicInBrowse(envelope)}
    onNew={() => requestReplacement({ kind: "new" })}
    onManage={() => void manageInBrowse()}
    onClose={() => (libraryOpen = false)}
  />
</CreatePanelDrawer>

<ConfirmDialog
  bind:isOpen={replacementConfirmOpen}
  title={`Open ${replacementName}?`}
  message={`Opening ${replacementName} replaces unsaved changes in ${currentWorkspaceName}. The saved artifact stays unchanged until you explicitly save.`}
  confirmText={replacementConfirmText}
  cancelText="Keep editing"
  variant="warning"
  onConfirm={confirmReplacement}
  onCancel={cancelReplacement}
/>

<style>
  :global(.drawer-content.tunnel-library-panel-container) {
    --sheet-bg: var(--theme-panel-bg);
    --sheet-filter: none;
    background: var(--theme-panel-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  :global(
    .drawer-content.tunnel-library-panel-container.side-by-side-layout[data-placement="right"]
  ) {
    width: clamp(32rem, 38vw, 52rem);
    max-width: calc(100vw - var(--desktop-sidebar-width, 64px));
    border-radius: 0;
  }
</style>
