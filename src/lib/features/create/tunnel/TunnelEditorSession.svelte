<script lang="ts">
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import {
    getEffectsConfigContext,
    setEffectsConfigContext,
  } from "$lib/shared/effects/state/effects-config-context";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { setAnimationVisibilityContext } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import {
    animationSettings,
    createAnimationSettingsState,
  } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { openSequenceOverlay } from "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte";
  import { persistViewerMode } from "$lib/shared/sequence-viewer/services/viewer-state-persistence";
  import { createPersistenceHelper } from "$lib/shared/state/utils/persistent-state";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { stageTunnelSnapshotForViewer } from "$lib/shared/sequence-viewer/tunnel/stage-tunnel-snapshot-for-viewer";
  import { createTunnelCreatorState } from "./state/tunnel-creator-state.svelte";
  import { setTunnelCreatorContext } from "./context/tunnel-creator-context";
  import {
    parseTunnelCreatorDraft,
    type TunnelEditTarget,
  } from "./domain/tunnel-creator-draft";
  import { createTunnelPresentationState } from "./state/tunnel-presentation-state.svelte";
  import {
    tunnelEditorContentKey,
    tunnelEditorSessionStatus,
    type TunnelEditorSessionStatus,
  } from "./domain/tunnel-editor-session";
  import type { TunnelCreatorHandoff } from "./services/tunnel-creator-handoff";
  import TunnelLayout from "./components/TunnelLayout.svelte";

  let {
    input = null,
    restoreDraft = true,
    collectionCount = 0,
    onOpenLibrary,
    onStatusChange,
  }: {
    input?: TunnelCreatorHandoff | null;
    restoreDraft?: boolean;
    collectionCount?: number;
    onOpenLibrary: () => void;
    onStatusChange: (status: TunnelEditorSessionStatus) => void;
  } = $props();

  const draftPersistence = createPersistenceHelper<unknown>({
    key: "tka-create-tunnel-draft-v1",
    defaultValue: null,
  });

  const restoredDraft =
    input || !restoreDraft
      ? null
      : parseTunnelCreatorDraft(draftPersistence.load());
  let editingTunnel = $state<TunnelEditTarget | undefined>(
    input
      ? {
          id: input.tunnelId,
          name: input.tunnelName,
          ...(input.poster ? { poster: input.poster } : {}),
        }
      : (restoredDraft?.editingTunnel ?? undefined)
  );
  let savedBaselineKey = $state(
    tunnelEditorContentKey(input?.composition ?? null, input?.snapshot ?? null)
  );

  // Each keyed editor session owns its presentation state. Replacing a tunnel
  // therefore cannot leak effects, visibility, playback, or prop choices from
  // the artifact that was open before it.
  const inheritedEffects = getEffectsConfigContext();
  const effects = createEffectsConfigState(inheritedEffects?.config, {
    persist: false,
  });
  setEffectsConfigContext(effects);

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  visibility.updateSettings(getAnimationVisibilityManager().getSettings());
  setAnimationVisibilityContext(visibility);

  const localAnimationSettings = createAnimationSettingsState({
    ephemeral: true,
  });
  localAnimationSettings.updateSettings({
    ...animationSettings.settings,
    trail: JSON.parse(JSON.stringify(animationSettings.trail)),
  });

  const presentation = createTunnelPresentationState({
    initialSnapshot: input?.snapshot ?? restoredDraft?.presentation ?? null,
    initialFormation:
      input?.composition?.formation ??
      restoredDraft?.composition?.formation ??
      input?.formation ??
      input?.snapshot?.tunnel.config,
    effects,
    visibility,
    animationSettings: localAnimationSettings,
    initialLeftPropType: settingsService.settings.leftPropType ?? "staff",
    initialRightPropType: settingsService.settings.rightPropType ?? "staff",
    initialCatDogMode: settingsService.settings.catDogMode ?? false,
    initialLeftBuugengFlipped:
      settingsService.settings.leftBuugengFlipped ?? false,
    initialRightBuugengFlipped:
      settingsService.settings.rightBuugengFlipped ?? false,
  });

  const creator = createTunnelCreatorState({
    initialComposition: input?.composition,
    initialDraft: restoredDraft,
    initialFormation: input?.formation,
    get editingTunnel() {
      return editingTunnel;
    },
    presentation,
    openComposition(composition, snapshot) {
      const lead = composition.performers.find(
        (performer) => performer.source.kind === "independent"
      );
      if (!lead || lead.source.kind !== "independent") return;
      stageTunnelSnapshotForViewer(snapshot);
      persistViewerMode("tunnel");
      openSequenceOverlay(lead.source.sequence, {
        analyticsSource: "create_workspace",
        returnLabel: "Back to Tunnel Creator",
        initialViewerMode: "tunnel",
        initialViewMode: "animation",
        initialBpm: snapshot.playback.bpm,
        initialPlaybackMode: snapshot.playback.playbackMode,
        tunnelComposition: composition,
        tunnelSaveTarget: editingTunnel,
        onTunnelSaved(receipt) {
          editingTunnel = receipt.target;
          savedBaselineKey = tunnelEditorContentKey(
            receipt.composition,
            receipt.snapshot
          );
        },
      });
    },
  });
  setTunnelCreatorContext(creator);

  $effect(() => {
    const draft = creator.draftSnapshot();
    draftPersistence.setupAutoSave(draft);
    onStatusChange(tunnelEditorSessionStatus(draft, input, savedBaselineKey));
  });
</script>

<TunnelLayout {onOpenLibrary} {collectionCount} />
