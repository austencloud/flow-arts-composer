<!--
  Vertical slice for performance-video timing, end to end on real material.

  Real published sequence (OmLam-XJ = the LOOP word ΩΛ-XJ) + the real phone
  clip of it being performed. Mark the timing by tapping the pictograph, save,
  and the same page immediately plays the clip back through the production
  highlight function, so a mark you placed is visible as the move it lights up.

  The clip lives at static/word-videos/OmLam-XJ.mp4 and is gitignored along
  with every other .mp4, so this route needs that file copied in from
  _WORD_VIDEOS to run.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import StepMapEditor from "$lib/shared/sequence-viewer/components/step-mapping/StepMapEditor.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import SequenceVideos from "$lib/shared/sequence-viewer/components/sequence-videos/SequenceVideos.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { hydrateSequence } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import {
    getStepIndexFromVideo,
    passCountFromStepMap,
  } from "$lib/shared/video-collaboration/utils/step-map-utils";
  import {
    createVideoPlayheadBridge,
    setVideoPlayheadContext,
  } from "$lib/shared/sequence-viewer/context/video-playhead-context";
  import {
    getSequenceVideosStore,
    resetSequenceVideoStores,
  } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { formatTime } from "$lib/shared/sequence-viewer/utils/format-time";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  // The gallery read is a cold Firestore fetch and takes several seconds on a
  // bare route; the meta line shows auth so a slow load is legible as a load.
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type {
    CollaborativeVideo,
    StepMap,
  } from "$lib/shared/video-collaboration/domain/collaborative-video";

  /** OmLam-XJ: the published LOOP whose word simplifies to ΩΛ-XJ. */
  const SEQUENCE_WORD = "ΩΛ-XJΩΛ-XJΩΛ-XJΩΛ-XJ";
  const SEQUENCE_ID = "ΩΛ-XJ";
  const VIDEO_URL = "/word-videos/OmLam-XJ.mp4";
  /** ffprobe: 43.667239s, 720x1280, 29.68fps. */
  const VIDEO_DURATION = 43.667;

  /**
   * The take Austen marked by hand on 2026-08-16: 64 arrivals plus the final
   * one, the 16-move LOOP run four times over. Marks live only in the page
   * while it is open, so without this the paired view costs 65 taps to reach
   * every time the route reloads. Same numbers as
   * tests/unit/video-collaboration/step-map-utils.test.ts.
   */
  const RECORDED_MARKS = [
    0.0, 0.86, 1.55, 2.07, 2.69, 3.4, 3.94, 4.59, 5.18, 5.76, 6.45, 7.11, 7.7,
    8.36, 8.94, 9.49, 10.17, 10.8, 11.36, 12.0, 12.61, 13.23, 14.02, 14.54,
    15.17, 15.88, 16.46, 17.09, 17.71, 18.33, 18.89, 19.49, 20.26, 20.86, 21.52,
    22.15, 22.83, 23.42, 24.05, 24.66, 25.32, 26.0, 26.61, 27.19, 27.89, 28.48,
    29.07, 29.65, 30.37, 31.04, 31.69, 32.37, 32.93, 33.64, 34.25, 34.89, 35.57,
    36.21, 36.87, 37.54, 38.21, 39.03, 39.67, 40.24, 40.81,
  ];

  let sequence = $state<SequenceData | null>(null);
  let loadError = $state<string | null>(null);

  /** The map the editor last saved. Its presence is what switches to sync. */
  let saved = $state<StepMap | null>(null);
  let generation = $state(0);

  const displayWord = $derived(
    sequence?.word ? simplifyRepeatedWord(sequence.word) : ""
  );

  // ---- Playback: the production panes, on the production bridge ----
  //
  // The saved map is handed to the real videos pane through the real
  // sequence-videos store, and the notation beside it is a real ChoreoCard.
  // The only thing standing in for production here is the orchestrator: the
  // shell feeds the bridge into its viewer context, and this page feeds it
  // into the two pieces of state that context would drive.

  let videoTime = $state(0);
  let activeMap = $state<StepMap | null>(null);

  const playhead = createVideoPlayheadBridge({
    setPlaybackSource: () => {},
    setActiveStepMap: (map) => (activeMap = map),
    onVideoTimeUpdate: (seconds) => (videoTime = seconds),
  });
  setVideoPlayheadContext(playhead);

  /** -1 before the first mark; the card wants null for "nothing lit". */
  const highlightedStepIndex = $derived.by(() => {
    if (!activeMap) return null;
    const step = getStepIndexFromVideo(videoTime, activeMap);
    return step < 0 ? null : step;
  });

  const passSummary = $derived(
    saved
      ? `${saved.beatTimestamps.length} marks · ${passCountFromStepMap(saved)} passes · end ${saved.endTimestamp?.toFixed(2) ?? "-"}`
      : ""
  );

  /**
   * The performance record the videos pane reads. Seeded through the store's
   * own add(), which marks the list loaded - nothing is written to R2 or
   * Firestore, and no production record is touched.
   */
  function seedPerformance(stepMap: StepMap): void {
    const now = new Date();
    const record: CollaborativeVideo = {
      id: "slice-omlam-xj",
      videoUrl: VIDEO_URL,
      storagePath: "slice/OmLam-XJ.mp4",
      duration: VIDEO_DURATION,
      fileSize: 0,
      mimeType: "video/mp4",
      sequenceId: sequence?.id ?? SEQUENCE_ID,
      sequenceName: SEQUENCE_ID,
      creatorId: authState.user?.uid ?? "slice-performer",
      collaborators: [],
      pendingInvites: [],
      visibility: "private",
      description: "Phone clip, four times through.",
      beatMap: stepMap,
      createdAt: now,
      updatedAt: now,
    };
    resetSequenceVideoStores();
    getSequenceVideosStore(record.sequenceId).add(record);
  }

  async function handleSave(stepMap: StepMap) {
    seedPerformance(stepMap);
    saved = stepMap;
  }

  function loadRecordedTake() {
    handleSave({
      beatTimestamps: RECORDED_MARKS.slice(0, -1),
      endTimestamp: RECORDED_MARKS[RECORDED_MARKS.length - 1],
      stepCount: 16,
      source: "manual",
      updatedAt: new Date(),
    });
  }

  function remap() {
    saved = null;
    activeMap = null;
    videoTime = 0;
    resetSequenceVideoStores();
    generation += 1;
  }

  onMount(async () => {
    registerLoopDetector(loopDetector);
    try {
      const loaded = await getBrowseLoader().loadFullSequenceData(
        SEQUENCE_WORD,
        SEQUENCE_ID
      );
      if (!loaded) {
        loadError = "That sequence is not in the published gallery any more.";
        return;
      }
      sequence = await hydrateSequence(loaded);
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load the sequence.";
    }
  });
