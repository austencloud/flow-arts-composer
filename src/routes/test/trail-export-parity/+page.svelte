<script lang="ts">
  /**
   * Trail Export Parity Test
   *
   * Automated proof that the exported MP4's trails match the live render.
   *
   * Pipeline per run (all phases reported through the ParityHarness progress bar):
   *   1. Load a high-motion sequence into the offscreen live engine (trails on).
   *   2. Warm the trail accumulator (play + loop 3s) to reproduce warm-state.
   *   3. Run the REAL video export (VideoExportOrchestrator). A parity hook stashes
   *      a copy of the PRE-ENCODE composite for a strided sample of frames.
   *   4. Decode the finished MP4 (mediabunny) and diff decoded-vs-preencode per
   *      frame → ENCODER gate (body, edges masked).
   *   5. Re-render the sampled frames on the LIVE engine (resized to output res,
   *      deterministic renderFrameSync drive) and diff offscreen-vs-live → LIVE
   *      gate (the real test that the offscreen path didn't drop an effect).
   *
   * The live engine is mounted OFFSCREEN: the live gate needs the real registered
   * instance, but the viewer shouldn't watch it warm up and jump. Result mirrored
   * to window.__trailParityResult for headless inspection.
   */
  import { onMount, onDestroy } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { getSequenceRepository } from "$lib/shared/create/get-sequence-repository";
  import { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";
  import { getVideoExportOrchestrator } from "$lib/shared/animation-engine/get-video-export-orchestrator";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { getRenderContextRegistry } from "$lib/shared/animation-engine/get-render-context-registry";
  import { assembleExportEngineProps } from "$lib/shared/video-export/services/export-engine-props";
  import { Input, BufferSource, ALL_FORMATS, VideoSampleSink } from "mediabunny";
  import ParityHarness from "$lib/shared/parity/ParityHarness.svelte";
  import { diff, bodyDiff, flattenToCanvas, AA_TOLERANCE } from "$lib/shared/parity/image-diff";
  import type { ParityRun, ParityRow, ParityVerdict } from "$lib/shared/parity/parity-types";

  // Bit-exact parity vs a lossy codec is impossible — residual lives on hard
  // edges (4:2:0 chroma). The meaningful test is BODY parity: diff only the
  // interior with high-contrast edges masked out.
  const PASS_MAX_DELTA = 32; // body channel delta (edges excluded), encoder gate
  const PASS_DIFF_PCT = 0.5; // body % pixels over tolerance, encoder gate
  // Offscreen-vs-LIVE gate. Compares the deterministic offscreen export render
  // against the REAL live engine driven through the same renderFrameSync path.
  const PASS_LIVE_MAX_DELTA = 40; // body channel delta, offscreen vs live
  const PASS_LIVE_DIFF_PCT = 1.0; // body % pixels over tolerance, offscreen vs live

  let word = $state("DJDJ");
  let resolution = $state<720 | 1080 | 2160>(1080);
  // Default to the production export fps (VIDEO_EXPORT_FPS = 60). The trail
  // overlay is render-cadence dependent, so the parity test runs at the same fps
  // the shipped export uses.
  let fps = $state(60);
  let codec = $state<"h264" | "av1">("av1");

  let canvas: HTMLCanvasElement | null = null;

  // Per-instance playback stack (mirrors InlineAnimationPlayer).
  const animationState = createAnimationPanelState();
  // Effects config drives trail rendering. setActiveEffect("trails") populates
  // tipEffectMap {"*":{effect:"trails"}} — WITHOUT this the renderer filters
  // every tip and no trail is drawn. Passing it to AnimatorCanvas also wires it
  // into the global visibility manager (CanvasSurface), so the export path's
  // applyEffectOverrides finds the same config.
  const effectsConfigState = createEffectsConfigState();
  effectsConfigState.setActiveEffect("trails");
  {
    const vm = getAnimationVisibilityManager();
    vm.effectsConfigState = effectsConfigState;
    vm.setActiveEffect("trails");
    vm.setVisibility("wordHeader", false);
    vm.setVisibility("progressBar", false);
    vm.setVisibility("tkaGlyph", false);
    vm.setVisibility("stepNumbers", false);
    vm.setVisibility("leftPathLines", false);
    vm.setVisibility("rightPathLines", false);
  }
  let playbackController: AnimationPlaybackController | null = null;
  let loadedSequence: SequenceData | null = null;

  // Live canvas reactive inputs derived from playback state.
  let currentLetter = $derived.by(() => {
    const seq = animationState.sequenceData;
    if (!seq?.steps?.length) return null;
    const idx = Math.min(
      Math.max(0, Math.floor(animationState.currentStep) - 1),
      seq.steps.length - 1,
    );
    return seq.steps[idx]?.letter ?? null;
  });
  let currentStepData = $derived.by(() => {
    const seq = animationState.sequenceData;
    if (!seq?.steps?.length) return null;
    if (animationState.currentStep < 1 && seq.startPlacement) return seq.startPlacement;
    const idx = Math.min(
      Math.max(0, Math.floor(animationState.currentStep) - 1),
      seq.steps.length - 1,
    );
    return seq.steps[idx] ?? null;
  });
  let gridMode = $derived(animationState.sequenceData?.gridMode);

  onMount(() => {
    const stateManager = new AnimationStateManager();
    const loop = new AnimationLoop();
    const orchestrator = new SequenceAnimationOrchestrator(
      stateManager,
      getViewerAnimationPropConfig
    );
    playbackController = new AnimationPlaybackController(orchestrator, loop);
  });

  onDestroy(() => {
    playbackController?.dispose();
    animationState.dispose();
  });

  const hasMotion = (s: SequenceData | null | undefined): s is SequenceData =>
    !!s &&
    Array.isArray(s.steps) &&
    s.steps.length > 0 &&
    s.steps.some((st) => st?.motions?.left && st?.motions?.right);

  async function loadSequence(): Promise<boolean> {
    const wanted = word.trim();
    const repo = getSequenceRepository();
    const loader = new PublicSequencesLoader();

    // 1) Exact word: gallery repo, then public loader by word.
    let seq = await repo.getSequence(wanted).catch(() => null);
    if (!hasMotion(seq)) {
      seq = await loader.loadFullSequenceData(wanted).catch(() => null);
    }

    // 2) Fallback: scan public sequences and pick the one with the MOST steps —
    //    more steps = more prop travel = the big sweeping trails we need to test.
    if (!hasMotion(seq)) {
      const meta = await loader.loadSequenceMetadata();
      let best: SequenceData | null = null;
      let bestSteps = 0;
      for (const m of meta.slice(0, 30)) {
        const full = await loader.loadFullSequenceData(m.word).catch(() => null);
        if (hasMotion(full) && full.steps.length > bestSteps) {
          best = full;
          bestSteps = full.steps.length;
        }
      }
      if (best) {
        seq = best;
        word = best.word ?? best.name ?? word;
      }
    }

    if (!hasMotion(seq)) return false;
    loadedSequence = seq;
    const ok = playbackController!.initialize(seq, animationState);
    if (!ok) return false;
    // Let the live engine mount + warm up its trail accumulator.
    await raf();
    await raf();
    await raf();
    return true;
  }

  function raf(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  // Live-reference pass support.

  // Re-implements the orchestrator's frame→beat math (timeToBeat) so the live
  // pass lands on the SAME playback position the offscreen export used for each
  // frame index. Variable step durations map proportionally onto frames.
  function timeToBeatLive(
    timeProgress: number,
    cumulativeDurations: number[],
    stepDurations: number[],
  ): number {
    const stepCount = stepDurations.length;
    if (stepCount === 0) return 0;
    for (let i = stepCount - 1; i >= 0; i--) {
      if (timeProgress >= cumulativeDurations[i]!) {
        const elapsed = timeProgress - cumulativeDurations[i]!;
        const stepDur = stepDurations[i]!;
        const fraction = stepDur > 0 ? Math.min(1, elapsed / stepDur) : 0;
        return i + fraction;
      }
    }
    return 0;
  }

  // Find the LIVE render context for the offscreen AnimatorCanvas.
  function findLiveContext() {
    const reg = getRenderContextRegistry();
    return reg.getAll().find((c) => c.canvas === canvas) ?? null;
  }

  // Composite the live main canvas + its overlay siblings onto a square
  // `size`×`size` canvas flattened over opaque black — mirroring how the
  // offscreen pre-encode frame is flattened.
  function compositeLiveToCanvas(size: number): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const container = canvas?.parentElement;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      ctx.drawImage(canvas, 0, 0, size, size);
    }
    if (container) {
      for (const layer of container.querySelectorAll("canvas")) {
        if (layer === canvas) continue;
        if (layer.width > 0 && layer.height > 0) ctx.drawImage(layer, 0, 0, size, size);
      }
    }
    return out;
  }

  // Drive the LIVE engine through the full timeline frame-by-frame,
  // accumulating trails the real way, and snapshot a live-rendered reference at
  // each sampled frame index. Resizes the live ctx up to `size` (caller restores).
  async function renderLiveReference(
    size: number,
    sampledIndices: Set<number>,
    onFrame: (current: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<Record<number, HTMLCanvasElement>> {
    const liveRef: Record<number, HTMLCanvasElement> = {};
    if (!loadedSequence || !playbackController) return liveRef;

    const steps = animationState.sequenceData?.steps ?? [];
    const stepDurations = steps.map((s) => s.duration ?? 1);
    const totalDurationUnits =
      stepDurations.reduce((sum, d) => sum + d, 0) || animationState.totalSteps;
    const startPlacementDuration = 1; // includeAnimationStartPlacement: true
    const endPlacementHoldDuration = 1; // includeEndHold: true
    const loopCount = 1;
    const motionLoopUnits = totalDurationUnits * loopCount;
    const totalDurationWithHolds =
      startPlacementDuration + motionLoopUnits + endPlacementHoldDuration;
    const secondsPerBeatUnit = 1.0 / animationState.speed;
    const totalTimelineSeconds = totalDurationWithHolds * secondsPerBeatUnit;
    const totalFrames = Math.ceil(totalTimelineSeconds * fps);

    const cumulativeDurations: number[] = [];
    let cumulative = 0;
    for (const d of stepDurations) {
      cumulativeDurations.push(cumulative);
      cumulative += d;
    }

    const motionStart = startPlacementDuration;
    const motionEnd = motionStart + motionLoopUnits;

    // Reset the live trail accumulator + overlay buffers so the live pass starts
    // from a clean ribbon (the warm-up + export left stale trails behind).
    const liveCtx = findLiveContext();
    liveCtx?.trailCapturer.clearTrails();
    liveCtx?.effectManager.trailOverlay?.clearBuffers();
    playbackController.jumpToStep(0);
    await raf();

    // Drive the live engine DETERMINISTICALLY, mirroring the offscreen export:
    // stop its free-running rAF loop and render each frame synchronously at a
    // fixed 1/fps virtual clock via renderFrameSync (engine.renderFrame).
    liveCtx?.renderLoop.stop();
    const stepSeconds = 1 / fps;
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) break;
      const timeProgress = (i / totalFrames) * totalDurationWithHolds;
      const virtualTimeMs = (i / fps) * 1000;

      let playbackPosition: number;
      if (startPlacementDuration > 0 && timeProgress < motionStart) {
        playbackPosition = timeProgress / startPlacementDuration;
      } else if (endPlacementHoldDuration > 0 && timeProgress >= motionEnd) {
        playbackPosition = steps.length + 1;
      } else {
        const motionTime = timeProgress - motionStart;
        const wrappedMotionTime = totalDurationUnits > 0 ? motionTime % totalDurationUnits : 0;
        const rawStep = timeToBeatLive(wrappedMotionTime, cumulativeDurations, stepDurations);
        playbackPosition = rawStep + 1;
      }

      playbackController.calculateStateForStep(playbackPosition);
      const props = assembleExportEngineProps(animationState, {
        virtualTime: virtualTimeMs,
        isSeamlesslyLoopable: playbackController.isSeamlesslyLoopable,
        backgroundAlpha: 1,
        showNonRadialPoints: true,
        trailSettings: animationSettings.trail,
        leftPropType: null,
        rightPropType: null,
        previewDarkMode: null,
      });
      liveCtx?.renderFrameSync(props, virtualTimeMs, stepSeconds);

      onFrame(i + 1, totalFrames);
      if (sampledIndices.has(i)) {
        liveRef[i] = compositeLiveToCanvas(size);
      }
    }

    return liveRef;
  }

  function makeRun(): ParityRun {
    const cfg = { resolution, fps, codec };
    return {
      async run(ctx) {
        ctx.onProgress({ phase: "loading sequence", detail: word.trim() });
        if (!(await loadSequence())) {
          return {
            verdict: "FAIL",
            summary: "no sequence with motion data",
            gates: [],
            result: { error: "load failed" },
          };
        }

        // Warm the accumulator (indeterminate) — reproduces the warm-state the
        // export-start reset must wipe.
        animationState.setShouldLoop(true);
        playbackController!.togglePlayback();
        ctx.onProgress({ phase: "warming trail accumulator", detail: "play + loop 3s" });
        await new Promise((r) => setTimeout(r, 3000));
        if (animationState.isPlaying) playbackController!.togglePlayback();
        await raf();

        // Silence the orchestrator's DEV PNG dump during parity runs.
        (window as unknown as Record<string, unknown>).__tka_export_frame_dump = -1;
        const stride = Math.max(1, Math.round(cfg.fps / 3));
        const capture = {
          stride,
          max: 16,
          captured: {} as Record<number, { w: number; h: number; data: Uint8ClampedArray }>,
        };
        (window as unknown as Record<string, unknown>).__tka_parity_capture = capture;

        try {
          const orchestrator = getVideoExportOrchestrator();
          const blob = await orchestrator.executeExport(
            canvas!,
            playbackController!,
            animationState,
            (p) => {
              if (p.stage === "capturing" && p.totalFrames)
                ctx.onProgress({ phase: "exporting", current: p.currentFrame, total: p.totalFrames });
              else ctx.onProgress({ phase: "exporting", detail: p.stage });
            },
            {
              format: "mp4",
              codec: cfg.codec,
              resolution: cfg.resolution,
              fps: cfg.fps,
              loopCount: 1,
              effectOverrides: { trails: true },
              includeAnimationStartPlacement: true,
              includeEndHold: true,
            },
          );

          const captured = capture.captured;
          const indices = Object.keys(captured)
            .map(Number)
            .sort((a, b) => a - b);
          if (indices.length === 0) {
            return {
              verdict: "FAIL",
              summary: "export produced 0 sampled frames",
              gates: [],
              result: { error: "no frames captured" },
            };
          }

          ctx.onProgress({ phase: "decoding MP4", detail: `${(blob.size / 1e6).toFixed(1)} MB` });
          const buf = await blob.arrayBuffer();
          const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(buf) });
          const track = await input.getPrimaryVideoTrack();
          if (!track) {
            input.dispose();
            return {
              verdict: "FAIL",
              summary: "no video track in MP4",
              gates: [],
              result: { error: "decode failed" },
            };
          }
          const sink = new VideoSampleSink(track);

          let worstDiffPct = 0,
            worstMaxDelta = 0,
            worstPercDiffPct = 0,
            worstPercMaxDelta = 0;
          const frameMeta: Record<
            number,
            {
              ref: HTMLCanvasElement;
              dec: HTMLCanvasElement;
              heat: HTMLCanvasElement;
              percDiffPct: number;
              percMaxDelta: number;
              diffPct: number;
              maxDelta: number;
            }
          > = {};

          let decoded = 0;
          for (const idx of indices) {
            if (ctx.signal.aborted) break;
            const cap = captured[idx]!;
            const timeSec = idx / cfg.fps;
            ctx.onProgress({ phase: "decoding + diffing", current: ++decoded, total: indices.length });
            const sample = await sink.getSample(timeSec);
            if (!sample) continue;
            const ref = flattenToCanvas(cap.data, cap.w, cap.h);
            const dec = document.createElement("canvas");
            dec.width = cap.w;
            dec.height = cap.h;
            const dctx = dec.getContext("2d")!;
            dctx.fillStyle = "#000";
            dctx.fillRect(0, 0, cap.w, cap.h);
            dctx.drawImage(sample.toCanvasImageSource(), 0, 0, cap.w, cap.h);
            sample.close();
            const d = diff(ref, dec, cap.w, cap.h);
            const body = bodyDiff(ref, dec, cap.w, cap.h);
            worstDiffPct = Math.max(worstDiffPct, d.diffPct);
            worstMaxDelta = Math.max(worstMaxDelta, d.maxDelta);
            worstPercDiffPct = Math.max(worstPercDiffPct, body.bodyDiffPct);
            worstPercMaxDelta = Math.max(worstPercMaxDelta, body.bodyMaxDelta);
            frameMeta[idx] = {
              ref,
              dec,
              heat: d.heat,
              percDiffPct: body.bodyDiffPct,
              percMaxDelta: body.bodyMaxDelta,
              diffPct: d.diffPct,
              maxDelta: d.maxDelta,
            };
          }
          input.dispose();

          // LIVE-REFERENCE PASS — the real effect-fidelity gate.
          const firstCap = captured[indices[0]!]!;
          const liveSize = firstCap.w;
          const liveCtx = findLiveContext();
          const didResize = !!liveCtx;
          let liveRef: Record<number, HTMLCanvasElement> = {};
          let worstLiveDiffPct = 0,
            worstLiveMaxDelta = 0;
          try {
            liveCtx?.resize(liveSize);
            await raf();
            liveRef = await renderLiveReference(
              liveSize,
              new Set(indices),
              (c, t) => ctx.onProgress({ phase: "live-reference pass", current: c, total: t }),
              ctx.signal,
            );
          } finally {
            if (didResize) {
              liveCtx!.restoreSize();
              await raf();
            }
          }

          for (const idx of indices) {
            const meta = frameMeta[idx];
            if (!meta) continue;
            const live = liveRef[idx] ?? null;
            let liveDiffPct = 0,
              liveMaxDelta = 0;
            if (live) {
              const cap = captured[idx]!;
              const offscreenRef = flattenToCanvas(cap.data, cap.w, cap.h);
              const lb = bodyDiff(offscreenRef, live, cap.w, cap.h);
              liveDiffPct = lb.bodyDiffPct;
              liveMaxDelta = lb.bodyMaxDelta;
              worstLiveDiffPct = Math.max(worstLiveDiffPct, liveDiffPct);
              worstLiveMaxDelta = Math.max(worstLiveMaxDelta, liveMaxDelta);
            }
            const cells = [
              { label: "offscreen pre-encode", canvas: meta.ref },
              ...(live ? [{ label: "live render", canvas: live }] : []),
              { label: "decoded MP4", canvas: meta.dec },
              { label: `encoder diff (red Δ>${AA_TOLERANCE})`, canvas: meta.heat },
            ];
            const row: ParityRow = {
              id: idx,
              title: `frame ${idx} · t=${(idx / cfg.fps).toFixed(3)}s`,
              metrics: {
                "live %": liveDiffPct,
                "liveΔ": liveMaxDelta,
                "enc %": meta.percDiffPct,
                "encΔ": meta.percMaxDelta,
              },
              bad: liveDiffPct > PASS_LIVE_DIFF_PCT || meta.percDiffPct > PASS_DIFF_PCT,
              cells,
            };
            ctx.addRow(row);
          }

          const encoderPass =
            worstPercDiffPct <= PASS_DIFF_PCT && worstPercMaxDelta <= PASS_MAX_DELTA;
          const livePass =
            worstLiveDiffPct <= PASS_LIVE_DIFF_PCT && worstLiveMaxDelta <= PASS_LIVE_MAX_DELTA;
          const verdict: ParityVerdict["verdict"] = encoderPass && livePass ? "PASS" : "FAIL";
          return {
            verdict,
            summary: `live ${worstLiveDiffPct.toFixed(3)}% Δ${worstLiveMaxDelta} · encoder ${worstPercDiffPct.toFixed(3)}% Δ${worstPercMaxDelta} · full-res ${worstDiffPct.toFixed(3)}% Δ${worstMaxDelta}`,
            gates: [
              {
                label: "live (offscreen vs live)",
                pass: livePass,
                detail: `${worstLiveDiffPct.toFixed(3)}% Δ${worstLiveMaxDelta} (≤${PASS_LIVE_DIFF_PCT}% Δ${PASS_LIVE_MAX_DELTA})`,
              },
              {
                label: "encoder (pre-encode vs decoded)",
                pass: encoderPass,
                detail: `${worstPercDiffPct.toFixed(3)}% Δ${worstPercMaxDelta} (≤${PASS_DIFF_PCT}% Δ${PASS_MAX_DELTA})`,
              },
            ],
            result: {
              word: word.trim(),
              resolution: cfg.resolution,
              fps: cfg.fps,
              codec: cfg.codec,
              verdict,
              encoderPass,
              livePass,
              live: { worstDiffPct: worstLiveDiffPct, worstMaxDelta: worstLiveMaxDelta },
              perceptual: { worstDiffPct: worstPercDiffPct, worstMaxDelta: worstPercMaxDelta },
              fullRes: { worstDiffPct, worstMaxDelta },
            },
          };
        } finally {
          (window as unknown as Record<string, unknown>).__tka_parity_capture = undefined;
        }
      },
    };
  }
