<script lang="ts">
  /**
   * VisualsScene
   *
   * Mirrors: Explore > Visuals, the wall of shared tunnels and mandalas.
   * The two kinds sit side by side on their plinths. The tunnel is the real
   * TunnelArtView, set up the way Create's Tunnel preview (TunnelScene) sets
   * one up: its own effects, visibility and animation settings, Radial,
   * grid and trails off, a controller that saves nothing. The mandala is a
   * Shape Matrix tile drawn by the matrix's own painter
   * (createCellRevealFrame), for the user's props and hand colors.
   *
   * Each turn the tunnel plays, and the mandala beside it draws the next
   * flower pair from nothing, as the Matrix draws a chosen tile.
   *
   * Finished picture: the tunnel still, and the last mandala complete.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import {
    DARK_MODE_BACKGROUND,
    LIGHT_MODE_BACKGROUND,
  } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-application-manager.js";
  import { createAnimationSettingsState } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { runAtUserVisiblePriority } from "#lib/shared/foundation/utils/background-scheduling.js";
  import type { MandalaGuideRevealFrame } from "#lib/shared/mandala/services/mandala-guide-image.js";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { createViewerCustomColorState } from "#lib/shared/sequence-viewer/state/viewer-custom-colors-state.svelte.js";
  import TunnelArtView from "#lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import { TunnelViewController } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.js";
  import { DEFAULT_TUNNEL_VIEW_STATE } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-state.js";
  import { flowerKey } from "#lib/shared/shape-matrix/domain/flower-signature.js";
  import { propPairFromLegacy } from "#lib/shared/shape-matrix/domain/prop-pair.js";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";
  import { createCellRevealFrame } from "#lib/shared/shape-matrix/services/shape-matrix-render.js";
  import { DEMO_SEQUENCE } from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
  import {
    playTravel,
    type SceneRun,
  } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
  import { playSceneTurns } from "#lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.js";
  import type { MethodPreviewSceneProps } from "#lib/features/create/shared/components/method-previews/method-preview-scenes.js";
  import { TUNNEL_PREVIEW_PRESET } from "#lib/features/create/shared/components/method-previews/method-preview-tunnel.js";
  import { visualsPair } from "./browse-home-preview-layout";
  import { mandalaPairAt } from "./browse-preview-mandalas";

  /** How long a mandala takes to draw itself. */
  const DRAW_MS = 1800;

  let {
    playing,
    turn,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  // Per-instance state, as TunnelScene does: nothing here reads or writes
  // the viewer's saved settings.
  const effects = createEffectsConfigState(
    { ...DEFAULT_EFFECTS_CONFIG, tipEffectMap: {}, activeEffect: "none" },
    { persist: false }
  );
  setEffectsConfigContext(effects);

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  visibility.setGridMode("none");

  const settings = createAnimationSettingsState({ ephemeral: true });
  settings.setTrailMode(TrailMode.OFF);

  const sequence: SequenceData = DEMO_SEQUENCE;

  const controller = new TunnelViewController({
    getSequence: () => sequence,
    initialViewState: DEFAULT_TUNNEL_VIEW_STATE,
    persistViewState: false,
    visibilityManager: visibility,
    customColorState: createViewerCustomColorState({
      ...DEFAULT_VIEWER_CUSTOM_COLORS,
    }),
  });
  controller.applyPreset(TUNNEL_PREVIEW_PRESET);
  controller.active = true;

  let root = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let canvasReady = $state(false);
  let tunnelReady = $state(false);
  let step = $state(1);
  let matrix = $state.raw<ShapeMatrixData | null>(null);
  /** True once the mandala is drawn, or could not be. */
  let mandalaSettled = $state(false);
  /** Which flower pair the mandala shows. */
  let pairIndex = $state(0);
  /** True while a turn draws the mandala; the finished picture waits. */
  let drawing = false;
  let frame: MandalaGuideRevealFrame | null = null;
  let frameKey = "";
  let disposed = false;
  let announced = false;

  const layout = $derived(visualsPair(width, height));
  const tileColor = () =>
    visibility.isDarkMode() ? DARK_MODE_BACKGROUND : LIGHT_MODE_BACKGROUND;

  onMount(() => {
    void runAtUserVisiblePriority(async () => {
      try {
        const loaded = await loadShapeMatrix(propPairFromLegacy(getSettings()));
        if (!disposed) matrix = loaded;
      } catch (error) {
        console.warn(
          "[browse preview] Visuals could not load the matrix",
          error
        );
        if (!disposed) mandalaSettled = true;
      }
    });
  });

  onDestroy(() => {
    disposed = true;
  });

  /** The reveal frame for the pair shown, made again when anything changes. */
  function mandalaFrame(): MandalaGuideRevealFrame | null {
    const target = canvas;
    const data = matrix;
    const box = layout;
    if (!target || !data || !box) return null;
    const pair = mandalaPairAt(data.axis, pairIndex);
    if (!pair) return null;
    const colors = getSettings().primaryPropColors ?? undefined;
    const dpr =
      typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1;
    const size = Math.round(box.mandala.width);
    const key = [
      size,
      dpr,
      data.geometryKey,
      flowerKey(pair.left),
      flowerKey(pair.right),
      colors?.left,
      colors?.right,
    ].join("|");
    if (key !== frameKey || !frame) {
      frameKey = key;
      const left = data.left.get(flowerKey(pair.left));
      const right = data.right.get(flowerKey(pair.right));
      frame =
        left && right
          ? createCellRevealFrame(target, left, right, size, data.clubTipDx, {
              colors,
              dpr,
            })
          : null;
    }
    return frame;
  }

  // The finished mandala follows the box, the props and the colors.
  $effect(() => {
    const finished = mandalaFrame();
    if (!finished) return;
    if (!drawing) finished.paint(1);
    mandalaSettled = true;
  });

  // The tunnel is ready two frames after it has built, so it has painted.
  $effect(() => {
    if (tunnelReady || !canvasReady || !controller.layersReady) return;
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        tunnelReady = true;
      });
    });
    return () => cancelAnimationFrame(id);
  });

  $effect(() => {
    if (announced || !tunnelReady || !mandalaSettled) return;
    announced = true;
    untrack(() => onready());
  });

  function settle(): void {
    drawing = false;
    mandalaFrame()?.paint(1);
  }

  async function play(run: SceneRun): Promise<void> {
    if (!matrix) return;
    pairIndex += 1;
    drawing = true;
    const target = mandalaFrame();
    if (!target) {
      drawing = false;
      return;
    }
    target.paint(0);
    await playTravel(run, DRAW_MS, (value) => target.paint(value));
    drawing = false;
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div class="scene" bind:this={root} style:--accent={accent}>
  {#if layout}
    <div
      class="plinth tunnel"
      style:left="{layout.tunnel.x}px"
      style:top="{layout.tunnel.y}px"
      style:width="{layout.tunnel.width}px"
      style:height="{layout.tunnel.height}px"
      style:--tile={tileColor()}
    >
      <TunnelArtView
        decorative
        trailOverlay={false}
        {sequence}
        {controller}
        animationSettingsState={settings}
        visibilityManager={visibility}
        {playing}
        bind:currentStep={step}
        stageFit="contain"
        onCanvasReady={(element) => (canvasReady = element !== null)}
      />
    </div>
    <div
      class="plinth mandala"
      style:left="{layout.mandala.x}px"
      style:top="{layout.mandala.y}px"
      style:width="{layout.mandala.width}px"
      style:height="{layout.mandala.height}px"
    >
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* Each kind on its plinth, rounded like the visuals wall's artwork. */
  .plinth {
    position: absolute;
    overflow: hidden;
    border-radius: 12%;
  }

  .tunnel {
    background: var(--tile);
  }

  .mandala {
    background: color-mix(in srgb, var(--accent) 10%, var(--theme-card-bg));
  }

  .mandala canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
