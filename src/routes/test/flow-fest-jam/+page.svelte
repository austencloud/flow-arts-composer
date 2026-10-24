<script lang="ts">
  /**
   * Dusk at Middle Earth: the Thursday fire jam, browser half.
   *
   * `?watch=1` plays the opening and then circles the jam at full night with
   * no player. `?outside=N` moves the cap on outside spinners shown, for
   * measuring. `?perf` shows frame times and what the renderer drew.
   *
   * Sound starts off. The only sound is the fire; the toggle turns it on.
   *
   * Nothing shows until everything has loaded: the set, every person, and the
   * shaders, followed by a few smooth frames. Until then the shared loading
   * screen stands in the opening's own dusk colours, then dissolves into the
   * shot's first frame, and the shot starts from there.
   */
  import { onDestroy, onMount } from "svelte";
  import ScenePreparationSurface from "#lib/shared/3d/scene-features/components/ScenePreparationSurface.svelte";
  import { createLoadingSession, type LoadingSession } from "#lib/shared/loading/loading-session.svelte.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { flyFade, reducedMotion } from "#lib/shared/transitions/motion.js";
  import { buildFlowFestJamLayout } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
  import { jamLightAt } from "./flow-fest-jam-light";
  import type { JamLoadProgress, JamLoadStage } from "./flow-fest-jam-readiness";
  import { Canvas } from "@threlte/core";
  import { EffectComposer } from "threlte-postprocessing";
  import { ToneMappingEffect } from "threlte-postprocessing/effects";
  import { ToneMappingMode } from "postprocessing";
  import { AgXToneMapping, PCFSoftShadowMap, WebGLRenderer } from "three";
  import BloomEffect from "#lib/shared/3d/effects/post-processing/BloomEffect.svelte";
  import SettingToggleButton from "#lib/shared/settings/components/SettingToggleButton.svelte";
  import FlowFestJamScene, { type JamSceneStatus } from "./FlowFestJamScene.svelte";
  import { JamAudio } from "./flow-fest-jam-audio";

  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const watch = params.get("watch") === "1";
  const outsideCap = Number(params.get("outside") ?? 12);
  const perf = params.has("perf");

  const audio = new JamAudio();
  let skipToken = $state(0);
  let status = $state<JamSceneStatus | null>(null);
  let error = $state<string | null>(null);
  let fps = $state(0);
  let soundOn = $state(false);
  /** Median and 95th-percentile frame time over the last second, ms. */
  let frameMedian = $state(0);
  let frameP95 = $state(0);

  // ---------------------------------------------------------------- loading

  const LOAD_LABELS: Record<JamLoadStage, string> = {
    stage: "Setting the stage",
    cast: "Dressing the cast",
    warm: "Warming up",
  };
  // The sky the opening shot starts under, so the screen dissolves into it.
  const firstLight = jamLightAt(buildFlowFestJamLayout().openingShot[0]!.sunElevationDegrees);
  const duskSky = { top: firstLight.skyTop, mid: firstLight.skyMid, horizon: firstLight.skyBottom };

  let session = $state<LoadingSession | null>(null);
  let loadStage = $state<JamLoadStage>("stage");
  type Reveal = "loading" | "finishing" | "leaving" | "gone";
  let reveal = $state<Reveal>("loading");
  /** The screen has gone: the opening shot starts. */
  let begin = $state(false);
  const revealTimers: ReturnType<typeof setTimeout>[] = [];

  // The reveal's beats, as the 3D viewer's curtain plays them.
  const revealMotion = reducedMotion()
    ? { hold: DURATION.normal + DURATION.instant, chrome: DURATION.fast, delay: 0, stage: DURATION.normal, scale: 1, lift: 0 }
    : { hold: DURATION.normal + DURATION.instant, chrome: DURATION.normal, delay: DURATION.fast, stage: DURATION.scene, scale: 1.08, lift: 8 };

  function onLoading(progress: JamLoadProgress): void {
    if (reveal !== "loading") return;
    loadStage = progress.stage;
    if (!session) return;
    if (progress.fraction >= 0.25) session.reach("load-25");
    if (progress.fraction >= 0.5) session.reach("load-50");
    if (progress.fraction >= 0.75) session.reach("load-75");
    if (progress.stage === "warm") session.reach("loaded");
  }

  function onPrepared(): void {
    if (reveal !== "loading") return;
    session?.reach("compiled");
    session?.complete();
    reveal = "finishing";
    revealTimers.push(setTimeout(() => (reveal = "leaving"), revealMotion.hold));
  }

  // The title rises a moment into the shot and fades before the hand-over.
  const titleOpacity = $derived.by(() => {
    if (!status || status.phase !== "opening") return 0;
    const t = status.openingSeconds;
    const end = status.openingLength;
    if (t < 1.5) return 0;
    if (t < 4) return (t - 1.5) / 2.5;
    if (t < end - 9) return 1;
    return Math.max(0, (end - 5 - t) / 4);
  });

  function interact(event: Event): void {
    // The sound toggle is a control of its own, not a "skip the shot" press.
    if (event.target instanceof Element && event.target.closest(".sound")) return;
    if (status?.phase === "opening") {
      if (event instanceof KeyboardEvent && ["ShiftLeft", "ShiftRight", "ControlLeft", "AltLeft", "MetaLeft"].includes(event.code)) return;
      skipToken += 1;
    }
  }

  onMount(() => {
    session = createLoadingSession({
      key: "flow-fest-jam",
      ranks: ["open", "load-25", "load-50", "load-75", "loaded", "compiled", "smooth"],
      // A first visit's timing on the dev server (measured 2026-10-22), replaced by each completed load.
      defaultProfile: { open: 0, "load-25": 6700, "load-50": 9600, "load-75": 14800, loaded: 21800, compiled: 22400, smooth: 22600 },
    });
    window.addEventListener("keydown", interact);
    window.addEventListener("pointerdown", interact);
    // A plain frame counter for the `?perf` readout, so its numbers are what the eye gets.
    let frames = 0;
    let last = performance.now();
    let previous = last;
    const times: number[] = [];
    let raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      times.push(now - previous);
      previous = now;
      if (now - last >= 1000) {
        fps = Math.round((frames * 1000) / (now - last));
        times.sort((a, b) => a - b);
        frameMedian = times[Math.floor(times.length * 0.5)] ?? 0;
        frameP95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] ?? 0;
        times.length = 0;
        frames = 0;
        last = now;
        (globalThis as Record<string, unknown>).__flowFestJamFps = fps;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", interact);
      window.removeEventListener("pointerdown", interact);
    };
  });

  onDestroy(() => {
    revealTimers.forEach(clearTimeout);
    if (session && !session.done) session.abandon();
    audio.dispose();
  });
