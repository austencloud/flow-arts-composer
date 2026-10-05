<!--
  Composer3DViewerDemo

  The real 3D sequence viewer, live and interactive, embedded standalone on the
  prerendered marketing page. Drag to orbit; it autoplays the sequence carried
  through the page and lets you swap the environment it performs in.

  Standalone recipe (no app shell): provide the mandatory viewer-3d context
  ourselves, plus non-persisting effects + scene-render contexts, then
  enter3D(sequence) — which spins up one performer and loads the sequence onto
  it. Viewer3DCanvas owns its own Threlte Canvas, orbit camera, and scene-
  feature context. This whole stack is heavy WebGL, so the page mounts it
  through LazyMount only after the visitor chooses Enter 3D. Closing the
  dialog unmounts the scene and releases its animation loop.

  Controls are the app's own: SceneControlWorkspace, the same right-hand rail
  every 3D stage in the product carries (sequence viewer, fullscreen, Director).
  It overlays the stage and opens the real Performers, Formation, Camera, and
  Scene tools, so the visitor reaches every environment, count, formation, and
  prop the app has rather than a hand-picked subset of four scenes and three
  counts. Save scene is off: this demo has no collection to save into.

  The viewer is constructed from a complete, non-persisting demonstration seed.
  Scene choices address its own environment state, so this surface never reads
  or writes the visitor's 2D background or saved 3D setup.

  With `entrance`, the page has carried its poster of the scene into a frame
  around this stage. Once the loading curtain has lifted, the camera starts
  from the poster's wide establishing pose and glides in to the opening shot,
  so the still picture becomes the place you arrive in.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Viewer3DCanvas from "$lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
  import { setViewer3DContext } from "$lib/shared/3d/context/viewer-3d-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createScene3DRenderState } from "$lib/shared/3d/scene-features/state/scene-3d-render-state.svelte";
  import { setScene3DRenderContext } from "$lib/shared/3d/scene-features/state/scene-3d-render-context";
  import {
    createSequenceData,
    type SequenceData,
  } from "$lib/shared/foundation/domain/models/sequence-data";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import SceneControlWorkspace from "$lib/shared/3d/components/controls/SceneControlWorkspace.svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    COMPOSER_3D_DEMO_SEED,
    COMPOSER_3D_ENTRANCE_CAMERA,
    normalizeComposer3DDemoState,
  } from "./composer-3d-demo-state";

  let {
    sequence: sourceSequence,
    fillHeight = false,
    entrance = false,
    railTopOffset,
    onReveal,
  }: {
    /** The per-visit demo sequence, provided by the page (no baked canon). */
    sequence: SequenceData;
    fillHeight?: boolean;
    /** Glide in from the poster's wide pose once the stage is visible. */
    entrance?: boolean;
    /** Lowers the rail to clear host controls in the stage's top-right corner. */
    railTopOffset?: string;
    /** The stage is on screen: the loading curtain has finished lifting. */
    onReveal?: () => void;
  } = $props();

  // ── contexts (must be set during component init, not onMount) ────────────
  const viewer = createViewer3DState(COMPOSER_3D_DEMO_SEED);
  setViewer3DContext(viewer);
  const effects = setEffectsConfigContext(
    createEffectsConfigState(undefined, { persist: false })
  );
  setScene3DRenderContext(createScene3DRenderState());

  // Derived, not snapshotted: the page swaps this prop in place when the
  // visitor composes or generates a new sequence. Remounting the component
  // instead would tear down the Threlte scene, and a dispose landing while
  // renderer.compileAsync is still polling KHR_parallel_shader_compile throws
  // inside three's own timer, where nothing downstream can catch it.
  const sequence = $derived(
    createSequenceData({
      id: "composer-3d-demo",
      name: sourceSequence.word,
      word: sourceSequence.word,
      steps: sourceSequence.steps,
      gridMode: sourceSequence.gridMode,
    })
  );

  // Scene, performer count, formation, and props are all owned by the rail's
  // own tools, which write straight onto the viewer state. The label reads that
  // state rather than shadowing it in local copies that could drift from what
  // is on stage. Leaving the prop overrides unset (see the canvas below) is what
  // lets the rail's prop picker reach the performers at all.
  const performerCount = $derived(viewer.performerManager.performers.length);
  const stageLabel = $derived(
    `Live 3D performance of ${simplifyRepeatedWord(sequence.word)} with ${performerCount === 1 ? "one performer" : `${performerCount} performers`}`
  );

  // The scene's puppet loop positions every performer to `currentStep` (a
  // continuous float: integer = beat, fraction = sub-beat) each frame and wraps
  // past the sequence length — so autoplay means advancing this float. 60 BPM =
  // one beat per second.
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let currentStep = $state(0);
  let isPlaying = $state(!reduceMotion.current);
  const BPM = 60;
  let raf = 0;

  $effect(() => {
    if (reduceMotion.current) isPlaying = false;
  });

  let ready = $state(false);

  // Arm the initial fire effect once the scene reports ready,
  // after shader warmup: switching effect materials while compileAsync is
  // still polling a program it just built throws inside three's timer.
  let effectArmed = false;
  function armDefaultEffect(sceneReady: boolean): void {
    if (!sceneReady || effectArmed) return;
    effectArmed = true;
    effects.setActiveEffect("fire");
  }

  // Two scene beats: the arrival is the page's scene motion carried on into
  // the 3D space, slow enough to read as travel rather than a cut.
  const ENTRANCE_GLIDE_MS = DURATION.scene * 2;

  // The loading curtain lifts over one emphasis beat after the scene reports
  // ready. Revealing after it means a host overlay never fades onto the curtain.
  let revealTimer = 0;
  function handleSceneReady(sceneReady: boolean): void {
    armDefaultEffect(sceneReady);
    if (!sceneReady || revealTimer) return;
    revealTimer = window.setTimeout(
      reveal,
      motionDuration(DURATION.emphasis)
    );
  }

  function reveal(): void {
    if (entrance) glideIn();
    onReveal?.();
  }

  // The welcome framing already holds the opening shot. Without motion the
  // camera simply stays there.
  function glideIn(): void {
    const shot = viewer.openingShot();
    const durationMs = motionDuration(ENTRANCE_GLIDE_MS);
    if (!shot || durationMs === 0) return;
    const wide = COMPOSER_3D_ENTRANCE_CAMERA;
    viewer.snapCameraTo(wide.position, wide.target, undefined, false);
    viewer.snapCameraTo(shot.position, shot.target, undefined, true, {
      id: 0,
      startTimeMs: performance.now(),
      durationMs,
    });
  }

  // Reload the new choreography onto the performers already on stage. The
  // scene, camera, environment, and every compiled shader survive.
  let loadedWord: string | null = null;
  $effect(() => {
    const next = sequence;
    if (!ready || loadedWord === null || loadedWord === next.word) return;
    loadedWord = next.word;
    viewer.loadSequenceScoped(next);
    currentStep = 0;
  });

  onMount(() => {
    viewer.enter3D(sequence);
    loadedWord = sequence.word;
    normalizeComposer3DDemoState(viewer);
    ready = true;

    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      if (isPlaying) currentStep += dt * (BPM / 60);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    clearTimeout(revealTimer);
    viewer.dispose();
  });
