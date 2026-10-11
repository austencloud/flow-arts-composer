<script lang="ts">
  /**
   * Mobile 3D Controls — on-device validation harness.
   * Open https://localhost:5173/test/mobile-3d-controls on an iPhone SE.
   * Mounts the real Viewer3DFullscreen overlay with a real catalog sequence.
   */
  import { onMount } from "svelte";
  import Viewer3DFullscreen from "#lib/shared/3d/components/Viewer3DFullscreen.svelte";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createFullscreenController } from "#lib/shared/fullscreen/state/fullscreen-controller.svelte.js";
  import {
    loadCatalogs,
    loadCatalogSequences,
  } from "#lib/features/choreo-card/services/catalog-loader.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  const viewer = createViewer3DState();
  setViewer3DContext(viewer);

  const fullscreen = createFullscreenController({
    getHapticService: () => null,
    announce: (m) => console.debug("[a11y]", m),
  });

  let sequence = $state<SequenceData | null>(null);
  let isPlaying = $state(false);
  let currentStep = $state(0);
  let bpm = $state(60);
  let error = $state("");

  onMount(async () => {
    try {
      const catalogs = await loadCatalogs();
      const first = catalogs[0];
      if (!first) {
        error = "No catalogs available";
        return;
      }
      const seqs = await loadCatalogSequences(first.id);
      const seq = seqs.find((s) => (s.steps?.length ?? 0) > 1) ?? seqs[0];
      if (!seq) {
        error = "No sequences in catalog";
        return;
      }
      sequence = seq;
      viewer.enter3D(sequence);
    } catch (e) {
      error = `Load failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
</script>

{#if error}
  <div class="harness-error">{error}</div>
{:else if sequence}
  <Viewer3DFullscreen
    sequenceData={sequence}
    {currentStep}
    {isPlaying}
    {bpm}
    word={sequence.word ?? null}
    leftPropType="staff"
    rightPropType="staff"
    onClose={() => history.back()}
    onPlaybackToggle={() => (isPlaying = !isPlaying)}
    onBpmChange={(b) => (bpm = b)}
    immersive={fullscreen.immersive}
    onToggleImmersive={(host) => fullscreen.toggleImmersive(host)}
  />
{:else}
  <div class="harness-error">Loading sequence…</div>
{/if}

<style>
  .harness-error {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.6);
    background: #0a0a14;
    font-size: 14px;
    padding: 24px;
    text-align: center;
  }
</style>
