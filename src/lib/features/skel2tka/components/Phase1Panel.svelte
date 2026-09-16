<!--
  Phase1Panel - Video upload -> hand analysis -> verification -> training data

  Orchestrates the Phase 1 pipeline:
  1. User uploads a video file
  2. VideoFrameExtractor pulls frames at 15fps
  3. VideoHandAnalyzer runs MediaPipe on each frame
  4. StepBoundaryDetector groups stable positions into beats
  5. Sanity checks run automatically
  6. FrameInspector shows video + overlay for manual verification
  7. User accepts, corrects, or rejects via PhaseVerificationPanel
  8. Accepted/corrected results save as training data
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { Phase1Result } from "../domain/models";
  import type { SanityCheckReport } from "../domain/verification-models";
  import type { PhaseVerdict, UserCorrection } from "../domain/verification-models";
  import type { TrainingPair, VerifiedStepPosition, VideoReference } from "../domain/training-models";
  import type { Phase1OverlayRenderer } from "../services/phase1-overlay-renderer";
  import { checkPhase1 } from "../services/sanity-checker";
  import type { TrainingDataPersister } from "../services/training-data-persister";
  import { getImageModeHandLandmarker } from "$lib/features/skel2tka/get-image-mode-hand-landmarker";
  import { extractFrames } from "$lib/features/skel2tka/services/video-frame-extractor";
  import { getVideoHandAnalyzer } from "$lib/features/skel2tka/get-video-hand-analyzer";
  import { detectBeats } from "$lib/features/skel2tka/services/step-boundary-detector";
  import { getPhase1OverlayRenderer } from "$lib/features/skel2tka/get-phase1-overlay-renderer";
  import { getTrainingDataPersister } from "$lib/features/skel2tka/get-training-data-persister";
  import VideoUploadDropzone from "./VideoUploadDropzone.svelte";
  import TrajectoryTimeline from "./TrajectoryTimeline.svelte";
  import PlacementSequenceOutput from "./PlacementSequenceOutput.svelte";
  import FrameInspector from "./verification/FrameInspector.svelte";
  import SanityCheckPanel from "./verification/SanityCheckPanel.svelte";
  import PhaseVerificationPanel from "./verification/PhaseVerificationPanel.svelte";

  type PipelineState =
    | "idle"
    | "initializing"
    | "extracting"
    | "analyzing"
    | "detecting-beats"
    | "complete"
    | "verified"
    | "error";

  let pipelineState = $state<PipelineState>("idle");
  let progressCurrent = $state(0);
  let progressTotal = $state(0);
  let progressLabel = $state("");
  let errorMessage = $state("");
  let result = $state<Phase1Result | null>(null);
  let videoFile = $state<File | null>(null);
  let sanityReport = $state<SanityCheckReport | null>(null);
  let verificationMessage = $state("");

  const landmarker = getImageModeHandLandmarker();
  const handAnalyzer = getVideoHandAnalyzer();
  const overlayRenderer = getPhase1OverlayRenderer() as Phase1OverlayRenderer;
  const trainingPersister = getTrainingDataPersister() as TrainingDataPersister;

  function onProgress(current: number, total: number, label?: string) {
    progressCurrent = current;
    progressTotal = total;
    if (label) progressLabel = label;
  }

  async function handleFileSelected(file: File) {
    pipelineState = "initializing";
    result = null;
    videoFile = file;
    sanityReport = null;
    verificationMessage = "";
    errorMessage = "";
    progressCurrent = 0;
    progressTotal = 0;
    const startTime = performance.now();

    try {
      // Step 0: Initialize MediaPipe if needed (~9MB download on first use)
      if (!landmarker.isInitialized) {
        progressLabel = t('skel2tka_downloading_model');
        await landmarker.initialize();
      }

      // Step 1: Extract frames
      pipelineState = "extracting";
      progressLabel = t('skel2tka_extracting_frames');
      const frames = await extractFrames(
        file,
        { fps: 15 },
        onProgress
      );

      if (frames.length === 0) {
        throw new Error("No frames could be extracted from the video");
      }

      const lastFrame = frames[frames.length - 1];
      const duration = lastFrame?.timestamp ?? 0;

      // Step 2: Analyze hands
      pipelineState = "analyzing";
      progressLabel = t('skel2tka_analyzing_hands');
      const timeline = await handAnalyzer.analyze(frames, 15, duration, onProgress);

      // Step 3: Detect beats
      pipelineState = "detecting-beats";
      progressLabel = t('skel2tka_detecting_beats');
      const beats = detectBeats(timeline);

      const processingTimeMs = performance.now() - startTime;

      result = { timeline, beats, processingTimeMs };

      // Step 4: Run sanity checks
      sanityReport = checkPhase1(result);

      pipelineState = "complete";
    } catch (err) {
      console.error("[Skel2TKA] Phase 1 error:", err);
      errorMessage = err instanceof Error ? err.message : t('skel2tka_analysis_failed');
      pipelineState = "error";
    }
  }

  async function handleVerdict(verdict: PhaseVerdict, corrections: UserCorrection[]) {
    if (!result || !videoFile) return;

    if (verdict === "rejected") {
      // Reset to idle so user can try again
      pipelineState = "idle";
      result = null;
      sanityReport = null;
      videoFile = null;
      return;
    }

    // Build training pair
    try {
      await trainingPersister.initialize();

      const videoRef: VideoReference = {
        fileName: videoFile.name,
        fileSizeBytes: videoFile.size,
        durationSec: result.timeline.duration,
        width: 0, // Populated by FrameInspector if available
        height: 0,
        extractionFps: result.timeline.fps,
        fileHash: await computeFileHash(videoFile),
      };

      const verifiedBeats: VerifiedStepPosition[] = result.beats.map((step) => {
        const leftPos = step.positions.find((p) => p.hand === "left");
        const rightPos = step.positions.find((p) => p.hand === "right");

        // Apply corrections if any
        let leftLocation = leftPos?.location ?? null;
        let rightLocation = rightPos?.location ?? null;

        for (const correction of corrections) {
          if (correction.stepNumber === step.index && correction.field === "hand_position") {
            if (correction.hand === "left") {
              leftLocation = correction.correctedValue as typeof leftLocation;
            } else if (correction.hand === "right") {
              rightLocation = correction.correctedValue as typeof rightLocation;
            }
          }
        }

        return {
          stepNumber: step.index,
          leftLocation,
          rightLocation,
          placementLabel: step.placementLabel,
          startTime: step.startTime,
          endTime: step.endTime,
        };
      });

      const pair: TrainingPair = {
        id: crypto.randomUUID(),
        video: videoRef,
        input: {
          phase: 1,
          detectionFrames: result.timeline.frames,
          fps: result.timeline.fps,
          duration: result.timeline.duration,
        },
        output: {
          beats: verifiedBeats,
          verificationMethod: verdict === "accepted" ? "accepted" : "corrected",
          corrections,
        },
        createdAt: Date.now(),
        synced: false,
        verifiedBy: "austen",
      };

      await trainingPersister.save(pair);

      const stats = await trainingPersister.getStats();
      verificationMessage = t('skel2tka_training_saved', { total: String(stats.totalPairs), accepted: String(stats.acceptedPairs), corrected: String(stats.correctedPairs) });
      pipelineState = "verified";
    } catch (err) {
      console.error("[Skel2TKA] Failed to save training pair:", err);
      verificationMessage = t('skel2tka_training_save_failed');
      pipelineState = "verified";
    }
  }

  async function computeFileHash(file: File): Promise<string> {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // crypto.subtle may not be available in insecure contexts
      return `${file.name}-${file.size}-${file.lastModified}`;
    }
  }

  const isProcessing = $derived(
    pipelineState === "initializing" ||
    pipelineState === "extracting" ||
    pipelineState === "analyzing" ||
    pipelineState === "detecting-beats"
  );

  const progressPercent = $derived(
    progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0
  );
