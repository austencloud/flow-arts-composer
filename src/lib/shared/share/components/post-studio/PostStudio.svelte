<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
  import type { SequenceTimeMap } from "$lib/shared/media-composition/domain/sequence-time-map";
  import {
    getEffectsConfigContext,
    setEffectsConfigContext,
  } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import {
    getAnimationVisibilityContext,
    setAnimationVisibilityContext,
  } from "$lib/shared/animation-engine/state/animation-visibility-context";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { tryGetViewerUrlSessionContext } from "$lib/shared/sequence-viewer/services/viewer-url-session";
  import {
    capturePsSlice,
    persistedPsSlice,
    seedFromPsSlice,
    type PsSlicePayload,
  } from "$lib/shared/sequence-viewer/services/viewer-url-slices/ps-slice";
  import type { PostStudioShareExport } from "./post-studio-share-export";
  import { withPostStudioPropType } from "./post-studio-prop-render-options";
  import PostStudioWorkspace from "./builder/PostStudioWorkspace.svelte";

  /**
   * Post Studio's host-facing shell. It owns what outlives one sequence (the
   * prop, the link state and the share seam) and opens a fresh workspace for
   * each sequence, since a post plan belongs to exactly one.
   */
  interface Props {
    /** Retain the draft while its host is hidden, without running playback. */
    active?: boolean;
    sequence: SequenceData;
    cardPreviewUrl: string | null;
    animationPreviewUrl: string | null;
    animationPreviewType?: "video" | "image";
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    resolvedCardAutoLayout?: ResolvedAutoLayout | null;
    performanceDurationSeconds?: number;
    sequenceTimeMap?: SequenceTimeMap | null;
    isPreparingCard?: boolean;
    isPreparingAnimation?: boolean;
    onRequestAnimation: () => void;
    onExported?: (blob: Blob) => void;
    /**
     * Opens the host's share sheet on the finished render. Only hosts with a
     * sheet pass it (the viewer shell); without it the Render step ends at
     * Download.
     */
    onSharePost?: () => void;
    previewTarget?: HTMLElement | null;
    onRegisterShareExport?: (controls: PostStudioShareExport | null) => void;
    /**
     * The host's share panel is open. Sending owns the tools track: the studio
     * shows the post and its transport, and the step panels wait.
     */
    sharing?: boolean;
  }

  let {
    active = true,
    sequence,
    cardPreviewUrl,
    animationPreviewUrl,
    animationPreviewType = "video",
    cardRenderOptions = null,
    isPreparingCard = false,
    isPreparingAnimation = false,
    onExported,
    onSharePost,
    previewTarget = null,
    onRegisterShareExport,
    sharing = false,
  }: Props = $props();

  const effectsConfig =
    getEffectsConfigContext() ??
    createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effectsConfig);
  const animationVisibility =
    getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  setAnimationVisibilityContext(animationVisibility);

  // ps slice: a shared link can carry the prop and the sound. See
  // `ps-slice.ts`, "Own-link rule": any non-null URL payload is an override.
  const viewerUrlSession = tryGetViewerUrlSessionContext();
  const psSeedPayload =
    (viewerUrlSession?.getSeed("ps") as PsSlicePayload | null) ?? null;
  const psSeed =
    psSeedPayload && viewerUrlSession?.isOverride("ps", persistedPsSlice())
      ? seedFromPsSlice(psSeedPayload)
      : null;

  let selectedPropType = $state<PropType>(
    psSeed?.propType ?? settingsService.settings.leftPropType ?? PropType.STAFF
  );
  const synchronizedCardRenderOptions = $derived(
    withPostStudioPropType(cardRenderOptions, selectedPropType)
  );

  /** The ps slice speaks the older names: the take's own sound, or none. */
  const audioSeed: "takes" | "silent" | null =
    psSeed?.audioMode === undefined
      ? null
      : psSeed.audioMode === "original"
        ? "takes"
        : "silent";
  let audio = $state<"takes" | "silent">(audioSeed ?? "takes");
  let audioTouched = $state(audioSeed !== null);

  function setAudio(next: "takes" | "silent"): void {
    if (next !== audio) audioTouched = true;
    audio = next;
  }

  const capturePs = (options: { full?: boolean } = {}) =>
    capturePsSlice(
      {
        propType: selectedPropType,
        defaultPropType:
          settingsService.settings.leftPropType ?? PropType.STAFF,
        audioMode: audio === "takes" ? "original" : "instagram",
        audioModeTouched: audioTouched,
      },
      options
    );

  if (viewerUrlSession) {
    const unregisterPsSlice = viewerUrlSession.registerSlice("ps", capturePs);
    onDestroy(unregisterPsSlice);
  }

  $effect(() => {
    if (!viewerUrlSession) return;
    void capturePs();
    viewerUrlSession.scheduleUrlWrite();
  });

  // The workspace is replaced per sequence, so the host holds one stable
  // seam that forwards to whichever workspace is open.
  let workspaceExport: PostStudioShareExport | null = null;

  onMount(() => {
    onRegisterShareExport?.({
      render: () => workspaceExport?.render() ?? Promise.resolve(false),
      cancel: () => workspaceExport?.cancel(),
    });
    return () => onRegisterShareExport?.(null);
  });

  function registerExport(controls: PostStudioShareExport): () => void {
    workspaceExport = controls;
    return () => {
      if (workspaceExport === controls) workspaceExport = null;
    };
  }
</script>

{#key sequence.id}
  <PostStudioWorkspace
    {active}
    {sequence}
    {cardPreviewUrl}
    {animationPreviewUrl}
    {animationPreviewType}
    cardRenderOptions={synchronizedCardRenderOptions}
    {isPreparingCard}
    {isPreparingAnimation}
    {onExported}
    {onSharePost}
    {previewTarget}
    {sharing}
    {selectedPropType}
    onPropChange={(propType) => (selectedPropType = propType)}
    {audioSeed}
    onAudioChange={setAudio}
    {registerExport}
  />
{/key}