</script>

<svelte:head><title>Trail Export Parity</title></svelte:head>

<ParityHarness
  title="Trail Export Parity"
  description={`Live render → real MP4 export → decode. Two gates: ENCODER (pre-encode vs decoded, edges masked, ≤${PASS_DIFF_PCT}% Δ${PASS_MAX_DELTA}) and LIVE (offscreen vs live engine at output res, edges masked, ≤${PASS_LIVE_DIFF_PCT}% Δ${PASS_LIVE_MAX_DELTA}). PASS requires both.`}
  resultKey="trailParityResult"
  run={makeRun}
>
  {#snippet controls()}
    <label>Word <input bind:value={word} /></label>
    <label>
      Res
      <select bind:value={resolution}>
        <option value={720}>720</option>
        <option value={1080}>1080</option>
        <option value={2160}>2160 (4K)</option>
      </select>
    </label>
    <label>FPS <input type="number" bind:value={fps} min="10" max="60" /></label>
    <label>
      Codec
      <select bind:value={codec}>
        <option value="h264">H.264 (4:2:0)</option>
        <option value="av1">AV1 (4:4:4)</option>
      </select>
    </label>
  {/snippet}
</ParityHarness>

<!-- Real registered live engine, kept OFFSCREEN: the live gate diffs against this
     actual instance, but the viewer shouldn't watch it warm up + jump. -->
<div class="offscreen">
  <AnimatorCanvas
    leftProp={animationState.leftPropState}
    rightProp={animationState.rightPropState}
    gridVisible={true}
    {gridMode}
    letter={currentLetter}
    stepData={currentStepData}
    sequenceData={animationState.sequenceData}
    isPlaying={animationState.isPlaying}
    trailSettings={animationSettings.trail}
    {effectsConfigState}
    virtualTime={animationState.virtualTime}
    hideTkaGlyph={true}
    hideStepNumbers={true}
    hideProgressBar={true}
    onCanvasReady={(c) => {
      canvas = c;
    }}
  />
</div>

<style>
  .offscreen {
    position: fixed;
    left: -99999px;
    top: -99999px;
    width: 320px;
    height: 320px;
  }
  :global(.controls label) {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #eee;
  }
  :global(.controls input),
  :global(.controls select) {
    background: #1c1c2e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 14px;
  }
  :global(.controls input[type="number"]) {
    width: 64px;
  }
</style>
