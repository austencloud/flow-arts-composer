<!--
  Layout harness for SequenceVideos.

  The real surface sits behind auth, an owned sequence, and uploaded footage,
  which makes its composition impossible to check while iterating. This mounts
  it against a real published sequence and two seeded video records pointing at
  a local clip, with the host props exposed as controls.

  Seeding goes through the shared store's own add(), which marks the list
  loaded - so no network read happens and no production record is touched.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import SequenceVideos from "#lib/shared/sequence-viewer/components/sequence-videos/SequenceVideos.svelte";
  import {
    getSequenceVideosStore,
    resetSequenceVideoStores,
  } from "#lib/shared/video-collaboration/state/sequence-videos-store.svelte.js";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import { hydrateSequence } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { loopDetector } from "#lib/features/create/generate/circular/services/loop-detector.js";
  import { registerLoopDetector } from "#lib/shared/create/get-loop-detector.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { CollaborativeVideo } from "#lib/shared/video-collaboration/domain/collaborative-video.js";

  /**
   * The same real published sequence the post-share harness uses: 16 steps, a
   * rotated LOOP of period 4, guest-readable from `publicSequences`.
   */
  const SEQUENCE_WORD = "CΨΩXCΨΩXCΨΩXCΨΩX";
  const SEQUENCE_ID = "2077a0d6-01d1-4b2b-a920-da9da6ee7e47";

  let sequence = $state<SequenceData | null>(null);
  let loadError = $state<string | null>(null);
  let seeded = $state(false);

  let isOwned = $state(true);
  let canUpload = $state(true);
  let uploadRequested = $state(false);
  let videoCount = $state(2);
  let mine = $state(true);

  /**
   * SequenceVideos shows the timing and delete tools only on a performance the
   * signed-in viewer created. `mine` seeds the records with the current uid so
   * that row renders. Signed out that uid is undefined, and the seeded records
   * carry undefined too, so the same comparison still passes and the tools row
   * can be checked without an auth round trip.
   */
  const creatorId = $derived(
    mine
      ? (authState.user?.uid as string)
      : (authState.user?.uid ?? "") + "-someone-else"
  );

  function makeVideo(index: number, ownerId: string): CollaborativeVideo {
    const created = new Date(2026, 6, 4 + index);
    return {
      id: `harness-video-${index}`,
      videoUrl: "/debug-recording.mp4",
      storagePath: `harness/${index}.mp4`,
      duration: 62,
      fileSize: 4_200_000 + index * 900_000,
      mimeType: "video/mp4",
      sequenceId: SEQUENCE_ID,
      creatorId: ownerId,
      collaborators: [
        {
          userId: ownerId,
          displayName: index === 0 ? "Austen Cloud" : "Paul",
          joinedAt: created,
          role: "creator",
        },
      ],
      pendingInvites: [],
      visibility: "public",
      createdAt: created,
      updatedAt: created,
      // The second performance carries saved timing, so both label states show.
      beatMap:
        index === 1
          ? {
              beatTimestamps: Array.from(
                { length: 16 },
                (_, step) => step * 3.5
              ),
              stepCount: 16,
              source: "manual",
              updatedAt: created,
            }
          : undefined,
    };
  }

  function seed(count: number, ownerId: string) {
    const store = getSequenceVideosStore(SEQUENCE_ID);
    // add() prepends, so seed in reverse to keep index 0 first in the list.
    for (let index = count - 1; index >= 0; index -= 1) {
      store.add(makeVideo(index, ownerId));
    }
    seeded = true;
  }

  /**
   * Reseeding hands out a fresh store instance, and the mounted surface holds
   * the old one for as long as its sequence id is unchanged. Bumping this
   * remounts it so a new seed actually shows.
   */
  let generation = $state(0);

  function reseed() {
    resetSequenceVideoStores();
    seed(videoCount, creatorId);
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
      seed(videoCount, creatorId);
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load the sequence.";
    }
  });
</script>

<svelte:head><title>SequenceVideos harness</title></svelte:head>

<div class="harness">
  <div class="harness-controls">
    <button
      type="button"
      class:on={!uploadRequested}
      onclick={() => (uploadRequested = false)}>Browse</button
    >
    <button
      type="button"
      class:on={uploadRequested}
      onclick={() => (uploadRequested = true)}>Upload</button
    >
    <button type="button" class:on={isOwned} onclick={() => (isOwned = !isOwned)}
      >owned: {isOwned}</button
    >
    <button
      type="button"
      class:on={canUpload}
      onclick={() => (canUpload = !canUpload)}>canUpload: {canUpload}</button
    >
    <button
      type="button"
      class:on={mine}
      onclick={() => {
        mine = !mine;
        reseed();
      }}>mine: {mine}</button
    >
    <label>
      videos
      <input type="range" min="0" max="5" bind:value={videoCount} />
      <output>{videoCount}</output>
    </label>
    <button type="button" onclick={reseed}>reseed</button>
    <span class="uid">creator: {creatorId ?? "(signed out)"}</span>
  </div>

  <div class="surface-frame">
    {#if loadError}
      <p class="load-error">{loadError}</p>
    {:else if sequence && seeded}
      {#key generation}
        <SequenceVideos
          {sequence}
          {isOwned}
          isLoggedIn={true}
          bpm={120}
          {canUpload}
          {uploadRequested}
          onSaveFirst={async () => {}}
          onUploadOpenChange={(open) => (uploadRequested = open)}
        />
      {/key}
    {:else}
      <p class="load-error">Loading the published sequence...</p>
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
    gap: 0.5rem;
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

  .harness-controls button.on {
    border-color: #818cf8;
    background: rgba(129, 140, 248, 0.18);
  }

  .harness-controls label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .uid {
    color: rgba(255, 255, 255, 0.45);
    font-family: monospace;
  }

  .surface-frame {
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
</style>
