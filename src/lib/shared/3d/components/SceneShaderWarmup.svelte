<script lang="ts">
  import { tick } from "svelte";
  import { useThrelte } from "@threlte/core";

  import { getSceneFeatureContext } from "../scene-features/context/scene-feature-context";
  import {
    beginBootSpan,
    endBootSpan,
    recordFrameGateVerdict,
    recordReveal,
    resetBootSpans,
  } from "../scene-boot/boot-spans";
  import { DEFAULT_FRAME_GATE, createFrameGate } from "../scene-boot/frame-gate";
  import { warmupRenderer } from "../scene-boot/renderer-warmup";
  import { resolveThrelteHandles } from "../scene-boot/threlte-handles";

  interface Props {
    onReadyChange?: (ready: boolean) => void;
    waitForAllFeatures?: boolean;
    /** Reuse a completed warm-up while its keyed scene remains mounted. */
    cacheKey?: string | null;
    /** Hosts with async cast assets can hold warm-up until those settle. */
    additionalReady?: boolean;
  }

  let {
    onReadyChange,
    waitForAllFeatures = false,
    cacheKey = null,
    additionalReady = true,
  }: Props = $props();

  const sceneFeatures = getSceneFeatureContext();
  const threlte = useThrelte();
  const compiledKeys = new Set<string>();

  // Compile fills the first four fifths of the warm-up bar; the smoothness gate
  // rides the rest, so the curtain keeps moving until the scene really is ready.
  const COMPILE_PROGRESS_SHARE = 0.8;

  const afterPaint = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  let assetSpanOpen = false;

  $effect(() => {
    // A streaming host lets deferred GLBs mount over the first usable frame.
    // Gated viewers wait for the initial-reveal set plus any host-owned cast
    // readiness before the hidden warm-up runs.
    const featuresReady = waitForAllFeatures
      ? sceneFeatures.allEnabledReady
      : sceneFeatures.allInitialRevealFeaturesReady;
    const requestedCacheKey = cacheKey;
    onReadyChange?.(false);
    if (!featuresReady || !additionalReady) {
      if (!assetSpanOpen) {
        resetBootSpans();
        beginBootSpan("assets");
        assetSpanOpen = true;
      }
      return;
    }
    if (assetSpanOpen) {
      endBootSpan("assets");
      assetSpanOpen = false;
    }
    if (requestedCacheKey && compiledKeys.has(requestedCacheKey)) {
      onReadyChange?.(true);
      return;
    }

    let cancelled = false;
    const abort = new AbortController();

    async function compileShaders(): Promise<void> {
      const handles = resolveThrelteHandles(threlte);
      if (!handles) return;
      if (import.meta.env.DEV) {
        (window as unknown as { __sceneHandles?: unknown }).__sceneHandles =
          handles;
      }
      beginBootSpan("compile");
      await warmupRenderer(handles, {
        signal: abort.signal,
        onProgress: (fraction) =>
          sceneFeatures.reportWarmupProgress(fraction * COMPILE_PROGRESS_SHARE),
      });
      endBootSpan("compile");
    }

    async function settleFrames(): Promise<void> {
      // Readiness can be reported in the same update that mounts the final GLB.
      // Let Svelte attach it, then allow real frames to render behind the opaque
      // curtain — this warms the upload paths compilation alone does not reach.
      await tick();
      if (cancelled) return;
      await afterPaint();
      if (cancelled) return;
      await afterPaint();
      if (cancelled) return;

      // Then hold the curtain until frames actually arrive on time. Revealing on
      // "assets loaded" is what let the first seconds of a scene stutter in
      // full view; this reveals on "running smoothly" instead.
      const gate = createFrameGate();
      const startedAt = performance.now();
      let previous = startedAt;

      // The gate only tests its cap when a frame arrives, and
      // requestAnimationFrame does not fire while the document is hidden. A
      // scene booted in a background tab was therefore waiting on a cap that
      // could never come. Wall-clock time is the floor under the frame loop.
      let capExpired = false;
      let capTimer: ReturnType<typeof setTimeout> | undefined;
      const capReached = new Promise<void>((resolve) => {
        capTimer = setTimeout(() => {
          capExpired = true;
          resolve();
        }, DEFAULT_FRAME_GATE.capMs);
      });

      try {
        while (!cancelled) {
          await Promise.race([afterPaint(), capReached]);
          if (cancelled) return;
          const now = performance.now();
          // When the timer wins the race the gate must reach its cap even if a
          // coarse clock says otherwise, so the verdict stays honest.
          const elapsed = capExpired
            ? Math.max(now - startedAt, DEFAULT_FRAME_GATE.capMs)
            : now - startedAt;
          const warm = gate.observe(now - previous, elapsed);
          previous = now;
          sceneFeatures.reportWarmupProgress(
            COMPILE_PROGRESS_SHARE +
              gate.streakFraction * (1 - COMPILE_PROGRESS_SHARE)
          );
          if (warm) break;
        }
      } finally {
        clearTimeout(capTimer);
      }
      if (gate.verdict) recordFrameGateVerdict(gate.verdict);
    }

    async function warmScene(): Promise<void> {
      await compileShaders();
      if (cancelled) return;

      beginBootSpan("settle");
      await settleFrames();
      if (cancelled) return;
      endBootSpan("settle");

      sceneFeatures.reportWarmupProgress(1);
      recordReveal();
      if (requestedCacheKey) compiledKeys.add(requestedCacheKey);
      onReadyChange?.(true);
    }

    void warmScene();

    return () => {
      cancelled = true;
      abort.abort();
    };
  });
</script>
