<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type {
    TrackedFrame,
    BoundingBox,
    TrackingSession,
    NormalizedPoint,
  } from "../domain/models";
  import { SimplePropTracker } from "../services/simple-prop-tracker";
  import VideoCanvas from "./VideoCanvas.svelte";
  import TrajectoryOverlay from "./TrajectoryOverlay.svelte";
  import ControlBar from "./ControlBar.svelte";
  import {
    ColorEndTracker,
    type ColorTarget,
  } from "../services/color-end-tracker";
  import { endpointPairToPose } from "../services/color-flow-pipeline";
  import { ScreenToGrid } from "../services/screen-to-grid";
  import { framesToNotation } from "../services/notation-pipeline";
  import type { BeatNotation } from "../services/notation-pipeline";
  import type { StaffPose3D, TrackConfidence } from "../domain/notation-3d";
  import { zeroTrackConfidence } from "../domain/notation-3d";
  import NotationReviewPanel from "./NotationReviewPanel.svelte";
  import {
    IntensityStaffTracker,
    detectBlobs,
    fitStaffs,
    DEFAULT_INTENSITY_CONFIG,
    type IntensityConfig,
  } from "../services/intensity-staff-tracker";

  let videoFile = $state<File | null>(null);
  let videoUrl = $state<string | null>(null);
  let videoElement = $state<HTMLVideoElement | null>(null);
  let videoDuration = $state(0);
  let videoWidth = $state(0);
  let videoHeight = $state(0);
  let fps = $state(30);

  type LabPhase = "upload" | "draw-box" | "tracking" | "review";
  let phase = $state<LabPhase>("upload");
  let initialBox = $state<BoundingBox | null>(null);
  let trackedFrames = $state<TrackedFrame[]>([]);
  let currentFrameIndex = $state(0);
  let isTracking = $state(false);
  let trackingProgress = $state(0);

  let extractionCanvas: HTMLCanvasElement | null = null;
  let extractionCtx: CanvasRenderingContext2D | null = null;

  // Live preview while tracking runs — shows each processed frame + the tracked box.
  let previewCanvas = $state<HTMLCanvasElement | null>(null);

  function drawTrackingPreview(frame: TrackedFrame) {
    if (!previewCanvas || !extractionCanvas) return;
    if (previewCanvas.width !== videoWidth) {
      previewCanvas.width = videoWidth;
      previewCanvas.height = videoHeight;
    }
    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(extractionCanvas, 0, 0);
    if (frame.propBox) {
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = Math.max(2, videoWidth / 400);
      ctx.strokeRect(
        frame.propBox.x * videoWidth,
        frame.propBox.y * videoHeight,
        frame.propBox.width * videoWidth,
        frame.propBox.height * videoHeight
      );
    }
    if (frame.tip) {
      ctx.fillStyle = "#f43f5e";
      ctx.beginPath();
      ctx.arc(
        frame.tip.x * videoWidth,
        frame.tip.y * videoHeight,
        Math.max(4, videoWidth / 250),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  const tracker = new SimplePropTracker();

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (!file.type.startsWith("video/")) {
        alert("Please select a video file");
        return;
      }

      videoFile = file;
      videoUrl = URL.createObjectURL(file);
      phase = "draw-box";
    }
  }

  function handleVideoLoaded(event: Event) {
    const video = event.target as HTMLVideoElement;
    videoElement = video;
    videoDuration = video.duration * 1000;
    videoWidth = video.videoWidth;
    videoHeight = video.videoHeight;

    fps = 30;

    // Seed grid calibration defaults once dims are known; don't clobber a user adjustment.
    if (radiusPx === 0) {
      centerX = videoWidth / 2;
      centerY = videoHeight / 2;
      radiusPx = videoHeight / 4;
    }

    video.currentTime = 0;
    video.pause();
  }

  function handleBoxDrawn(box: BoundingBox) {
    initialBox = box;
  }

  async function startTracking() {
    if (!initialBox || !videoElement) return;

    phase = "tracking";
    isTracking = true;
    trackedFrames = [];
    trackingProgress = 0;

    extractionCanvas = document.createElement("canvas");
    extractionCanvas.width = videoWidth;
    extractionCanvas.height = videoHeight;
    extractionCtx = extractionCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!extractionCtx) {
      console.error("Could not get canvas context");
      return;
    }

    const totalFrames = Math.floor((videoDuration / 1000) * fps);
    const frameDuration = 1000 / fps;

    videoElement.currentTime = 0;
    await waitForSeek(videoElement);

    extractionCtx.drawImage(videoElement, 0, 0);
    const firstFrameData = extractionCtx.getImageData(
      0,
      0,
      videoWidth,
      videoHeight
    );

    const firstTrackedFrame = await tracker.initialize(
      firstFrameData,
      initialBox
    );
    trackedFrames = [firstTrackedFrame];
    trackingProgress = 1 / totalFrames;
    drawTrackingPreview(firstTrackedFrame);

    for (let i = 1; i < totalFrames; i++) {
      const timestamp = i * frameDuration;
      videoElement.currentTime = timestamp / 1000;
      await waitForSeek(videoElement);

      extractionCtx.drawImage(videoElement, 0, 0);
      const frameData = extractionCtx.getImageData(
        0,
        0,
        videoWidth,
        videoHeight
      );

      const trackedFrame = await tracker.trackFrame(frameData, i, timestamp);
      trackedFrames = [...trackedFrames, trackedFrame];
      trackingProgress = (i + 1) / totalFrames;
      drawTrackingPreview(trackedFrame);

      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    isTracking = false;
    phase = "review";
    currentFrameIndex = 0;
  }

  function waitForSeek(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        video.removeEventListener("seeked", handler);
        resolve();
      };
      video.addEventListener("seeked", handler);
    });
  }

  let notationBeats = $state<BeatNotation[]>([]);
  let isNotating = $state(false);
  // Grid calibration (defaults filled once the video dims are known).
  let centerX = $state(0);
  let centerY = $state(0);
  let radiusPx = $state(0);
  // Per-staff LED colors (sampled from the video). Defaults are placeholders.
  let leftColor = $state<ColorTarget>({ r: 0, g: 0, b: 255, tolerance: 60 });
  let rightColor = $state<ColorTarget>({ r: 255, g: 0, b: 0, tolerance: 60 });
  // Click mode for sampling: null | 'center' | 'radius' | 'blue' | 'red'.
  let calibMode = $state<null | "center" | "radius" | "blue" | "red">(null);

  // Tracker mode: 'intensity' = colorless LED detection (real color-cycling
  // staffs on dark footage); 'color' = legacy fixed-color sampling.
  let trackerMode = $state<"intensity" | "color">("intensity");
  let intensityConfig = $state<IntensityConfig>({
    ...DEFAULT_INTENSITY_CONFIG,
  });
  // Which detected staff slot maps to the left hand (swap if mislabeled).
  let swapStaffs = $state(false);
  // Live overlay canvas during notation / detection preview.
  let notateCanvas = $state<HTMLCanvasElement | null>(null);

  function grabFrame(): ImageData | null {
    if (!videoElement) return null;
    extractionCanvas ??= document.createElement("canvas");
    extractionCanvas.width = videoWidth;
    extractionCanvas.height = videoHeight;
    extractionCtx ??= extractionCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!extractionCtx) return null;
    extractionCtx.drawImage(videoElement, 0, 0);
    return extractionCtx.getImageData(0, 0, videoWidth, videoHeight);
  }

  // Draw detection overlay (blobs + fitted staff lines) for one frame.
  function drawDetectionOverlay(frame: ImageData) {
    if (!notateCanvas) return;
    if (notateCanvas.width !== videoWidth) {
      notateCanvas.width = videoWidth;
      notateCanvas.height = videoHeight;
    }
    const ctx = notateCanvas.getContext("2d");
    if (!ctx || !extractionCanvas) return;
    ctx.drawImage(extractionCanvas, 0, 0);
    const blobs = detectBlobs(frame, intensityConfig);
    const staffs = fitStaffs(blobs, intensityConfig, videoHeight);
    ctx.lineWidth = Math.max(2, videoWidth / 500);
    for (const b of blobs) {
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.strokeRect(b.x - 4, b.y - 4, 8, 8);
    }
    staffs.forEach((s, i) => {
      ctx.strokeStyle = i === 0 ? "#22d3ee" : "#f43f5e";
      ctx.beginPath();
      ctx.moveTo(s.p0.x, s.p0.y);
      ctx.lineTo(s.p1.x, s.p1.y);
      ctx.stroke();
      for (const p of [s.p0, s.p1]) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(4, videoWidth / 300), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function previewDetection() {
    const frame = grabFrame();
    if (frame) drawDetectionOverlay(frame);
  }

  function reviewVideoClick(ev: MouseEvent) {
    if (!calibMode || !videoElement) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    // Map CSS click coords -> video pixel coords (object-fit: contain aware enough for calibration).
    const sx = (ev.clientX - rect.left) / rect.width;
    const sy = (ev.clientY - rect.top) / rect.height;
    const px = Math.round(sx * videoWidth);
    const py = Math.round(sy * videoHeight);
    if (calibMode === "center") {
      centerX = px;
      centerY = py;
    } else if (calibMode === "radius") {
      radiusPx = Math.max(1, Math.hypot(px - centerX, py - centerY));
    } else if (calibMode === "blue" || calibMode === "red") {
      extractionCanvas ??= document.createElement("canvas");
      extractionCanvas.width = videoWidth;
      extractionCanvas.height = videoHeight;
      extractionCtx ??= extractionCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (extractionCtx) {
        extractionCtx.drawImage(videoElement, 0, 0);
        const d = extractionCtx.getImageData(px, py, 1, 1).data;
        const c: ColorTarget = { r: d[0]!, g: d[1]!, b: d[2]!, tolerance: 60 };
        if (calibMode === "blue") leftColor = c;
        else rightColor = c;
      }
    }
    calibMode = null;
  }

  async function runNotation() {
    if (!videoElement) return;
    const video = videoElement;
    isNotating = true;
    notationBeats = [];

    const cal = new ScreenToGrid({ x: centerX, y: centerY }, radiusPx);
    const leftTracker = new ColorEndTracker();
    const rightTracker = new ColorEndTracker();

    const leftFrames = [];
    const rightFrames = [];
    const leftConf = [];
    const rightConf = [];
    const leftDetail = [];
    const rightDetail = [];
    let lastLeft = null;
    let lastRight = null;

    const total = Math.floor((videoDuration / 1000) * fps);
    const dt = 1000 / fps;
    extractionCanvas ??= document.createElement("canvas");
    extractionCanvas.width = videoWidth;
    extractionCanvas.height = videoHeight;
    extractionCtx ??= extractionCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!extractionCtx) {
      isNotating = false;
      return;
    }

    const intensityTracker = new IntensityStaffTracker(intensityConfig);

    for (let i = 0; i < total; i++) {
      video.currentTime = (i * dt) / 1000;
      await waitForSeek(video);
      extractionCtx.drawImage(video, 0, 0);
      const frame = extractionCtx.getImageData(0, 0, videoWidth, videoHeight);

      if (trackerMode === "intensity") {
        const result = intensityTracker.track(frame);
        drawDetectionOverlay(frame);
        const bPair = swapStaffs ? result.pairs[1] : result.pairs[0];
        const rPair = swapStaffs ? result.pairs[0] : result.pairs[1];
        if (bPair) {
          lastLeft = endpointPairToPose(bPair, cal);
          leftConf.push(bPair.confidence);
          leftDetail.push(bPair.detail);
        } else {
          leftConf.push(0);
          leftDetail.push(zeroTrackConfidence());
        }
        if (lastLeft) leftFrames.push(lastLeft);
        if (rPair) {
          lastRight = endpointPairToPose(rPair, cal);
          rightConf.push(rPair.confidence);
          rightDetail.push(rPair.detail);
        } else {
          rightConf.push(0);
          rightDetail.push(zeroTrackConfidence());
        }
        if (lastRight) rightFrames.push(lastRight);
        continue;
      }

      const leftPair = leftTracker.track(frame, leftColor);
      if (leftPair) {
        lastLeft = endpointPairToPose(leftPair, cal);
        leftConf.push(leftPair.confidence);
        leftDetail.push(leftPair.detail);
      } else {
        leftConf.push(0);
        leftDetail.push(zeroTrackConfidence());
      }
      if (lastLeft) leftFrames.push(lastLeft);

      const rightPair = rightTracker.track(frame, rightColor);
      if (rightPair) {
        lastRight = endpointPairToPose(rightPair, cal);
        rightConf.push(rightPair.confidence);
        rightDetail.push(rightPair.detail);
      } else {
        rightConf.push(0);
        rightDetail.push(zeroTrackConfidence());
      }
      if (lastRight) rightFrames.push(lastRight);
    }

    notationBeats = framesToNotation(
      leftFrames,
      rightFrames,
      leftConf,
      rightConf,
      undefined,
      undefined,
      leftDetail,
      rightDetail
    );
    isNotating = false;
  }

  function toggleKeyframe(frameIndex: number) {
    trackedFrames = trackedFrames.map((frame, i) =>
      i === frameIndex ? { ...frame, isKeyframe: !frame.isKeyframe } : frame
    );
  }

  function markCurrentAsKeyframe() {
    toggleKeyframe(currentFrameIndex);
  }

  function seekToFrame(index: number) {
    if (index >= 0 && index < trackedFrames.length) {
      currentFrameIndex = index;
      if (videoElement && trackedFrames[index]) {
        videoElement.currentTime = trackedFrames[index].timestamp / 1000;
      }
    }
  }

  function nextFrame() {
    seekToFrame(currentFrameIndex + 1);
  }

  function prevFrame() {
    seekToFrame(currentFrameIndex - 1);
  }

  function nextKeyframe() {
    for (let i = currentFrameIndex + 1; i < trackedFrames.length; i++) {
      if (trackedFrames[i]?.isKeyframe) {
        seekToFrame(i);
        return;
      }
    }
  }

  function prevKeyframe() {
    for (let i = currentFrameIndex - 1; i >= 0; i--) {
      if (trackedFrames[i]?.isKeyframe) {
        seekToFrame(i);
        return;
      }
    }
  }

  let currentFrame = $derived(trackedFrames[currentFrameIndex] ?? null);
  let keyframeCount = $derived(
    trackedFrames.filter((f) => f.isKeyframe).length
  );
  let trajectory = $derived(
    trackedFrames
      .map((f) => f.tip)
      .filter((t): t is NormalizedPoint => t !== null)
  );

  onDestroy(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    tracker.reset();
  });
</script>

<div class="prop-tracking-lab">
  <header class="lab-header">
    <h1>Prop Tracking Lab</h1>
    <p class="subtitle">Proof of Concept: Video → TKA Notation</p>
  </header>

  {#if phase === "upload"}
    <!-- PHASE 1: Upload Video -->
    <div class="upload-section">
      <div class="upload-card">
        <i class="fa fa-video-camera" aria-hidden="true"></i>
        <h2>Upload a Video</h2>
        <p>Select a video of prop spinning to analyze</p>
        <label class="upload-btn">
          <input
            type="file"
            accept="video/*"
            onchange={handleFileSelect}
            class="sr-only"
          />
          <span>Choose Video</span>
        </label>
      </div>
    </div>
  {:else if phase === "draw-box"}
    <!-- PHASE 2: Draw Bounding Box -->
    <div class="draw-section">
      <div class="instructions">
        <h2>Draw a box around the prop</h2>
        <p>
          Click and drag to draw a bounding box around the prop in the first
          frame
        </p>
      </div>

      <VideoCanvas
        {videoUrl}
        onVideoLoaded={handleVideoLoaded}
        onBoxDrawn={handleBoxDrawn}
        drawnBox={initialBox}
      />

      <div class="action-bar">
        {#if initialBox}
          <button class="btn-primary" onclick={startTracking}>
            <i class="fa fa-play" aria-hidden="true"></i>
            Start Tracking
          </button>
        {/if}
        <button class="btn-secondary" onclick={() => (phase = "review")}>
          <i class="fa fa-bolt" aria-hidden="true"></i>
          Skip to notation (LED auto)
        </button>
      </div>
    </div>
  {:else if phase === "tracking"}
    <!-- PHASE 3: Tracking in Progress -->
    <div class="tracking-section">
      <div class="tracking-preview">
        <canvas bind:this={previewCanvas} class="preview-canvas"></canvas>
      </div>
      <div class="progress-card">
        <h2>Tracking Prop...</h2>
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: {trackingProgress * 100}%"
          ></div>
        </div>
        <p>{Math.round(trackingProgress * 100)}% complete</p>
        <p class="frame-count">
          {trackedFrames.length} frames processed · confidence {(
            (trackedFrames[trackedFrames.length - 1]?.confidence ?? 0) * 100
          ).toFixed(0)}%
        </p>
      </div>
    </div>
  {:else if phase === "review"}
    <!-- PHASE 4: Review Results -->
    <div class="review-section">
      <div
        class="video-container"
        class:calibrating={calibMode !== null}
        onclick={reviewVideoClick}
        role="presentation"
      >
        {#if videoUrl}
          <video
            src={videoUrl}
            bind:this={videoElement}
            class="review-video"
            muted
          ></video>
          <TrajectoryOverlay
            {trajectory}
            currentTip={currentFrame?.tip ?? null}
            {videoWidth}
            {videoHeight}
          />
          {#if currentFrame?.propBox}
            <div
              class="tracking-box"
              style="
								left: {currentFrame.propBox.x * 100}%;
								top: {currentFrame.propBox.y * 100}%;
								width: {currentFrame.propBox.width * 100}%;
								height: {currentFrame.propBox.height * 100}%;
							"
            ></div>
          {/if}
        {/if}
      </div>

      {#if trackedFrames.length > 0}
        <ControlBar
          {currentFrameIndex}
          totalFrames={trackedFrames.length}
          {keyframeCount}
          isKeyframe={currentFrame?.isKeyframe ?? false}
          confidence={currentFrame?.confidence ?? 0}
          onPrevFrame={prevFrame}
          onNextFrame={nextFrame}
          onPrevKeyframe={prevKeyframe}
          onNextKeyframe={nextKeyframe}
          onToggleKeyframe={markCurrentAsKeyframe}
          onSeek={seekToFrame}
        />
      {/if}

      <div class="detect-panel">
        <div class="detect-row">
          <button
            class:active={trackerMode === "intensity"}
            onclick={() => (trackerMode = "intensity")}
          >
            LED intensity (auto)
          </button>
          <button
            class:active={trackerMode === "color"}
            onclick={() => (trackerMode = "color")}
          >
            Fixed colors
          </button>
          {#if trackerMode === "intensity"}
            <button
              class:active={swapStaffs}
              onclick={() => (swapStaffs = !swapStaffs)}
            >
              Swap hands
            </button>
            <button onclick={previewDetection}>Preview detection</button>
          {/if}
        </div>
        {#if trackerMode === "intensity"}
          <div class="detect-row sliders">
            <label>
              Brightness {intensityConfig.lumaThreshold}
              <input
                type="range"
                min="80"
                max="250"
                bind:value={intensityConfig.lumaThreshold}
                oninput={previewDetection}
              />
            </label>
            <label>
              LED peak {intensityConfig.peakMin}
              <input
                type="range"
                min="120"
                max="255"
                bind:value={intensityConfig.peakMin}
                oninput={previewDetection}
              />
            </label>
            <label>
              Line snap {intensityConfig.lineTolerancePx}px
              <input
                type="range"
                min="4"
                max="40"
                bind:value={intensityConfig.lineTolerancePx}
                oninput={previewDetection}
              />
            </label>
          </div>
          <div class="detect-preview">
            <canvas bind:this={notateCanvas} class="detect-canvas"></canvas>
          </div>
        {/if}
      </div>

      <div class="stats-panel">
        <div class="stat">
          <span class="stat-label">Frame</span>
          <span class="stat-value"
            >{currentFrameIndex + 1} / {trackedFrames.length}</span
          >
        </div>
        <div class="stat">
          <span class="stat-label">Confidence</span>
          <span class="stat-value"
            >{((currentFrame?.confidence ?? 0) * 100).toFixed(1)}%</span
          >
        </div>
        <div class="stat">
          <span class="stat-label">Angle</span>
          <span class="stat-value">
            {currentFrame?.angle !== null
              ? `${(((currentFrame?.angle ?? 0) * 180) / Math.PI).toFixed(1)}°`
              : "N/A"}
          </span>
        </div>
        <div class="stat">
          <span class="stat-label">Keyframes</span>
          <span class="stat-value">{keyframeCount}</span>
        </div>
      </div>

      <div class="calib-panel">
        <button
          class:active={calibMode === "center"}
          onclick={() => (calibMode = "center")}
        >
          Set center
        </button>
        <button
          class:active={calibMode === "radius"}
          onclick={() => (calibMode = "radius")}
        >
          Set radius
        </button>
        <button
          class:active={calibMode === "blue"}
          onclick={() => (calibMode = "blue")}
        >
          Sample blue staff
        </button>
        <button
          class:active={calibMode === "red"}
          onclick={() => (calibMode = "red")}
        >
          Sample red staff
        </button>
        <span class="calib-readout">
          center {Math.round(centerX)},{Math.round(centerY)} · r {Math.round(
            radiusPx
          )}
        </span>
      </div>

      <div class="notation-actions">
        <button
          class="btn-primary"
          onclick={runNotation}
          disabled={isNotating || radiusPx <= 0}
        >
          <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
          {isNotating ? "Notating…" : "Notate Flow"}
        </button>
      </div>
      {#if notationBeats.length > 0}
        <NotationReviewPanel beats={notationBeats} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .prop-tracking-lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    gap: 1rem;
    overflow: auto;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
  }

  .lab-header {
    text-align: center;
  }

  .lab-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .subtitle {
    margin: 0.25rem 0 0;
    font-size: var(--font-size-min);
    opacity: 0.7;
  }

  /* Upload Phase */
  .upload-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .upload-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem;
    background: var(--theme-card-bg);
    border: 2px dashed var(--theme-stroke);
    border-radius: 16px;
    text-align: center;
  }

  .upload-card i {
    font-size: 3rem;
    opacity: 0.5;
  }

  .upload-card h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .upload-card p {
    margin: 0;
    opacity: 0.7;
  }

  .upload-btn {
    display: inline-flex;
    padding: 0.875rem 1.5rem;
    background: var(--theme-accent);
    color: white;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: transform var(--duration-normal);
  }

  .upload-btn:hover {
    transform: translateY(-1px);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  /* Draw Phase */
  .draw-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .instructions {
    text-align: center;
  }

  .instructions h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .instructions p {
    margin: 0.25rem 0 0;
    opacity: 0.7;
    font-size: var(--font-size-min);
  }

  .action-bar {
    display: flex;
    justify-content: center;
    padding: 1rem;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, var(--semantic-success), #059669);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform var(--duration-normal);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
  }

  /* Tracking Phase */
  .tracking-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .tracking-preview {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: black;
    border-radius: 12px;
    overflow: hidden;
  }

  .preview-canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .progress-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 2rem;
    background: var(--theme-card-bg);
    border-radius: 16px;
    min-width: 300px;
  }

  .progress-card h2 {
    margin: 0;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--theme-stroke);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent);
    transition: width var(--duration-instant);
  }

  .frame-count {
    opacity: 0.7;
    font-size: var(--font-size-compact);
  }

  /* Review Phase */
  .review-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .video-container {
    position: relative;
    flex: 0 0 auto;
    height: min(45vh, 520px);
    background: black;
    border-radius: 12px;
    overflow: hidden;
  }

  .review-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .tracking-box {
    position: absolute;
    border: 2px solid var(--semantic-success);
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
    pointer-events: none;
  }

  .stats-panel {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .stat-label {
    font-size: var(--font-size-compact);
    opacity: 0.6;
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 600;
  }

  .video-container.calibrating {
    cursor: crosshair;
  }

  .calib-panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .calib-panel button {
    padding: 0.375rem 0.75rem;
    background: var(--theme-stroke);
    color: var(--theme-text);
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast);
  }

  .calib-panel button:hover {
    border-color: var(--theme-accent);
  }

  .calib-panel button.active {
    background: var(--theme-accent);
    color: white;
    border-color: var(--theme-accent);
  }

  .calib-readout {
    margin-left: auto;
    font-size: var(--font-size-compact);
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform var(--duration-normal),
      border-color var(--duration-fast);
  }

  .btn-secondary:hover {
    border-color: var(--theme-accent);
    transform: translateY(-1px);
  }

  .detect-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .detect-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .detect-row button {
    padding: 0.375rem 0.75rem;
    background: var(--theme-stroke);
    color: var(--theme-text);
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: var(--font-size-compact);
    cursor: pointer;
  }

  .detect-row button.active {
    background: var(--theme-accent);
    color: white;
  }

  .detect-row.sliders label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: var(--font-size-compact);
    opacity: 0.85;
    min-width: 140px;
    font-variant-numeric: tabular-nums;
  }

  .detect-preview {
    display: flex;
    justify-content: center;
    background: black;
    border-radius: 8px;
    overflow: hidden;
  }

  .detect-canvas {
    max-width: 100%;
    max-height: 40vh;
    object-fit: contain;
  }

  .notation-actions {
    display: flex;
    justify-content: center;
    padding: 0.5rem;
  }

  @media (max-width: 600px) {
    .stats-panel {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
