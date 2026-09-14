<script lang="ts">
  /**
   * SequenceDrawerLauncher
   *
   * Tiny always-mounted companion to the (now lazy) SequenceDrawerHost. It owns
   * the two responsibilities that must stay live even before the export drawer's
   * heavy 297-file subtree has loaded:
   *
   *  1. `?sheet=animation` deep-link / back-forward → open the export panel.
   *     Opening flips `panelState.isExportPanelOpen`, which mounts the host via
   *     LazyMount in CreateModule.
   *  2. View-sequence redirect: when `panelState.isSequenceViewerOpen` flips true,
   *     dynamic-import the sequence-viewer navigator (135-file subtree) and open
   *     the viewer — so that subtree loads ONLY on the click, never at boot.
   *
   * Static imports here are deliberately light (context + auth + url-manager).
   * The heavy navigator + handoff are dynamic-imported inside the effect.
   */
  import { onMount } from "svelte";
  import { getCreateModuleContext } from "../../context/create-module-context";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { ExportUrlManager } from "$lib/shared/export-panel/services/export-url-manager";

  const { CreateModuleState, panelState } = getCreateModuleContext();

  const currentSequence = $derived(
    CreateModuleState.sequenceState.currentSequence
  );

  // --- 1. Deep-link / back-forward → open export panel -----------------------
  // Reuse the existing ExportUrlManager primitive (light deps: sheet-router +
  // $app/navigation). The host registers its OWN ExportUrlManager once mounted,
  // which performs the speed/beat restore (it has the playbackController the
  // launcher lacks); here onStateRestore is a deliberate no-op.
  const urlManager = new ExportUrlManager();
  let cleanupUrlManager: (() => void) | undefined;

  onMount(() => {
    cleanupUrlManager = urlManager.initialize({
      onAnimationPanelOpen: () => {
        if (!panelState.isExportPanelOpen) {
          panelState.openExportPanel("animation");
        }
      },
      onStateRestore: () => {
        // No-op: the host's urlManager performs speed/beat restore once mounted.
      },
    });
    return () => cleanupUrlManager?.();
  });

  // --- 2. View-sequence redirect (heavy navigator loaded on demand) ----------
  $effect(() => {
    if (!panelState.isSequenceViewerOpen) return;

    const handoff = panelState.workspacePlaybackHandoff;
    const sequence = handoff?.sequence ?? currentSequence;
    if (!sequence) return;

    // Clear the flag immediately so this fires once per request.
    panelState.closeSequenceViewer();

    // Stamp ownership so the viewer shows Save/Edit/Delete for create-built
    // sequences that haven't been persisted to Firestore yet.
    const seq = sequence;
    const sequenceWithOwner = seq.ownerId
      ? seq
      : {
          ...seq,
          ownerId: authState.user?.uid ?? undefined,
          ownerDisplayName: authState.user?.displayName ?? undefined,
        };

    void (async () => {
      const [{ openSequenceViewer }, { getReturnContext }] = await Promise.all([
        import("$lib/shared/sequence-viewer/services/sequence-viewer-navigator"),
        import("$lib/shared/coordinators/sequence-handoff.svelte"),
      ]);
      const { returnPath, returnLabel } = getReturnContext();
      openSequenceViewer(sequenceWithOwner, {
        source: "create_workspace",
        returnPath,
        returnLabel,
        initialStep: handoff?.initialStep,
        initialViewMode: "animation",
        playOnOpen: handoff?.playing ?? true,
      });
    })();
  });
</script>