</script>

<div class="viewer-demo" class:fill-height={fillHeight}>
  <div class="stage">
    <div class="art" role="img" aria-label={stageLabel}>
      {#if ready}
        <!-- No blue/red prop override: an override wins over each performer's
             own prop, which would leave the rail's prop picker with no effect. -->
        <Viewer3DCanvas
          sequenceData={sequence}
          {currentStep}
          {isPlaying}
          bpm={BPM}
          hideOverlays
          onSceneReadyChange={handleSceneReady}
        />
      {:else}
        <div class="stage-curtain" aria-hidden="true"></div>
      {/if}
    </div>

    <!-- The canonical rail, overlaying the stage exactly as it does in the
         sequence viewer. bottomOffset clears the pause button in the same
         corner; the app's default is sized for a transport bar this demo has
         no room for. A lowered rail leaves the performer bar at the top. -->
    {#if ready}
      <SceneControlWorkspace
        allowSaveScene={false}
        bpm={BPM}
        topOffset={railTopOffset}
        topLeftOffset={railTopOffset ? "12px" : undefined}
        bottomOffset="4.75rem"
      />
    {/if}

    <button
      type="button"
      class="pause-toggle"
      aria-label={isPlaying ? "Pause 3D preview" : "Play 3D preview"}
      onclick={() => (isPlaying = !isPlaying)}
    >
      <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
      ></i>
    </button>
  </div>
</div>

<style>
  .viewer-demo {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 16px;
    overflow: hidden;
    background: oklch(0.12 0.02 270);
    border: 1px solid oklch(0.4 0.04 270 / 0.16);
  }
  .viewer-demo.fill-height {
    height: 100%;
  }
  .fill-height .stage {
    height: 100%;
    aspect-ratio: auto;
    border-radius: 0;
  }
  .art {
    position: absolute;
    inset: 0;
  }
  .stage-curtain {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 42%,
      oklch(0.22 0.04 270) 0%,
      oklch(0.11 0.02 270) 70%
    );
    animation: curtain-pulse 1.6s ease-in-out infinite;
  }

  /* Above the rail's own overlay layer (z-index 20) so it is never covered,
     and below its inspector (29) so an open tool panel wins. */
  .pause-toggle {
    position: absolute;
    z-index: 21;
    right: 0.75rem;
    bottom: 0.75rem;
    width: max(var(--min-touch-target, 48px), 48px);
    height: max(var(--min-touch-target, 48px), 48px);
    display: grid;
    place-items: center;
    border: 1px solid oklch(0.86 0.02 270 / 0.24);
    border-radius: 50%;
    background: oklch(0.08 0.02 270 / 0.72);
    color: oklch(0.95 0.02 270);
    cursor: pointer;
  }
  .pause-toggle:hover {
    background: oklch(0.12 0.03 270 / 0.9);
  }
  .pause-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  @keyframes curtain-pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-curtain {
      animation: none;
    }
    .pause-toggle {
      transition: none;
    }
  }
</style>