</script>

<svelte:head>
  <title>Flow Fest · Dusk at Middle Earth</title>
</svelte:head>

<div class="jam">
  <!-- The composer draws every frame. Canvas would otherwise turn its own
       render back on after the composer switched it off, drawing the whole
       scene a second time straight to the screen. -->
  <Canvas
    autoRender={false}
    dpr={1}
    shadows={PCFSoftShadowMap}
    toneMapping={AgXToneMapping}
    createRenderer={(canvas) => new WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" })}
  >
    <EffectComposer multisampling={4}>
      <FlowFestJamScene
        {watch}
        {skipToken}
        {audio}
        {outsideCap}
        {begin}
        {onLoading}
        {onPrepared}
        onStatus={(next) => {
          status = next;
        }}
        onError={(message) => {
          error = message;
        }}
      />
      <BloomEffect intensity={1.15} luminanceThreshold={0.62} luminanceSmoothing={0.25} radius={0.62} levels={7} />
      <ToneMappingEffect mode={ToneMappingMode.AGX} />
    </EffectComposer>
  </Canvas>

  {#if reveal !== "gone"}
    <div
      class="curtain"
      style:--leave-chrome="{revealMotion.chrome}ms"
      style:--leave-delay="{revealMotion.delay}ms"
      style:--leave-stage="{revealMotion.stage}ms"
      style:--leave-scale={revealMotion.scale}
      style:--leave-lift="{revealMotion.lift}px"
    >
      <ScenePreparationSurface
        statusText={LOAD_LABELS[loadStage]}
        {session}
        labels={Object.values(LOAD_LABELS)}
        sky={duskSky}
        title="Dusk at Middle Earth"
        leaving={reveal === "leaving"}
        onLeft={() => {
          reveal = "gone";
          begin = true;
        }}
      />
    </div>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <p class="title" style:opacity={titleOpacity} aria-hidden={titleOpacity === 0}>
    Flow Fest <span>·</span> Thursday <span>·</span> Middle Earth
  </p>

  <p class="hint" class:shown={!!status?.hint} aria-live="polite">{status?.hint ?? ""}</p>

  {#if reveal === "leaving" || reveal === "gone"}
    <div class="sound" transition:flyFade>
      <SettingToggleButton
        label="Sound"
        checked={soundOn}
        surface="card"
        density="compact"
        onToggle={(event) => {
          soundOn = !soundOn;
          audio.setEnabled(soundOn);
          // Give the keys back to the walk: Space is flow, not this switch.
          (event.currentTarget as HTMLElement | null)?.blur();
        }}
      />
    </div>
  {/if}

  {#if perf}
    <dl class="perf" aria-hidden="true">
      <dt>fps</dt><dd>{fps}</dd>
      <dt>frame</dt><dd>{frameMedian.toFixed(1)} / {frameP95.toFixed(1)} ms</dd>
      <dt>calls</dt><dd>{status?.render.calls ?? 0}</dd>
      <dt>triangles</dt><dd>{((status?.render.triangles ?? 0) / 1e6).toFixed(1)} M</dd>
      <dt>programs</dt><dd>{status?.render.programs ?? 0}</dd>
      <dt>live rigs</dt><dd>{status?.people?.liveRigs ?? 0}</dd>
      <dt>outside cap</dt><dd>{status?.people?.outsideCapNow ?? 0}</dd>
      <dt>by the gate</dt><dd>{status?.people?.nearEntrance ?? 0}</dd>
    </dl>
  {/if}
</div>

<style>
  .jam {
    position: fixed;
    inset: 0;
    background: #05070c;
    overflow: hidden;
  }

  .curtain {
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
  }

  .error {
    position: absolute;
    top: 1rem;
    left: 50%;
    z-index: 31;
    transform: translateX(-50%);
    margin: 0;
    color: rgb(255 240 220 / 0.85);
    font-size: var(--font-size-sm, 0.875rem);
    letter-spacing: 0.04em;
  }

  .title {
    position: absolute;
    left: clamp(1.5rem, 4vw, 4rem);
    bottom: clamp(1.5rem, 6vh, 4.5rem);
    margin: 0;
    color: rgb(255 244 228 / 0.92);
    font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
    font-size: clamp(1.125rem, 1.6vw, 1.75rem);
    font-weight: 400;
    letter-spacing: 0.06em;
    text-shadow: 0 1px 12px rgb(0 0 0 / 0.55);
    pointer-events: none;
  }

  .title span {
    opacity: 0.55;
    padding: 0 0.2em;
  }

  .hint {
    position: absolute;
    left: 50%;
    bottom: 2rem;
    transform: translateX(-50%);
    margin: 0;
    min-width: 7rem;
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: rgb(10 12 18 / 0.38);
    color: rgb(255 240 220 / 0.72);
    font-size: var(--font-size-sm, 0.875rem);
    letter-spacing: 0.08em;
    text-align: center;
    white-space: pre;
    opacity: 0;
    transition: opacity var(--transition-slow);
    pointer-events: none;
  }

  .hint.shown {
    opacity: 1;
  }

  .sound {
    position: absolute;
    left: 0.75rem;
    top: 0.75rem;
  }

  .perf {
    position: absolute;
    right: 0.75rem;
    top: 0.5rem;
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.1rem 0.75rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: rgb(5 7 12 / 0.6);
    color: rgb(255 255 255 / 0.8);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .perf dt {
    opacity: 0.6;
  }

  .perf dd {
    margin: 0;
    text-align: right;
  }

  @media (prefers-reduced-motion: reduce) {
    .hint {
      transition: none;
    }
  }
</style>
