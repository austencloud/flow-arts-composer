<!--
  Scene3DPreview.svelte — a live, in-page reproduction of a saved 3D scene.

  The 3D counterpart to TunnelDetailPreview: mounts the real Viewer3DCanvas with
  a fully per-instance seam, so a gallery can show several saved scenes at once
  without any of them touching the user's app.

  How the isolation works — all three contexts are local, none are global:

  - viewer-3d: built with `createViewer3DState(seed)`. The seed carries this
    scene's camera, performers, props, effect toggles, environment and scene
    features, and a seeded state writes NOTHING back (see the seed docs in
    viewer-3d-state). This is why there is no captureSettingsCheckpoint here and
    no Undo toast: applying a look destroys settings and must be undoable;
    previewing one changes nothing, so there is nothing to undo.
  - effects config: `persist: false`, so it can't read or write the shared
    tka_effects_config key.
  - scene render + scene features: fresh per mount; features come from the seed.

  The camera orbits on its own (`autoOrbit`), because a tile is watched, not
  driven. That is OrbitControls' continuous autoRotate — deliberately not the
  `auto-orbit` camera preset, which is a choreography shot tied to sequence
  duration and would never move on a scene saved without a performance.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createScene3DRenderState } from "#lib/shared/3d/scene-features/state/scene-3d-render-state.svelte.js";
  import { setScene3DRenderContext } from "#lib/shared/3d/scene-features/state/scene-3d-render-context.js";
  import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { warmDecoderRuntimes } from "#lib/shared/3d/scene-boot/scene-prefetch.js";
  import { buildScene3DSeed } from "../services/scene-3d-seed";
  import type { Collected3DScene } from "../domain/scene-3d-collection-types";

  const { scene }: { scene: Collected3DScene } = $props();

  // Unwrap the $state proxy from the collection store ONCE. structuredClone
  // (inside createEffectsConfigState) throws DataCloneError on Svelte 5 state
  // proxies, and the seed shouldn't hand proxies to the viewer either. The
  // record is immutable while previewing, so one deep snapshot is safe.
  const data = $state.snapshot(scene) as Collected3DScene;

  // Reduced motion: no self-driving camera, and start paused. The toggle below
  // still lets the user opt in.
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const viewer = createViewer3DState(
    buildScene3DSeed(data, { autoOrbit: !reducedMotion })
  );
  setViewer3DContext(viewer);
  setEffectsConfigContext(createEffectsConfigState(undefined, { persist: false }));
  setScene3DRenderContext(createScene3DRenderState());

  const steps = data.steps ?? [];
  const sequence = createSequenceData({
    id: data.id,
    name: data.name,
    word: data.name,
    steps: [...steps],
    gridMode: steps.find((s) => s.gridMode)?.gridMode,
    ...(data.conjoined ? { conjoined: data.conjoined } : {}),
  });

  // Autoplaying motion needs a user-reachable pause (WCAG 2.2.2) — the real
  // viewer has a transport; this preview gets its own toggle, same as the
  // tunnel preview. It pauses the performance; the orbit keeps its own state.
  let playing = $state(!reducedMotion);
  let ready = $state(false);

  // The scene's puppet loop positions every performer to `currentStep` each
  // frame (a continuous float: integer = step, fraction = sub-step) and wraps
  // past the sequence length, so playback means advancing this float. The
  // snapshot's saved tempo drives it; 60 BPM = one step per second.
  const bpm = data.snapshot.bpm ?? 60;
  let currentStep = $state(0);
  let raf = 0;

  onMount(() => {
    // This tile's own models are requested by the canvas below; only the shared
    // compressed-texture and geometry decoders are worth warming ahead, since
    // nothing can be decoded until they arrive.
    warmDecoderRuntimes();
    viewer.enter3D(sequence);
    ready = true;

    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      if (playing) currentStep += dt * (bpm / 60);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    // Release the avatar instance and its GPU resources. A gallery mounts and
    // unmounts these constantly as tiles scroll, so leaking here is not subtle.
    viewer.dispose();
  });
</script>

<div class="preview-stage">
  <div class="art" role="img" aria-label="Live 3D preview of {data.name}">
    {#if ready}
      <Viewer3DCanvas
        sequenceData={sequence}
        {currentStep}
        isPlaying={playing}
        {bpm}
        leftPropType={data.snapshot.props.leftPropType ?? null}
        rightPropType={data.snapshot.props.rightPropType ?? null}
        hideOverlays
      />
    {/if}
  </div>
  <button
    type="button"
    class="pause-toggle"
    aria-pressed={!playing}
    aria-label={playing ? "Pause preview" : "Play preview"}
    onclick={() => (playing = !playing)}
  >
    <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
  </button>
</div>

<style>
  .preview-stage {
    /* Fills the tile rather than sizing to a square: a 3D scene is a framed
       stage, and the tile owns the frame. */
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    box-shadow:
      0 0 0 1px var(--theme-stroke, rgba(255, 255, 255, 0.08)),
      0 12px 60px color-mix(in srgb, var(--theme-accent, #22d3ee) 14%, transparent);
  }

  .art {
    position: absolute;
    inset: 0;
  }

  .pause-toggle {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
  }
  @media (hover: hover) {
    .pause-toggle:hover {
      background: rgba(0, 0, 0, 0.75);
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
      color: white;
    }
  }
  .pause-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pause-toggle {
      transition: none;
    }
  }
</style>
