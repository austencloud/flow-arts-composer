<!--
  Visual harness for the real Post Studio surface, on the real multi-pass take.

  Same material as /test/step-map-editor: the published LOOP ΩΛ-XJ and the phone
  clip of it being performed four times through, marked by hand at all 64
  arrivals. Seeding the shared per-sequence video store is all it takes to reach
  Post Studio now — the studio reads that store, so the footage arrives the same
  way an upload in the viewer would.

  The clip lives at static/word-videos/OmLam-XJ.mp4 and is gitignored along with
  every other .mp4, so this route needs that file copied in from _WORD_VIDEOS.
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

  /** OmLam-XJ: the published LOOP whose word simplifies to ΩΛ-XJ. */
  const SEQUENCE_WORD = "ΩΛ-XJΩΛ-XJΩΛ-XJΩΛ-XJ";
  const SEQUENCE_ID = "ΩΛ-XJ";
  const VIDEO_URL = "/word-videos/OmLam-XJ.mp4";
  /** ffprobe: 43.667239s, 720x1280, 29.68fps. */
  const VIDEO_DURATION = 43.667;

  /**
   * The take Austen marked on 2026-08-16: 64 arrivals over four passes of the
   * 16-move LOOP, plus the final one. Same numbers as
   * tests/unit/media-composition/sequence-time-map.test.ts.
   */
  const RECORDED_MARKS = [
    0.0, 0.86, 1.55, 2.07, 2.69, 3.4, 3.94, 4.59, 5.18, 5.76, 6.45, 7.11, 7.7,
    8.36, 8.94, 9.49, 10.17, 10.8, 11.36, 12.0, 12.61, 13.23, 14.02, 14.54,
    15.17, 15.88, 16.46, 17.09, 17.71, 18.33, 18.89, 19.49, 20.26, 20.86, 21.52,
    22.15, 22.83, 23.42, 24.05, 24.66, 25.32, 26.0, 26.61, 27.19, 27.89, 28.48,
    29.07, 29.65, 30.37, 31.04, 31.69, 32.37, 32.93, 33.64, 34.25, 34.89, 35.57,
    36.21, 36.87, 37.54, 38.21, 39.03, 39.67, 40.24,
  ];
  const RECORDED_END = 40.81;

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
      id: "slice-omlam-xj",
      videoUrl: VIDEO_URL,
      storagePath: "slice/OmLam-XJ.mp4",
      duration: VIDEO_DURATION,
      fileSize: 0,
      mimeType: "video/mp4",
      sequenceId,
      sequenceName: SEQUENCE_ID,
      creatorId: "slice-performer",
      collaborators: [],
      pendingInvites: [],
      visibility: "private",
      description: "Phone clip, four times through.",
      beatMap: {
        beatTimestamps: RECORDED_MARKS,
        endTimestamp: RECORDED_END,
        stepCount: 16,
        source: "manual",
        updatedAt: now,
      },
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
