<!--
  MandalaModule.svelte — Unified mandala gallery with detail panel + meditation/export modes
-->
<script lang="ts">
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import type {
    MandalaPathShape,
    MandalaRenderOptions,
    UndulationEasing,
  } from "$lib/shared/mandala/domain/mandala-types";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import PanelSpinner from "$lib/shared/components/panel/PanelSpinner.svelte";
  import CollectionGalleryDetail from "$lib/shared/modules/CollectionGalleryDetail.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import MeditationControls from "./tabs/meditate/components/MeditationControls.svelte";
  import MeditationOverlay from "./tabs/meditate/components/MeditationOverlay.svelte";
  import { createMeditationSession } from "./tabs/meditate/state/meditation-session.svelte";
  import { createMeditationAudioService } from "./tabs/meditate/services/meditation-audio";
  import { getPatternCycleTime, type BreathingPattern, type AmbientTrack } from "./tabs/meditate/domain/meditation-types";
  import { exportMandalaPNG } from "./tabs/export/services/mandala-export";
  import { shareOrDownloadBlob } from "$lib/shared/foundation/services/file-downloader";
  import { saveActionLabel } from "$lib/shared/mobile/share-action.svelte";
  import { runMandalaVideoExport } from "./tabs/export/services/mandala-video";
  import type { MandalaVideoExportHandle } from "$lib/shared/mandala/services/mandala-video-exporter";
  import { mandalaCollectionState } from "./tabs/collection/state/mandala-collection-state.svelte";
  import { DEFAULT_MANDALAS } from "./tabs/meditate/domain/default-mandalas";
  import type { StepLike } from "$lib/shared/mandala/services/types";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import MandalaPublicationControls from "./tabs/collection/components/MandalaPublicationControls.svelte";
  import { openLineageSource, hasLineageSource } from "$lib/shared/collections/open-lineage-source";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { onMount } from "svelte";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";

  type Phase = "gallery" | "detail" | "meditate-config" | "meditate-session";
  let phase = $state<Phase>("gallery");

  interface MandalaItem {
    id: string;
    name: string;
    steps: StepLike[];
    variant: MandalaRenderOptions["show"];
    leftPropType: string;
    rightPropType: string;
    pathShape?: MandalaPathShape;
    createdAt: number;
    group: "curated" | "collection";
    /** Lineage stamp — see docs/superpowers/specs/2026-07-12-art-in-library-design.md
     *  Unit 3. Absent for curated mandalas (not user-collected). */
    sourceWord?: string;
    sourceSequenceId?: string;
  }

  // The selected mandala drives detail/meditate/export. Everything downstream
  // consumes its steps as StepLike (render + export), so the selection mirrors
  // MandalaItem's step shape rather than the persisted CollectedMandala's
  // StepData[] — no lossy cast needed at the assignment or the consumers.
  type SelectedMandala = Omit<MandalaItem, "group">;

  let selectedMandala = $state<SelectedMandala | null>(null);

  // Publication needs the persisted entry, not the render-shaped selection —
  // it content-addresses the saved payload. Curated defaults are not in the
  // collection, so this stays null for them and no sharing UI appears.
  const selectedCollected = $derived.by(() => {
    const id = selectedMandala?.id;
    if (!id) return null;
    return mandalaCollectionState.collection.find((m) => m.id === id) ?? null;
  });

  const items = $derived.by((): MandalaItem[] => {
    const curated: MandalaItem[] = DEFAULT_MANDALAS.map((m) => ({
      ...m,
      createdAt: 0,
      group: "curated",
    }));
    const collected: MandalaItem[] = mandalaCollectionState.collection.map((m) => ({
      id: m.id,
      name: m.name,
      steps: m.steps as StepLike[],
      variant: m.variant,
      leftPropType: m.leftPropType,
      rightPropType: m.rightPropType,
      pathShape: m.pathShape,
      createdAt: m.createdAt,
      group: "collection",
      sourceWord: m.sourceWord,
      sourceSequenceId: m.sourceSequenceId,
    }));
    return [...curated, ...collected];
  });

  const dateLabel = $derived(
    selectedMandala
      ? new Date(selectedMandala.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "",
  );

  // Gallery thumbnail size scales with available width (one observer for the
  // whole grid, not one per card) so the live mandala render — not just its box —
  // grows on a 4K monitor, matching the Tunnels poster grid.
  let galleryEl = $state<HTMLElement | null>(null);
  let cardThumbSize = $state(140);
  $effect(() => {
    if (!galleryEl) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      cardThumbSize =
        w >= 1800 ? 220 : w >= 1200 ? 180 : w < 480 ? 90 : w < 768 ? 110 : 140;
    });
    ro.observe(galleryEl);
    return () => ro.disconnect();
  });

  let detailPreviewEl = $state<HTMLElement | null>(null);
  let detailPreviewSize = $state(300);

  $effect(() => {
    if (!detailPreviewEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        detailPreviewSize = Math.min(width, height) * 0.75;
      }
    });
    ro.observe(detailPreviewEl);
    return () => ro.disconnect();
  });

  let deleteConfirming = $state(false);
  let deleteTimer: ReturnType<typeof setTimeout> | undefined;

  function handleDeleteClick() {
    if (!selectedMandala) return;
    if (deleteConfirming) {
      clearTimeout(deleteTimer);
      mandalaCollectionState.remove(selectedMandala.id);
      deleteConfirming = false;
      selectedMandala = null;
      phase = "gallery";
    } else {
      deleteConfirming = true;
      deleteTimer = setTimeout(() => { deleteConfirming = false; }, 3000);
    }
  }

  const ANIMATE_MIN = 0;
  const ANIMATE_MAX = 250;
  const BASE_PERIOD = 5;

  // Reactive prefers-reduced-motion — tracks runtime OS toggles mid-session,
  // not just the value sampled at mount.
  let reducedMotion = $state(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  $effect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    reducedMotion = mql.matches;
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  });

  const meditationSession = createMeditationSession();
  let audioService = createMeditationAudioService();

  let meditateStageEl = $state<HTMLElement | null>(null);
  let meditateContainerSize = $state(300);

  $effect(() => {
    if (!meditateStageEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        meditateContainerSize = Math.min(width, height) * 0.85;
      }
    });
    ro.observe(meditateStageEl);
    return () => ro.disconnect();
  });

  const sessionPeriod = $derived.by(() => {
    if (meditationSession.status === "running" && meditationSession.pattern) {
      return getPatternCycleTime(meditationSession.pattern);
    }
    return BASE_PERIOD;
  });

  const sessionEasing = $derived.by((): UndulationEasing => {
    if (meditationSession.status === "running" && meditationSession.pattern) {
      return meditationSession.pattern.defaultEasing;
    }
    return "sine";
  });

  const mandalaRotation = $derived(reducedMotion ? 0 : 90);
  const mandalaTipDx = $derived(meditationSession.holdPulseDx);
  const meditateSize = $derived(Math.min(meditateContainerSize, 600));

  function handleMeditateStart(pattern: BreathingPattern, durationMinutes: number) {
    phase = "meditate-session";
    meditationSession.start(pattern, durationMinutes, ANIMATE_MIN, ANIMATE_MAX, handleSessionComplete);
  }

  function handleSessionComplete() {
    audioService.playCompletionBell();
    audioService.stopAmbient();
  }

  function handleMeditateStop() {
    meditationSession.stop();
    audioService.stopAmbient();
    phase = "meditate-config";
  }

  function handleMeditateExit() {
    meditationSession.stop();
    audioService.stopAmbient();
    phase = "detail";
  }

  function handleAmbientChange(track: AmbientTrack) {
    if (track === "none") audioService.stopAmbient();
    else audioService.startAmbient(track);
  }

  function handleVolumeChange(volume: number) {
    audioService.setVolume(volume);
  }

  function handleMeditateAgain() {
    if (meditationSession.pattern) {
      phase = "meditate-session";
      meditationSession.start(
        meditationSession.pattern,
        meditationSession.durationMinutes,
        ANIMATE_MIN, ANIMATE_MAX,
        handleSessionComplete,
      );
    }
  }

  // v1: two direct-download actions in the detail drawer (no options screen).
  // PNG exports at a fixed high-res transparent still; video at the seamless-20s
  // spec (mandala-video.ts). A resolution/background options UI is a later add.
  const PNG_EXPORT_SIZE = 2160;
  let exporting = $state(false);

  async function handleExport() {
    if (!selectedMandala || exporting) return;
    exporting = true;
    try {
      const blob = await exportMandalaPNG(
        selectedMandala.steps,
        selectedMandala.leftPropType,
        selectedMandala.rightPropType,
        {
          size: PNG_EXPORT_SIZE,
          background: "transparent",
          strokeWidth: 2.5,
          show: selectedMandala.variant,
          pathShape: selectedMandala.pathShape ?? "arc",
        },
      );
      const safeName = selectedMandala.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      // Device-gated: native share sheet on mobile (send via text/social/cloud),
      // anchor download on desktop — same pattern the video export uses.
      await shareOrDownloadBlob(blob, `mandala-${safeName}-${PNG_EXPORT_SIZE}px.png`, {
        title: "Flow Arts Composer Mandala",
      });
    } catch (err) {
      console.error("[MandalaExport] Export failed:", err);
      toast.error("Couldn't export the mandala. Please try again.");
    } finally {
      exporting = false;
    }
  }

  // ── Video export (seamless 20s loop; off-thread worker via the shared driver) ──
  let videoExporting = $state(false);
  let videoProgress = $state(0); // 0..1
  let videoPhase = $state<"capturing" | "encoding">("capturing");
  let videoHandle: MandalaVideoExportHandle | null = null;

  function handleVideoExport() {
    if (!selectedMandala || videoExporting) return;
    videoExporting = true;
    videoProgress = 0;
    videoPhase = "capturing";
    const handle = runMandalaVideoExport(
      {
        name: selectedMandala.name,
        steps: selectedMandala.steps,
        leftPropType: selectedMandala.leftPropType,
        rightPropType: selectedMandala.rightPropType,
        variant: selectedMandala.variant,
        pathShape: selectedMandala.pathShape,
      },
      {
        onPhase: (p) => { videoPhase = p; },
        onProgress: (f) => { videoProgress = f; },
      },
    );
    videoHandle = handle;
    handle.done
      .then(() => {
        if (videoHandle !== handle) return;
        videoExporting = false;
        videoHandle = null;
      })
      .catch((err: unknown) => {
        if (videoHandle !== handle) return; // cancelled by us
        console.error("[MandalaExport] Video export failed:", err);
        toast.error("Couldn't export the video. Please try again.");
        videoExporting = false;
        videoHandle = null;
      });
  }

  function cancelVideoExport() {
    const handle = videoHandle;
    videoHandle = null;
    handle?.cancel();
    videoExporting = false;
  }

  // ── Navigation ──
  function selectMandala(item: MandalaItem) {
    selectedMandala = {
      id: item.id,
      name: item.name,
      steps: item.steps,
      variant: item.variant,
      leftPropType: item.leftPropType,
      rightPropType: item.rightPropType,
      pathShape: item.pathShape,
      createdAt: item.createdAt,
      sourceWord: item.sourceWord,
      sourceSequenceId: item.sourceSequenceId,
    };
    deleteConfirming = false;
    phase = "detail";
  }

  function backToGallery() {
    meditationSession.stop();
    audioService.stopAmbient();
    cancelVideoExport();
    selectedMandala = null;
    phase = "gallery";
  }

  onMount(() => {
    // Guest sessions hydrate from localStorage (signed-in boot goes through
    // auth-boot-orchestrator's init(uid) instead — initLocal no-ops then).
    mandalaCollectionState.initLocal();
    return () => {
      clearTimeout(deleteTimer);
      meditationSession.dispose();
      audioService.dispose();
      cancelVideoExport();
    };
  });
