<script lang="ts">
  /**
   * TunnelScene
   *
   * Mirrors: Tunnel. The tunnel is the real TunnelArtView, set up the way the
   * tunnel gallery's TunnelDetailPreview sets one up: its own effects,
   * visibility, and animation settings, and a controller that saves nothing.
   * The formation is Radial from TUNNEL_PRESETS, with the grid and the trail
   * overlay off. TunnelArtView's self-clock runs only while its playing prop
   * is on, and that prop follows this card's turn, so between turns the
   * canvas is still.
   *
   * The dice is the one on the base performer's card in the Tunnel tool
   * (TunnelPerformerCard): the accent dice that gives that performer a new
   * sequence. The new sequence comes from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, the performer's sequence turns an
   * eighth instead, so the tunnel still redraws.
   *
   * Finished picture: the redrawn tunnel, still. Before the first turn, the
   * demo sequence's tunnel.
   */
  import { onDestroy, tick } from "svelte";
  import { TrailMode } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { createAnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { drawMatrixRealization } from "$lib/shared/landing/data/shape-matrix-hero-pool";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import type { ViewerPlaybackState } from "$lib/shared/sequence-viewer/domain/viewer-prop-groups";
  import { createViewerCustomColorState } from "$lib/shared/sequence-viewer/state/viewer-custom-colors-state.svelte";
  import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
  import { DEFAULT_TUNNEL_VIEW_STATE } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-state";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import { cellCenter, tunnelLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    waitUntil,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";
  import {
    TUNNEL_PREVIEW_PRESET,
    TUNNEL_PREVIEW_TIMING,
    nextTunnelSequence,
  } from "./method-preview-tunnel";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  // Per-instance state, as TunnelDetailPreview does: nothing here reads or
  // writes the viewer's saved settings. Trails are off in both owners, the
  // effects config (tip effects) and the animation settings (trail mode).
  const effects = createEffectsConfigState(
    { ...DEFAULT_EFFECTS_CONFIG, tipEffectMap: {}, activeEffect: "none" },
    { persist: false }
  );
  setEffectsConfigContext(effects);

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  visibility.setGridMode("none");

  const settings = createAnimationSettingsState({ ephemeral: true });
  settings.setTrailMode(TrailMode.OFF);

  let sequence = $state.raw<SequenceData>(DEMO_SEQUENCE);

  // Its own color state, so the controller neither takes colors staged for
  // the viewer nor saves any.
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

  // TunnelArtView reads only playback.animationState.sequenceData and falls
  // back to its sequence prop when that is undefined (TunnelDetailPreview's stub).
  const playback = {
    animationState: { sequenceData: undefined },
  } as unknown as ViewerPlaybackState;

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  let canvasReady = $state(false);
  /** The stage fades out while the performer takes its new sequence. */
  let stageHidden = $state(false);
  /** Show the stage again once the tunnel has built and painted. */
  let revealWhenReady = $state(false);
  let step = $state(1);

  const layout = $derived(tunnelLayout(shape, width, height));

  let announced = false;
  /** The next turn's sequence, drawn in the background. */
  let fresh: SequenceData | null = null;
  let drawing = false;
  let sourceFailed = false;
  let disposed = false;

  onDestroy(() => {
    disposed = true;
  });

  function drawNext(): void {
    if (disposed || drawing || fresh || sourceFailed) return;
    drawing = true;
    runAtBackgroundPriority(() => {
      void drawMatrixRealization()
        .then((draw) => {
          if (!draw) sourceFailed = true;
          else if (!disposed) fresh = draw.sequence;
        })
        .catch((error: unknown) => {
          sourceFailed = true;
          console.warn(
            "[method preview] Tunnel could not draw a sequence",
            error
          );
        })
        .finally(() => {
          drawing = false;
        });
    });
  }

  // The card is ready once the first tunnel has built and painted.
  $effect(() => {
    if (announced || !canvasReady || !controller.layersReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        announced = true;
        onready();
        drawNext();
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // A hidden stage shows again two frames after its tunnel has built, so the
  // canvas has painted the new performers before anyone sees them.
  $effect(() => {
    if (!revealWhenReady || !canvasReady || !controller.layersReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        revealWhenReady = false;
        stageHidden = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // A sequence the tunnel cannot build gives way to the demo sequence.
  $effect(() => {
    const error = controller.buildError;
    if (error === null || sequence === DEMO_SEQUENCE) return;
    console.warn("[method preview] Tunnel could not build a sequence", error);
    sequence = DEMO_SEQUENCE;
  });

  function settle(): void {
    pose = null;
    if (stageHidden) revealWhenReady = true;
    drawNext();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    if (!box) return;
    const timing = TUNNEL_PREVIEW_TIMING;
    // The tunnel plays a moment before the finger comes in.
    if (!(await run.wait(timing.leadMs))) return;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = cellCenter(box.stage);
    placeGhost(finger, start.x, start.y);
    const dice = cellCenter(box.dice);
    if (!(await tapAt(finger, run, dice.x, dice.y))) return;
    // The stage fades out, and the performer takes its new sequence unseen.
    stageHidden = true;
    if (!(await run.wait(timing.fadeOutMs))) return;
    sequence = nextTunnelSequence(sequence, fresh);
    fresh = null;
    step = 1;
    // Let the controller start its rebuild, so the reveal waits for it.
    await tick();
    if (run.aborted) return;
    finger.ghost.visible = false;
    revealWhenReady = true;
    await waitUntil(run, () => !stageHidden, timing.buildWaitMs);
    if (run.aborted) return;
    if (!(await run.wait(timing.fadeInMs))) return;
    pose = null;
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--fade-out="{TUNNEL_PREVIEW_TIMING.fadeOutMs}ms"
  style:--fade-in="{TUNNEL_PREVIEW_TIMING.fadeInMs}ms"
  data-stage={stageHidden ? "hidden" : "shown"}
>
  {#if layout}
    <div
      class="tunnel"
      style:left="{layout.stage.x}px"
      style:top="{layout.stage.y}px"
      style:width="{layout.stage.size}px"
      style:height="{layout.stage.size}px"
    >
      <TunnelArtView
        decorative
        {sequence}
        {playback}
        {controller}
        animationSettingsState={settings}
        visibilityManager={visibility}
        {playing}
        bind:currentStep={step}
        stageFit="contain"
        onCanvasReady={(canvas) => (canvasReady = canvas !== null)}
      />
    </div>
    <span
      class="dice"
      class:pressed={pose?.pressed ?? false}
      style:left="{layout.dice.x}px"
      style:top="{layout.dice.y}px"
      style:width="{layout.dice.size}px"
      style:height="{layout.dice.size}px"
      style:font-size="{Math.round(layout.dice.size * 0.5)}px"
    >
      <FontAwesomeIcon icon="dice" style="solid" ariaHidden />
    </span>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* The tunnel's own dark tile, rounded like the tunnel gallery's stage. */
  .tunnel {
    position: absolute;
    overflow: hidden;
    border-radius: 12%;
    transition: opacity var(--fade-in, 260ms) ease-out;
  }

  .scene[data-stage="hidden"] .tunnel {
    opacity: 0;
    transition: opacity var(--fade-out, 180ms) ease-in;
  }

  /* The performer card's dice (TunnelPerformerCard's primary PanelButton):
     the theme accent and its glyph. */
  .dice {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 22%;
    color: var(--theme-text-on-accent, #fff);
    background: var(--theme-accent, var(--accent));
    box-shadow: 0 2px 6px
      color-mix(in srgb, var(--theme-accent, var(--accent)) 40%, transparent);
    transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dice.pressed {
    transform: scale(0.9);
  }
</style>