</script>

<svelte:head><title>Video timing slice</title></svelte:head>

<div class="harness">
  <div class="harness-controls">
    <span class="slice-word">
      {#if displayWord}
        <TKAWordGlyph word={displayWord} height={20} darkMode />
      {:else}
        loading
      {/if}
    </span>
    <span class="meta">
      {sequence ? `${sequence.steps.length} moves` : "loading"} · OmLam-XJ.mp4 ·
      {formatTime(VIDEO_DURATION)} · {authState.user ? "signed in" : "guest"}
    </span>
    {#if saved}
      <button type="button" onclick={remap}>Re-map</button>
      <span class="saved">{passSummary}</span>
    {:else if sequence}
      <button type="button" onclick={loadRecordedTake}>
        Load the recorded take
      </button>
    {/if}
  </div>

  <div class="editor-frame">
    {#if loadError}
      <p class="load-error">{loadError}</p>
    {:else if !sequence}
      <p class="load-error">Loading the published sequence...</p>
    {:else if saved}
      <div class="paired">
        <div class="paired-footage">
          <SequenceVideos {sequence} isOwned={true} />
        </div>
        <div class="paired-notation">
          <ChoreoCard
            {sequence}
            darkMode
            showHighlight
            {highlightedStepIndex}
            onStepClick={(stepIndex) => playhead.seekToStep(stepIndex)}
          />
        </div>
      </div>
    {:else}
      {#key generation}
        <StepMapEditor
          videoUrl={VIDEO_URL}
          videoDuration={VIDEO_DURATION}
          steps={sequence.steps}
          startPlacement={sequence.startPlacement ?? sequence.startingPlacement}
          bpm={120}
          draftKey={`slice:${sequence.id}`}
          onSave={handleSave}
          onClose={() => {}}
        />
      {/key}
    {/if}
  </div>
</div>

<style>
  .harness {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100dvh;
    padding: 1rem;
    background: #0b0b12;
    color: #fff;
  }

  .harness-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.8125rem;
  }

  .harness-controls button {
    padding: 0.3rem 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    background: transparent;
    color: #fff;
    cursor: pointer;
  }

  .slice-word {
    display: inline-flex;
    align-items: center;
  }

  .meta,
  .saved {
    color: rgba(255, 255, 255, 0.5);
    font-family: monospace;
  }

  .editor-frame {
    flex: 1;
    min-height: 0;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .load-error {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    color: rgba(255, 255, 255, 0.5);
  }

  /* ---- Footage beside notation ----

     Two equal halves, which is what the viewer's split pane gives these panes.
     Each half owns its own overflow so a tall card cannot push the footage
     off the page. */

  .paired {
    display: grid;
    /* Not 50/50: performance footage is shot on a phone and is portrait, so an
       equal half strands it in the middle of a wide card. The card is the wide
       artefact of the two and takes the remainder. */
    grid-template-columns: clamp(20rem, 26vw, 40rem) minmax(0, 1fr);
    gap: 1rem;
    height: 100%;
    padding: 1rem;
  }

  /* Grid, not flex: the videos pane is far taller than the viewport, and as a
     row-flex child its automatic minimum size let it shrink to nothing
     horizontally. A grid cell stretches instead. */
  .paired-footage,
  .paired-notation {
    display: grid;
    min-inline-size: 0;
    min-block-size: 0;
  }

  .paired-footage {
    align-content: start;
    overflow-y: auto;
  }

  .paired-notation {
    place-items: center;
    overflow: hidden;
  }

  /* The narrow end has no room for two halves side by side; the footage leads
     because that is what a mark is placed against. Both stack at their natural
     height and the page scrolls - splitting 600px of phone between them clips
     the clip and shrinks the card past reading. */
  @media (max-width: 900px) {
    /* Only the paired view grows past the viewport; the editor still wants a
       fixed frame it can lay its timeline out inside. */
    .harness:has(.paired) {
      height: auto;
      min-height: 100dvh;
    }

    .editor-frame:has(.paired) {
      overflow: visible;
    }

    .paired {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto;
      height: auto;
      overflow-y: auto;
    }

    .paired-footage,
    .paired-notation {
      overflow: visible;
    }

    .paired-notation {
      block-size: 70vh;
    }
  }
</style>
