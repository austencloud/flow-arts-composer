<!--
  Visual harness for Post Studio with the published DCKΨ- sequence and a local
  copy of Austen's clean September 6 phone take. The clip is gitignored, so the route also
  works when that local media is absent: choose another performance in the UI.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import PostStudio from "$lib/shared/share/components/post-studio/PostStudio.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { hydrateSequence } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { getSharer } from "$lib/shared/share/get-sharer";
  import {
    getSequenceVideosStore,
    resetSequenceVideoStores,
  } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import { buildCardRenderOptions } from "$lib/shared/share/services/card-render-options";
  import {
    loadBpmAlignment,
    saveBpmAlignment,
  } from "$lib/shared/share/components/post-studio/local-performance-bpm-alignments";

  const SEQUENCE_WORD = "DCKΨ-DCKΨ-DCKΨ-DCKΨ-";
  const SEQUENCE_ID = "DCKΨ-";
  const VIDEO_URL = "/word-videos/DCK-Psi-performance.mp4";
  /** ffprobe of the local browser copy: 22.635s, 720x1280, 30fps. */
  const VIDEO_DURATION = 22.635;
  const VIDEO_ID = "post-studio-dck-psi-local-example";

  let sequence = $state<SequenceData | null>(null);
  let cardPreviewUrl = $state<string | null>(null);
  let animationPreviewUrl = $state<string | null>(null);
  let animationPreviewType = $state<"video" | "image">("video");
  let isPreparingAnimation = $state(false);
  let cardRenderOptions = $state<ReturnType<
    typeof buildCardRenderOptions
  > | null>(null);
  let loadError = $state<string | null>(null);
  let animationTimer: ReturnType<typeof setTimeout> | null = null;

  function seedPerformance(sequenceId: string): void {
    const now = new Date();
    const record: CollaborativeVideo = {
      id: VIDEO_ID,
      videoUrl: VIDEO_URL,
      storagePath: "local-example/DCK-Psi-performance.mp4",
      duration: VIDEO_DURATION,
      fileSize: 0,
      mimeType: "video/mp4",
      sequenceId,
      sequenceName: SEQUENCE_ID,
      creatorId: "slice-performer",
      collaborators: [],
      pendingInvites: [],
      visibility: "private",
      description: "DCKΨ- clean phone take · align Beat 1",
      createdAt: now,
      updatedAt: now,
    };
    resetSequenceVideoStores();
    const store = getSequenceVideosStore(sequenceId);
    store.add(record);
    // The real method writes to Firestore, which needs a signed-in creator.
    // The harness keeps the choice in memory so the toggle can be exercised.
    store.applyHandLabeling = async (videoId, handLabeling) => {
      const held = store.videos.find((video) => video.id === videoId);
      if (held) store.add({ ...held, handLabeling, updatedAt: new Date() });
    };
  }

  onMount(async () => {
    registerLoopDetector(loopDetector);
    try {
      const loaded = await getBrowseLoader().loadFullSequenceData(
        SEQUENCE_WORD,
        SEQUENCE_ID
      );
      if (!loaded)
        throw new Error("The visual fixture is no longer published.");
      const hydrated = await hydrateSequence(loaded);
      seedPerformance(hydrated.id);
      const alignmentKey = `${hydrated.id}:catalog:${VIDEO_ID}`;
      if (!loadBpmAlignment(alignmentKey)) {
        saveBpmAlignment(alignmentKey, { bpm: 87, firstBeatSeconds: null });
      }
      sequence = { ...hydrated, performanceVideoUrl: VIDEO_URL };
      cardRenderOptions = buildCardRenderOptions(sequence, { darkMode: true });

      const blob = await getSharer().getCardImageBlob(sequence, {
        darkMode: true,
      });
      cardPreviewUrl = URL.createObjectURL(blob);

      if (sequence.animatedSequenceUrl) {
        animationPreviewUrl = sequence.animatedSequenceUrl;
        animationPreviewType = "image";
      }
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load Post Studio.";
    }
  });

  onDestroy(() => {
    if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl);
    if (animationTimer) clearTimeout(animationTimer);
  });

  function requestAnimation(): void {
    if (animationPreviewUrl || isPreparingAnimation) return;
    isPreparingAnimation = true;
    animationTimer = setTimeout(() => {
      isPreparingAnimation = false;
      animationTimer = null;
    }, 1800);
  }
</script>

<svelte:head>
  <title>Post Studio visual harness</title>
</svelte:head>

<main class="harness">
  {#if loadError}
    <div class="load-state error" role="alert">{loadError}</div>
  {:else if !sequence}
    <div class="load-state" role="status">
      <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
      Loading a published sequence…
    </div>
  {:else}
    <PostStudio
      {sequence}
      {cardPreviewUrl}
      {animationPreviewUrl}
      {animationPreviewType}
      performanceDurationSeconds={VIDEO_DURATION}
      {cardRenderOptions}
      isPreparingCard={!cardPreviewUrl}
      {isPreparingAnimation}
      onRequestAnimation={requestAnimation}
      onBack={() => undefined}
      onClose={() => undefined}
    />
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #09090d;
  }

  .harness {
    display: grid;
    /* Stretch, not start: the studio is a full-height surface everywhere it
       actually ships (a modal over the viewer). Starting it meant that above
       ~2600px the studio collapsed to its intrinsic height and the canvas
       column narrowed with it, so the harness stopped representing the app at
       exactly the widths worth checking. */
    align-items: stretch;
    width: 100%;
    height: 100dvh;
    padding: clamp(0.5rem, 1.5vw, 2rem);
    overflow: hidden;
    background:
      radial-gradient(
        circle at 12% 0%,
        rgba(87, 64, 180, 0.18),
        transparent 34rem
      ),
      #09090d;
  }

  .load-state {
    display: flex;
    align-items: center;
    justify-self: center;
    /* The grid stretches its child so the studio fills the viewport; this one
       hugs its text instead. */
    align-self: start;
    gap: 0.625rem;
    margin-top: 25dvh;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.875rem;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.9375rem;
  }

  .load-state.error {
    border-color: rgba(229, 90, 90, 0.28);
    color: #ffb4b4;
  }
</style>