</script>

<div class="phase1-panel">
  <div class="upload-section">
    <VideoUploadDropzone onFileSelected={handleFileSelected} disabled={isProcessing} />
  </div>

  {#if isProcessing}
    <div class="progress-section">
      <div class="progress-header">
        <i class="fas fa-circle-notch fa-spin"></i>
        <span>{progressLabel}...</span>
        {#if progressTotal > 0}
          <span class="progress-count">{progressCurrent} / {progressTotal}</span>
        {/if}
      </div>
      {#if pipelineState === "initializing"}
        <div class="progress-bar indeterminate">
          <div class="progress-fill-indeterminate"></div>
        </div>
      {:else}
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progressPercent}%"></div>
        </div>
      {/if}
    </div>
  {/if}

  {#if pipelineState === "error"}
    <div class="error-section">
      <i class="fas fa-exclamation-triangle"></i>
      <span>{errorMessage}</span>
    </div>
  {/if}

  {#if (pipelineState === "complete" || pipelineState === "verified") && result}
    <div class="results-section">
      <div class="results-header">
        <h3>{t('skel2tka_results')}</h3>
        <span class="timing">
          {t('skel2tka_frames_analyzed', { frames: String(result.timeline.frames.length), seconds: (result.processingTimeMs / 1000).toFixed(1) })}
        </span>
      </div>

      <TrajectoryTimeline timeline={result.timeline} />
      <PlacementSequenceOutput beats={result.beats} />

      {#if sanityReport}
        <SanityCheckPanel report={sanityReport} />
      {/if}

      {#if videoFile && pipelineState === "complete"}
        <FrameInspector
          {videoFile}
          {result}
          renderer={overlayRenderer}
        />

        <PhaseVerificationPanel
          beats={result.beats}
          onVerdict={handleVerdict}
        />
      {/if}

      {#if pipelineState === "verified" && verificationMessage}
        <div class="verification-result">
          <i class="fas fa-database"></i>
          <span>{verificationMessage}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .phase1-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    overflow-y: auto;
  }

  .upload-section {
    max-width: 480px;
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 480px;
  }

  .progress-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #ffffff);
  }

  .progress-header i {
    color: var(--theme-accent, #3b82f6);
  }

  .progress-count {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
  }

  .progress-bar {
    height: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #3b82f6);
    border-radius: 3px;
    transition: width 0.15s ease-out;
  }

  .progress-fill-indeterminate {
    height: 100%;
    width: 40%;
    background: var(--theme-accent, #3b82f6);
    border-radius: 3px;
    animation: indeterminate 1.5s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .error-section {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 8px;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
    max-width: 480px;
  }

  .results-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .results-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .results-header h3 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .timing {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .verification-result {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-success, #22c55e) 20%, transparent);
    border-radius: 8px;
    font-size: var(--font-size-min, 14px);
    color: var(--semantic-success, #22c55e);
  }
</style>