</script>

<div class="mandala-module">
  <!-- ═══ GALLERY ═══ -->
  {#if phase === "gallery" || phase === "detail"}
    <CollectionGalleryDetail
      open={phase === "detail" && !!selectedMandala}
      onClose={backToGallery}
      ariaLabel={selectedMandala?.name ?? "Mandala"}
      gallery={galleryView}
      detail={detailView}
    />

  <!-- ═══ MEDITATE CONFIG ═══ -->
  {:else if phase === "meditate-config" && selectedMandala}
    <div class="meditate-layout">
      <div class="meditate-stage" bind:this={meditateStageEl}>
        <SequenceMandala
          sequence={{ steps: selectedMandala.steps }}
          size={meditateSize}
          show={selectedMandala.variant}
          animate={true}
          animateMin={ANIMATE_MIN}
          animateMax={ANIMATE_MAX}
          animatePeriod={BASE_PERIOD}
          animateEasing="sine"
          animateRotation={mandalaRotation}
          leftPropType={selectedMandala.leftPropType}
          rightPropType={selectedMandala.rightPropType}
          pathShape={selectedMandala.pathShape ?? "arc"}
        />
      </div>
      <div class="controls-rail">
        <MeditationControls
          status={meditationSession.status}
          onStart={handleMeditateStart}
          onStop={handleMeditateStop}
          onExit={handleMeditateExit}
          onAmbientChange={handleAmbientChange}
          onVolumeChange={handleVolumeChange}
        />
      </div>
    </div>

  <!-- ═══ MEDITATE SESSION ═══ -->
  {:else if phase === "meditate-session" && selectedMandala}
    <div class="session-viewport" bind:this={meditateStageEl}>
      <SequenceMandala
        sequence={{ steps: selectedMandala.steps }}
        size={meditateSize}
        show={selectedMandala.variant}
        animate={true}
        animateMin={ANIMATE_MIN}
        animateMax={ANIMATE_MAX}
        animatePeriod={sessionPeriod}
        animateEasing={sessionEasing}
        animateRotation={mandalaRotation}
        tipDx={mandalaTipDx}
        leftPropType={selectedMandala.leftPropType}
        rightPropType={selectedMandala.rightPropType}
        pathShape={selectedMandala.pathShape ?? "arc"}
      />
      <MeditationOverlay
        status={meditationSession.status}
        currentPhase={meditationSession.currentPhase}
        phaseElapsed={meditationSession.phaseElapsed}
        phaseDuration={meditationSession.phaseDuration}
        pattern={meditationSession.pattern}
        elapsedSeconds={meditationSession.elapsedSeconds}
        durationMinutes={meditationSession.durationMinutes}
        breathCount={meditationSession.breathCount}
        onMeditateAgain={handleMeditateAgain}
        onBackToMandala={backToGallery}
      />
      <button
        type="button"
        class="session-exit-btn"
        onclick={handleMeditateStop}
        aria-label="End meditation session"
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  {/if}

  {#snippet galleryView()}
    <div class="gallery-view" bind:this={galleryEl}>
      {#if mandalaCollectionState.loading && items.length === 0}
        <div class="loading-state">
          <PanelSpinner size={12} />
          <p class="loading-label">Loading your mandalas…</p>
        </div>
      {:else if items.length === 0}
        <div class="empty-state">
          <i class="fas fa-dharmachakra empty-icon" aria-hidden="true"></i>
          <p class="empty-title">No mandalas yet</p>
          <p class="empty-hint">Open a workspace mandala, then save it here</p>
        </div>
      {:else}
        <header class="gallery-head">
          <h2 class="gallery-title">Mandalas</h2>
          <span class="gallery-count">{items.length}</span>
        </header>
        <div class="gallery-grid">
          {#each items as item (item.id)}
            <button
              type="button"
              class="gallery-card"
              onclick={() => selectMandala(item)}
              aria-label="View {item.name}"
            >
              <div
                class="card-thumb"
                style:width="{cardThumbSize}px"
                style:height="{cardThumbSize}px"
              >
                <SequenceMandala
                  sequence={{ steps: item.steps }}
                  size={cardThumbSize}
                  show={item.variant}
                  leftPropType={item.leftPropType}
                  rightPropType={item.rightPropType}
                  pathShape={item.pathShape ?? "arc"}
                />
              </div>
              <div class="card-label">
                <TKAWordGlyph word={item.name} height={16} darkMode />
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet detailView({ inDrawer }: { inDrawer: boolean })}
    {#if selectedMandala}
      <div class="detail-layout">
        <div class="detail-preview" bind:this={detailPreviewEl}>
          {#if !inDrawer}
            <button
              type="button"
              class="back-btn"
              onclick={backToGallery}
              aria-label="Back to gallery"
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span>Gallery</span>
            </button>
          {/if}
          <SequenceMandala
            sequence={{ steps: selectedMandala.steps }}
            size={detailPreviewSize}
            show={selectedMandala.variant}
            animate={true}
            animateMin={ANIMATE_MIN}
            animateMax={ANIMATE_MAX}
            animatePeriod={BASE_PERIOD}
            animateEasing="sine"
            animateRotation={mandalaRotation}
            leftPropType={selectedMandala.leftPropType}
            rightPropType={selectedMandala.rightPropType}
            pathShape={selectedMandala.pathShape ?? "arc"}
          />
        </div>

        <div class="detail-panel">
          <div class="detail-info">
            <div class="detail-glyphs">
              <TKAWordGlyph word={selectedMandala.name} height={28} darkMode />
            </div>
            {#if selectedMandala.createdAt}
              <span class="detail-date">{dateLabel}</span>
            {/if}
          </div>

          {#if hasLineageSource(selectedMandala)}
            <div class="meta-chips">
              <FilterChipBase
                mode="action"
                size="sm"
                icon="fa-arrow-up-right-from-square"
                label={`From ${simplifyRepeatedWord(selectedMandala.sourceWord ?? "")}`}
                chipColor="var(--theme-accent, #6366f1)"
                onclick={() =>
                  void openLineageSource({
                    sourceWord: selectedMandala!.sourceWord,
                    sourceSequenceId: selectedMandala!.sourceSequenceId,
                    // selectedMandala.steps is typed StepLike (rendering-only
                    // subset) but is always the original CollectedMandala's
                    // StepData[] under the hood — safe to widen back here.
                    steps: selectedMandala!.steps as unknown as StepData[],
                  })}
              />
            </div>
          {/if}

          <div class="detail-actions">
            <button
              type="button"
              class="action-btn meditate-btn"
              onclick={() => { phase = "meditate-config"; }}
            >
              <i class="fas fa-spa" aria-hidden="true"></i>
              <span>Meditate</span>
            </button>

            <button
              type="button"
              class="action-btn export-btn"
              onclick={handleVideoExport}
              disabled={videoExporting}
            >
              {#if videoExporting}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                <span class="export-progress">
                  {videoPhase === "encoding" ? "Encoding" : `${Math.round(videoProgress * 100)}%`}
                </span>
              {:else}
                <i class="fas fa-film" aria-hidden="true"></i>
                <span>{saveActionLabel("Video")}</span>
              {/if}
            </button>

            <button
              type="button"
              class="action-btn export-btn"
              onclick={handleExport}
              disabled={exporting}
            >
              {#if exporting}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                <span>…</span>
              {:else}
                <i class="fas fa-image" aria-hidden="true"></i>
                <span>{saveActionLabel("PNG")}</span>
              {/if}
            </button>
          </div>

          {#if selectedCollected && !mandalaCollectionState.isReadOnlyPreview}
            <MandalaPublicationControls mandala={selectedCollected} />
          {/if}

          {#if !mandalaCollectionState.isReadOnlyPreview}
            <div class="detail-footer">
              <button
                type="button"
                class="action-btn delete-btn"
                class:confirming={deleteConfirming}
                onclick={handleDeleteClick}
              >
                {#if deleteConfirming}
                  <i class="fas fa-check" aria-hidden="true"></i>
                  <span>Confirm Delete</span>
                {:else}
                  <i class="fas fa-trash-alt" aria-hidden="true"></i>
                  <span>Delete</span>
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/snippet}
</div>

<!-- `cancelVideoExport` already existed but had no user-facing control: it only
     ran on unmount/navigation. The takeover exposes it. -->
<ExportTakeover
  phase={videoExporting ? videoPhase : "idle"}
  progress={videoProgress}
  phaseLabel={videoPhase === "encoding" ? "Encoding..." : "Capturing..."}
  onCancel={cancelVideoExport}
  label="Exporting mandala video"
/>

<style>
  .mandala-module {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: transparent;
    container-type: inline-size;
  }

  .gallery-view {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 32px;
  }

  .gallery-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 20px;
  }
  .gallery-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, white);
  }
  .gallery-count {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    padding: 2px 10px;
    font-variant-numeric: tabular-nums;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }

  .gallery-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
    min-height: var(--min-touch-target, 44px);
  }

  @media (hover: hover) {
    .gallery-card:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
      border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
      transform: translateY(-2px);
    }
  }

  .gallery-card:active {
    transform: scale(0.97);
    transition-duration: 50ms;
  }

  .gallery-card:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  /* width/height set inline from cardThumbSize so the live render scales too. */
  .card-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .card-label {
    max-width: 100%;
    overflow: hidden;
    display: flex;
    justify-content: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .empty-icon { font-size: 48px; opacity: 0.3; }
  .empty-title { font-size: 16px; font-weight: 500; margin: 0; }
  .empty-hint { font-size: 13px; margin: 0; opacity: 0.7; }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .loading-label { font-size: 13px; margin: 0; opacity: 0.7; }

  .detail-layout {
    display: flex;
    height: 100%;
  }

  .detail-preview {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .detail-panel {
    width: 320px;
    flex-shrink: 0;
    padding: 24px;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
    align-self: flex-start;
  }

  /* Detail back button floats as a glass pill over the preview's top-left
     (lightbox convention, matching the Tunnels playground). The export phase's
     back-btn keeps the plain inline style above. */
  .detail-preview .back-btn {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 2;
    padding: 8px 18px;
    background: color-mix(in srgb, var(--theme-panel-bg, rgba(10, 10, 20, 0.85)) 80%, transparent);
    backdrop-filter: blur(8px);
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 14px);
  }

  @media (hover: hover) {
    .back-btn:hover {
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, white);
    }
    .detail-preview .back-btn:hover {
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    }
  }

  .back-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  .detail-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-glyphs {
    overflow: hidden;
    color: var(--theme-text, white);
  }

  .detail-date {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .meta-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .detail-footer {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }
  .detail-footer .action-btn {
    width: 100%;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 12px 18px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
  }

  .action-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  .meditate-btn {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #6366f1) 75%, white),
      var(--theme-accent, #6366f1)
    );
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: white;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
  }

  .export-btn {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
  }
  .action-btn:disabled {
    opacity: 0.7;
    cursor: progress;
  }
  /* Tabular figures so the encode % doesn't jitter the button width. */
  .export-progress {
    font-variant-numeric: tabular-nums;
  }

  .delete-btn {
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .delete-btn.confirming {
    background: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
    color: white;
  }

  @media (hover: hover) {
    .meditate-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
    }
    .export-btn:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    }
    .delete-btn:hover {
      color: var(--semantic-error, #ef4444);
      border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    }
    .delete-btn.confirming:hover {
      background: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, black);
    }
  }

  .action-btn:active {
    transform: scale(0.98);
    transition-duration: 50ms;
  }

  .meditate-layout {
    display: flex;
    height: 100%;
  }

  .meditate-stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .controls-rail {
    width: 300px;
    flex-shrink: 0;
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    overflow-y: auto;
  }

  .session-viewport {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .session-exit-btn {
    position: absolute;
    top: 16px;
    left: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 16px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
    z-index: 30;
  }

  @media (hover: hover) {
    .session-exit-btn:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, white);
    }
  }

  .session-exit-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  /* ── Responsive (container-relative, matching the Tunnels playground so both
        surfaces respond to real available width when nested) ── */
  @container (min-width: 1200px) {
    .gallery-view { padding: 40px 48px; }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 20px;
    }
    .detail-panel { width: 380px; padding: 32px; }
  }

  /* 4K / ultrawide: grid density, type, thumbnails, panel width all scale up,
     anchored left so a few cards don't float in a centered ribbon. */
  @container (min-width: 1800px) {
    .gallery-view { padding: 56px 72px; }
    .gallery-head { margin-bottom: 28px; }
    .gallery-title { font-size: 24px; }
    .gallery-count {
      font-size: var(--font-size-min, 14px);
      padding: 3px 14px;
    }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 28px;
    }
    .gallery-card { gap: 14px; padding: 24px 16px 18px; border-radius: 18px; }
    .detail-panel { width: 440px; padding: 40px 36px; gap: 32px; }
    .detail-date { font-size: var(--font-size-min, 14px); }
    .action-btn { min-height: 56px; font-size: 16px; border-radius: 14px; }
    .detail-preview .back-btn {
      top: 28px;
      left: 28px;
      min-height: 52px;
      padding: 10px 22px;
      font-size: var(--font-size-min, 15px);
    }
  }

  @container (max-width: 768px) {
    .gallery-view { padding: 20px; }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
    }

    .detail-layout { flex-direction: column; }
    .detail-preview { flex: 1; min-height: 40%; }
    .detail-panel {
      width: 100%;
      max-height: 55%;
      border-left: none;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    }

    .meditate-layout { flex-direction: column; }
    .meditate-stage { flex: 1; min-height: 0; }
    .controls-rail {
      width: 100%;
      max-height: 50%;
      border-left: none;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    }

  }

  @container (max-width: 480px) {
    .gallery-view { padding: 16px; }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
    }
    .gallery-card { padding: 12px 6px 10px; gap: 8px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .gallery-card, .action-btn, .session-exit-btn, .back-btn {
      transition: none !important;
    }
    .gallery-card:hover, .action-btn:active, .session-exit-btn:active {
      transform: none;
    }
  }
</style>
